import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'

export type JsonPrimitive = boolean | null | number | string
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export interface MutationProposalCheckpoint {
  proposalId: string
  proposalDigest: string
  evidenceRefs: readonly string[]
}

export interface JobTargetResult {
  target: string
  status: 'completed' | 'cancelled' | 'failed'
  detail?: string
  checkpoint?: MutationProposalCheckpoint
}

export type JobState = 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'

export interface JobRecord<I extends JsonValue = JsonValue> {
  id: string
  workflow: string
  idempotencyKey: string
  input: Readonly<I>
  targets: readonly string[]
  state: JobState
  attempt: number
  results: readonly JobTargetResult[]
  createdAt: string
  updatedAt: string
}

export interface JobStartRequest<I extends JsonValue = JsonValue> {
  workflow: string
  idempotencyKey: string
  input: I
  targets: readonly string[]
}

export class JobStoreError extends Error {
  constructor(
    readonly code: 'JOB_NOT_FOUND' | 'JOB_RECORD_INVALID' | 'JOB_STATE_INVALID' | 'JOB_WORKFLOW_MISMATCH',
    message: string,
  ) {
    super(message)
    this.name = 'JobStoreError'
  }
}

export class FileJobStore<I extends JsonValue = JsonValue> {
  private writeTail = Promise.resolve()

  private constructor(private readonly jobsDirectory: string) {}

  static async open<I extends JsonValue = JsonValue>(workspaceRoot: string): Promise<FileJobStore<I>> {
    const jobsDirectory = join(workspaceRoot, '.notemd', 'jobs')
    await mkdir(jobsDirectory, { recursive: true })
    return new FileJobStore<I>(jobsDirectory)
  }

  async start(request: JobStartRequest<I>): Promise<JobRecord<I>> {
    const workflow = normalizeWorkflow(request.workflow)
    const input = cloneJson(request.input)
    const targets = normalizeTargets(request.targets)

    if (request.idempotencyKey.trim().length === 0) {
      throw new RangeError('Job idempotency keys must not be empty.')
    }

    return this.synchronize(async () => {
      const existing = await this.findByIdempotencyKey(request.idempotencyKey)
      if (existing !== undefined) {
        return cloneRecord(existing) as JobRecord<I>
      }

      const timestamp = new Date().toISOString()
      const record: JobRecord<I> = {
        id: `notemd-job-${randomUUID()}`,
        workflow,
        idempotencyKey: request.idempotencyKey,
        input,
        targets,
        state: 'queued',
        attempt: 0,
        results: [],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      await this.persist(record)
      return cloneRecord(record) as JobRecord<I>
    })
  }

  async get(id: string): Promise<JobRecord<I> | undefined> {
    const record = await this.readById(id)
    return record === undefined ? undefined : (cloneRecord(record) as JobRecord<I>)
  }

  async list(): Promise<readonly JobRecord<I>[]> {
    const records = await this.readAll()
    return records
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((record) => cloneRecord(record) as JobRecord<I>)
  }

  async markRunning(id: string): Promise<JobRecord<I>> {
    return this.update(id, (record) => {
      if (record.state !== 'queued') {
        return record
      }
      return startExecution(record)
    })
  }

  async beginExecution(id: string, workflow: string): Promise<JobRecord<I>> {
    const normalizedWorkflow = normalizeWorkflow(workflow)
    return this.update(id, (record) => {
      if (record.workflow !== normalizedWorkflow) {
        throw new JobStoreError('JOB_WORKFLOW_MISMATCH', `Job ${id} belongs to workflow ${record.workflow}.`)
      }
      if (record.state !== 'queued') {
        throw new JobStoreError('JOB_STATE_INVALID', `Job ${id} cannot begin from ${record.state}.`)
      }
      return startExecution(record)
    })
  }

  async recordTargetCheckpoint(id: string, result: JobTargetResult): Promise<JobRecord<I>> {
    const safeResult = normalizeTargetResult(result)
    return this.update(id, (record) => {
      if (record.state !== 'running' && record.state !== 'cancelling') {
        throw new JobStoreError('JOB_STATE_INVALID', `Job ${id} cannot record a checkpoint from ${record.state}.`)
      }
      if (!record.targets.includes(safeResult.target)) {
        throw new JobStoreError('JOB_RECORD_INVALID', `Job ${id} checkpoint targets an unknown path.`)
      }
      if (record.results.some((known) => known.target === safeResult.target)) {
        return record
      }
      return {
        ...record,
        results: [...record.results, safeResult],
        updatedAt: new Date().toISOString(),
      }
    })
  }

  async finishExecution(id: string): Promise<JobRecord<I>> {
    return this.update(id, (record) => {
      if (isTerminal(record.state)) {
        return record
      }
      if (record.state !== 'running' && record.state !== 'cancelling') {
        throw new JobStoreError('JOB_STATE_INVALID', `Job ${id} cannot finish from ${record.state}.`)
      }

      const remainingTargets = pendingTargets(record)
      if (record.state === 'running' && remainingTargets.length > 0) {
        throw new JobStoreError('JOB_STATE_INVALID', `Job ${id} has uncheckpointed targets.`)
      }
      const results = record.state === 'cancelling'
        ? [...record.results, ...remainingTargets.map((target) => ({ target, status: 'cancelled' as const }))]
        : record.results
      const state = record.state === 'cancelling'
        ? 'cancelled'
        : results.some((result) => result.status === 'failed')
          ? 'failed'
          : results.some((result) => result.status === 'cancelled')
            ? 'cancelled'
            : 'completed'
      return { ...record, state, results, updatedAt: new Date().toISOString() }
    })
  }

  async failExecution(id: string, detail: string): Promise<JobRecord<I>> {
    return this.update(id, (record) => {
      if (isTerminal(record.state)) {
        return record
      }
      return {
        ...record,
        state: 'failed',
        results: [...record.results, ...pendingTargets(record).map((target) => ({ target, status: 'failed' as const, detail }))],
        updatedAt: new Date().toISOString(),
      }
    })
  }

  async recoverInterrupted(): Promise<readonly JobRecord<I>[]> {
    return this.synchronize(async () => {
      const records = await this.readAll()
      const recovered: JobRecord<I>[] = []

      for (const record of records) {
        const next = record.state === 'running'
          ? { ...record, state: 'queued' as const, updatedAt: new Date().toISOString() }
          : record.state === 'cancelling'
            ? { ...record, state: 'cancelled' as const, updatedAt: new Date().toISOString() }
            : record
        if (next !== record) {
          await this.persist(next)
          recovered.push(cloneRecord(next) as JobRecord<I>)
        }
      }

      return recovered
    })
  }

  async complete(id: string, results: readonly JobTargetResult[]): Promise<JobRecord<I>> {
    const safeResults = normalizeResults(results)
    return this.update(id, (record) => {
      if (isTerminal(record.state)) {
        return record
      }

      const state = safeResults.some((result) => result.status === 'failed')
        ? 'failed'
        : safeResults.some((result) => result.status === 'cancelled')
          ? 'cancelled'
          : 'completed'
      return { ...record, state, results: safeResults, updatedAt: new Date().toISOString() }
    })
  }

  async cancel(id: string): Promise<JobRecord<I>> {
    return this.update(id, (record) => {
      if (isTerminal(record.state) || record.state === 'cancelling') {
        return record
      }
      return {
        ...record,
        state: record.state === 'running' ? 'cancelling' : 'cancelled',
        updatedAt: new Date().toISOString(),
      }
    })
  }

  private async update(
    id: string,
    transform: (record: JobRecord<JsonValue>) => JobRecord<JsonValue>,
  ): Promise<JobRecord<I>> {
    return this.synchronize(async () => {
      const record = await this.readById(id)
      if (record === undefined) {
        throw new JobStoreError('JOB_NOT_FOUND', `Job does not exist: ${id}`)
      }
      const updated = transform(record)
      if (updated !== record) {
        await this.persist(updated)
      }
      return cloneRecord(updated) as JobRecord<I>
    })
  }

  private async findByIdempotencyKey(idempotencyKey: string): Promise<JobRecord<JsonValue> | undefined> {
    const records = await this.readAll()
    return records.find((record) => record.idempotencyKey === idempotencyKey)
  }

  private async readAll(): Promise<JobRecord<JsonValue>[]> {
    const entries = await readdir(this.jobsDirectory, { withFileTypes: true })
    const records: JobRecord<JsonValue>[] = []

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }
      records.push(await this.readRecordFile(join(this.jobsDirectory, entry.name)))
    }

    return records
  }

  private async readById(id: string): Promise<JobRecord<JsonValue> | undefined> {
    if (!/^notemd-job-[a-z0-9-]+$/iu.test(id)) {
      throw new JobStoreError('JOB_NOT_FOUND', `Job does not exist: ${id}`)
    }

    try {
      return await this.readRecordFile(join(this.jobsDirectory, `${id}.json`))
    } catch (error) {
      if (isMissingPath(error)) {
        return undefined
      }
      throw error
    }
  }

  private async readRecordFile(path: string): Promise<JobRecord<JsonValue>> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(path, 'utf8'))
    } catch (error) {
      if (isMissingPath(error)) {
        throw error
      }
      throw new JobStoreError('JOB_RECORD_INVALID', `Job record cannot be parsed: ${path}`)
    }
    return parseJobRecord(parsed, path)
  }

  private async persist(record: JobRecord<JsonValue>): Promise<void> {
    const destination = join(this.jobsDirectory, `${record.id}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`

    try {
      await writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, destination)
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined)
      throw error
    }
  }

  private async synchronize<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.writeTail
    let release!: () => void
    this.writeTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await predecessor

    try {
      return await operation()
    } finally {
      release()
    }
  }
}

export function pendingTargets(record: Pick<JobRecord, 'targets' | 'results'>): readonly string[] {
  const completedTargets = new Set(record.results.map((result) => result.target))
  return record.targets.filter((target) => !completedTargets.has(target))
}

function startExecution(record: JobRecord<JsonValue>): JobRecord<JsonValue> {
  return {
    ...record,
    state: 'running',
    attempt: record.attempt + 1,
    updatedAt: new Date().toISOString(),
  }
}

function parseJobRecord(value: unknown, path: string): JobRecord<JsonValue> {
  if (!isObject(value)) {
    throw invalidRecord(path)
  }

  const id = stringProperty(value, 'id', path)
  const workflowValue = value.workflow
  const workflow = workflowValue === undefined ? 'legacy-unknown' : normalizeWorkflow(stringProperty(value, 'workflow', path))
  const idempotencyKey = stringProperty(value, 'idempotencyKey', path)
  const input = value.input
  assertJsonValue(input)
  const targets = normalizeTargets(arrayProperty(value, 'targets', path))
  const state = stateProperty(value, path)
  const attempt = attemptProperty(value, path)
  const results = normalizeResults(arrayProperty(value, 'results', path).map((result) => parseTargetResult(result, path)))
  if (results.some((result) => !targets.includes(result.target))) {
    throw invalidRecord(path)
  }

  return {
    id,
    workflow,
    idempotencyKey,
    input,
    targets,
    state,
    attempt,
    results,
    createdAt: stringProperty(value, 'createdAt', path),
    updatedAt: stringProperty(value, 'updatedAt', path),
  }
}

function parseTargetResult(value: unknown, path: string): JobTargetResult {
  if (!isObject(value)) {
    throw invalidRecord(path)
  }
  const target = stringProperty(value, 'target', path)
  const status = value.status
  if (status !== 'completed' && status !== 'cancelled' && status !== 'failed') {
    throw invalidRecord(path)
  }
  const detail = value.detail
  if (detail !== undefined && typeof detail !== 'string') {
    throw invalidRecord(path)
  }
  const checkpoint = value.checkpoint
  const parsedCheckpoint = checkpoint === undefined ? undefined : parseMutationProposalCheckpoint(checkpoint, path)
  return normalizeTargetResult({
    target,
    status,
    ...(detail === undefined ? {} : { detail }),
    ...(parsedCheckpoint === undefined ? {} : { checkpoint: parsedCheckpoint }),
  })
}

function normalizeTargets(targets: readonly unknown[]): readonly string[] {
  if (targets.some((target) => typeof target !== 'string' || target.length === 0)) {
    throw new RangeError('Job targets must be non-empty strings.')
  }
  if (new Set(targets).size !== targets.length) {
    throw new RangeError('Job targets must not contain duplicates.')
  }
  return Object.freeze([...targets] as string[])
}

function normalizeWorkflow(workflow: string): string {
  if (!/^[a-z][a-z0-9-]{0,79}$/u.test(workflow)) {
    throw new RangeError('Job workflow names must be lowercase kebab-case identifiers.')
  }
  return workflow
}

function normalizeResults(results: readonly JobTargetResult[]): readonly JobTargetResult[] {
  const normalized = results.map(normalizeTargetResult)
  if (new Set(normalized.map((result) => result.target)).size !== normalized.length) {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job results must contain at most one checkpoint per target.')
  }
  return normalized
}

function normalizeTargetResult(result: JobTargetResult): JobTargetResult {
  if (typeof result.target !== 'string' || result.target.length === 0) {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job result targets must be non-empty strings.')
  }
  if (result.status !== 'completed' && result.status !== 'cancelled' && result.status !== 'failed') {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job result status is invalid.')
  }
  if (result.detail !== undefined && typeof result.detail !== 'string') {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job result detail must be a string.')
  }
  const checkpoint = result.checkpoint === undefined ? undefined : normalizeMutationProposalCheckpoint(result.checkpoint)
  return {
    target: result.target,
    status: result.status,
    ...(result.detail === undefined ? {} : { detail: result.detail }),
    ...(checkpoint === undefined ? {} : { checkpoint }),
  }
}

export function createMutationProposalCheckpoint(plan: WorkspaceMutationPlan): MutationProposalCheckpoint {
  return normalizeMutationProposalCheckpoint({
    proposalId: plan.id,
    proposalDigest: plan.digest,
    evidenceRefs: plan.provenance.evidenceRefs,
  })
}

function parseMutationProposalCheckpoint(value: unknown, path: string): MutationProposalCheckpoint {
  if (!isObject(value)) {
    throw invalidRecord(path)
  }
  try {
    return normalizeMutationProposalCheckpoint({
      proposalId: stringProperty(value, 'proposalId', path),
      proposalDigest: stringProperty(value, 'proposalDigest', path),
      evidenceRefs: arrayProperty(value, 'evidenceRefs', path).map((reference) => {
        if (typeof reference !== 'string') {
          throw invalidRecord(path)
        }
        return reference
      }),
    })
  } catch (error) {
    if (error instanceof JobStoreError) {
      throw error
    }
    throw invalidRecord(path)
  }
}

function normalizeMutationProposalCheckpoint(checkpoint: MutationProposalCheckpoint): MutationProposalCheckpoint {
  if (
    typeof checkpoint.proposalId !== 'string' ||
    checkpoint.proposalId.trim().length === 0 ||
    !/^[a-f0-9]{64}$/u.test(checkpoint.proposalDigest) ||
    !Array.isArray(checkpoint.evidenceRefs) ||
    checkpoint.evidenceRefs.some((reference) => typeof reference !== 'string' || reference.trim().length === 0)
  ) {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job checkpoints must contain only a mutation proposal identity and evidence references.')
  }
  const evidenceRefs = [...checkpoint.evidenceRefs].sort()
  if (new Set(evidenceRefs).size !== evidenceRefs.length) {
    throw new JobStoreError('JOB_RECORD_INVALID', 'Job checkpoint evidence references must not contain duplicates.')
  }
  return Object.freeze({
    proposalId: checkpoint.proposalId,
    proposalDigest: checkpoint.proposalDigest,
    evidenceRefs: Object.freeze(evidenceRefs),
  })
}

function cloneJson<T extends JsonValue>(value: T): T {
  assertJsonValue(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneTargetResult(result: JobTargetResult): JobTargetResult {
  return normalizeTargetResult(result)
}

function cloneRecord(record: JobRecord<JsonValue>): JobRecord<JsonValue> {
  return {
    id: record.id,
    workflow: record.workflow,
    idempotencyKey: record.idempotencyKey,
    input: cloneJson(record.input),
    targets: [...record.targets],
    state: record.state,
    attempt: record.attempt,
    results: record.results.map(cloneTargetResult),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function assertJsonValue(value: unknown, ancestors = new Set<object>()): asserts value is JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return
    }
    throw new TypeError('Job input must contain finite JSON numbers.')
  }
  if (!isObject(value)) {
    throw new TypeError('Job input must be JSON serializable.')
  }
  if (ancestors.has(value)) {
    throw new TypeError('Job input must not contain cyclic data.')
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      value.forEach((item) => assertJsonValue(item, ancestors))
      return
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError('Job input must contain plain JSON objects.')
    }
    Object.values(value).forEach((item) => assertJsonValue(item, ancestors))
  } finally {
    ancestors.delete(value)
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function arrayProperty(value: Record<string, unknown>, key: string, path: string): readonly unknown[] {
  const property = value[key]
  if (!Array.isArray(property)) {
    throw invalidRecord(path)
  }
  return property
}

function stringProperty(value: Record<string, unknown>, key: string, path: string): string {
  const property = value[key]
  if (typeof property !== 'string') {
    throw invalidRecord(path)
  }
  return property
}

function stateProperty(value: Record<string, unknown>, path: string): JobState {
  const state = value.state
  if (
    state === 'queued' ||
    state === 'running' ||
    state === 'cancelling' ||
    state === 'completed' ||
    state === 'cancelled' ||
    state === 'failed'
  ) {
    return state
  }
  throw invalidRecord(path)
}

function attemptProperty(value: Record<string, unknown>, path: string): number {
  const attempt = value.attempt
  if (attempt === undefined) {
    return 0
  }
  if (typeof attempt !== 'number' || !Number.isSafeInteger(attempt) || attempt < 0) {
    throw invalidRecord(path)
  }
  return attempt
}

function invalidRecord(path: string): JobStoreError {
  return new JobStoreError('JOB_RECORD_INVALID', `Job record has an invalid shape: ${path}`)
}

function isTerminal(state: JobState): boolean {
  return state === 'completed' || state === 'cancelled' || state === 'failed'
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
