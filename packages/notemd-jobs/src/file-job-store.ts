import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type JsonPrimitive = boolean | null | number | string
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }

export interface JobTargetResult {
  target: string
  status: 'completed' | 'cancelled' | 'failed'
  detail?: string
}

export type JobState = 'queued' | 'running' | 'completed' | 'cancelled' | 'failed'

export interface JobRecord<I extends JsonValue = JsonValue> {
  id: string
  idempotencyKey: string
  input: Readonly<I>
  targets: readonly string[]
  state: JobState
  results: readonly JobTargetResult[]
  createdAt: string
  updatedAt: string
}

export interface JobStartRequest<I extends JsonValue = JsonValue> {
  idempotencyKey: string
  input: I
  targets: readonly string[]
}

export class JobStoreError extends Error {
  constructor(
    readonly code: 'JOB_NOT_FOUND' | 'JOB_RECORD_INVALID',
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
        idempotencyKey: request.idempotencyKey,
        input,
        targets,
        state: 'queued',
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
      return { ...record, state: 'running', updatedAt: new Date().toISOString() }
    })
  }

  async complete(id: string, results: readonly JobTargetResult[]): Promise<JobRecord<I>> {
    const safeResults = results.map(cloneTargetResult)
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
      if (isTerminal(record.state)) {
        return record
      }
      return { ...record, state: 'cancelled', updatedAt: new Date().toISOString() }
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

function parseJobRecord(value: unknown, path: string): JobRecord<JsonValue> {
  if (!isObject(value)) {
    throw invalidRecord(path)
  }

  const id = stringProperty(value, 'id', path)
  const idempotencyKey = stringProperty(value, 'idempotencyKey', path)
  const input = value.input
  assertJsonValue(input)
  const targets = normalizeTargets(arrayProperty(value, 'targets', path))
  const state = stateProperty(value, path)
  const resultsValue = arrayProperty(value, 'results', path)
  const results = resultsValue.map((result) => parseTargetResult(result, path))

  return {
    id,
    idempotencyKey,
    input,
    targets,
    state,
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
  if (detail === undefined) {
    return { target, status }
  }
  if (typeof detail !== 'string') {
    throw invalidRecord(path)
  }
  return { target, status, detail }
}

function normalizeTargets(targets: readonly unknown[]): readonly string[] {
  if (targets.some((target) => typeof target !== 'string' || target.length === 0)) {
    throw new RangeError('Job targets must be non-empty strings.')
  }
  return Object.freeze([...targets] as string[])
}

function cloneTargetResult(result: JobTargetResult): JobTargetResult {
  if (result.detail === undefined) {
    return { target: result.target, status: result.status }
  }
  return { target: result.target, status: result.status, detail: result.detail }
}

function cloneJson<T extends JsonValue>(value: T): T {
  assertJsonValue(value)
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneRecord(record: JobRecord<JsonValue>): JobRecord<JsonValue> {
  return {
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    input: cloneJson(record.input),
    targets: [...record.targets],
    state: record.state,
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
  if (state === 'queued' || state === 'running' || state === 'completed' || state === 'cancelled' || state === 'failed') {
    return state
  }
  throw invalidRecord(path)
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
