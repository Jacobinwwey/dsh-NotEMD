import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  ContentSha256,
  WorkspaceMutation,
  WorkspaceMutationPlan,
} from '@notemd-harness/mutation'

import { writeDurableFile, writeNewDurableFile } from './staged-asset-store.js'

export const localMutationJournalStates = [
  'prepared',
  'staged',
  'applying',
  'verified',
  'committed',
  'recovering',
  'rolled-back',
  'failed',
] as const

export type LocalMutationJournalState = (typeof localMutationJournalStates)[number]
export type MutationJournalPhase = 'pending' | 'backup-created' | 'applied'
export type MutationOriginalPresence = 'unknown' | 'absent' | 'present'

export interface LocalMutationJournalEntry {
  index: number
  destination: string
  kind: WorkspaceMutation['kind']
  expectedRevision: string | 'absent'
  contentSha256?: ContentSha256
  expectedContentSha256?: ContentSha256
  originalPresence: MutationOriginalPresence
  phase: MutationJournalPhase
}

export interface LocalMutationJournalRecord {
  version: 1
  planId: string
  planDigest: ContentSha256
  state: LocalMutationJournalState
  stagingCleanup: 'pending' | 'complete'
  mutations: LocalMutationJournalEntry[]
}

export class MutationJournalCorruptionError extends Error {
  readonly code = 'MUTATION_JOURNAL_CORRUPT'

  constructor(message: string) {
    super(message)
    this.name = 'MutationJournalCorruptionError'
  }
}

export class MutationJournalAlreadyPreparedError extends Error {
  readonly code = 'MUTATION_JOURNAL_ALREADY_PREPARED'

  constructor(planId: string) {
    super(`A mutation journal already exists for ${planId}. Recover it before retrying the proposal.`)
    this.name = 'MutationJournalAlreadyPreparedError'
  }
}

export class LocalMutationJournal {
  private constructor(private readonly journalDirectory: string) {}

  static async open(workspaceRoot: string): Promise<LocalMutationJournal> {
    const journalDirectory = join(workspaceRoot, '.notemd', 'mutations')
    return new LocalMutationJournal(journalDirectory)
  }

  async prepare(plan: WorkspaceMutationPlan): Promise<LocalMutationJournalRecord> {
    const record: LocalMutationJournalRecord = {
      version: 1,
      planId: plan.id,
      planDigest: plan.digest,
      state: 'prepared',
      stagingCleanup: 'pending',
      mutations: plan.mutations.map(createJournalEntry),
    }
    try {
      await writeNewDurableFile(this.pathFor(record.planId), Buffer.from(JSON.stringify(record), 'utf8'))
    } catch (error) {
      if (isExistingPath(error)) {
        throw new MutationJournalAlreadyPreparedError(plan.id)
      }
      throw error
    }
    return record
  }

  async transition(
    record: LocalMutationJournalRecord,
    nextState: LocalMutationJournalState,
  ): Promise<LocalMutationJournalRecord> {
    if (!canTransition(record.state, nextState)) {
      throw new RangeError(`Mutation journal cannot transition from ${record.state} to ${nextState}.`)
    }
    record.state = nextState
    await this.persist(record)
    return record
  }

  async recordOriginalPresence(
    record: LocalMutationJournalRecord,
    originalPresence: readonly MutationOriginalPresence[],
  ): Promise<LocalMutationJournalRecord> {
    if (record.mutations.length !== originalPresence.length) {
      throw new RangeError('Mutation journal original-presence entries must match the plan mutation count.')
    }

    for (const [index, presence] of originalPresence.entries()) {
      const mutation = record.mutations[index]
      if (mutation === undefined) {
        throw new Error('Mutation journal lost an entry before recording original presence.')
      }
      mutation.originalPresence = presence
    }
    await this.persist(record)
    return record
  }

  async markMutationPhase(
    record: LocalMutationJournalRecord,
    index: number,
    phase: MutationJournalPhase,
  ): Promise<LocalMutationJournalRecord> {
    const mutation = record.mutations[index]
    if (mutation === undefined) {
      throw new RangeError(`Mutation journal has no entry at index ${index}.`)
    }
    mutation.phase = phase
    await this.persist(record)
    return record
  }

  async markStagingCleaned(record: LocalMutationJournalRecord): Promise<LocalMutationJournalRecord> {
    if (record.state !== 'committed' && record.state !== 'rolled-back') {
      throw new RangeError('Only completed mutation journals may mark staging cleanup complete.')
    }
    record.stagingCleanup = 'complete'
    await this.persist(record)
    return record
  }

  async listRecoverable(): Promise<readonly LocalMutationJournalRecord[]> {
    return this.listRecords((record) => !isTerminalState(record.state))
  }

  async listPendingStagingCleanup(): Promise<readonly LocalMutationJournalRecord[]> {
    return this.listRecords(
      (record) =>
        (record.state === 'committed' || record.state === 'rolled-back') &&
        record.stagingCleanup === 'pending',
    )
  }

  private async listRecords(
    shouldInclude: (record: LocalMutationJournalRecord) => boolean,
  ): Promise<readonly LocalMutationJournalRecord[]> {
    let entries
    try {
      entries = await readdir(this.journalDirectory, { withFileTypes: true })
    } catch (error) {
      if (isMissingPath(error)) {
        return []
      }
      throw error
    }
    const records: LocalMutationJournalRecord[] = []

    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue
      }
      const record = await this.load(entry.name.slice(0, -'.json'.length))
      if (shouldInclude(record)) {
        records.push(record)
      }
    }
    return records
  }

  async load(planId: string): Promise<LocalMutationJournalRecord> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.pathFor(planId), 'utf8'))
    } catch (error) {
      throw new MutationJournalCorruptionError(`Cannot read mutation journal ${planId}: ${diagnostic(error)}`)
    }

    if (!isJournalRecord(parsed)) {
      throw new MutationJournalCorruptionError(`Mutation journal ${planId} has an invalid record shape.`)
    }
    return parsed
  }

  private async persist(record: LocalMutationJournalRecord): Promise<void> {
    await writeDurableFile(this.pathFor(record.planId), Buffer.from(JSON.stringify(record), 'utf8'))
  }

  private pathFor(planId: string): string {
    if (!/^notemd-mutation-[a-f0-9]{20}$/u.test(planId)) {
      throw new RangeError('A mutation journal plan id must be a content-addressed mutation id.')
    }
    return join(this.journalDirectory, `${planId}.json`)
  }
}

function createJournalEntry(mutation: WorkspaceMutation, index: number): LocalMutationJournalEntry {
  const entry: LocalMutationJournalEntry = {
    index,
    destination: mutation.destination,
    kind: mutation.kind,
    expectedRevision: mutation.expectedRevision,
    originalPresence: 'unknown',
    phase: 'pending',
  }

  if (mutation.kind === 'delete') {
    entry.expectedContentSha256 = mutation.expectedContentSha256
  } else {
    entry.contentSha256 = mutation.contentSha256
  }
  return entry
}

function canTransition(current: LocalMutationJournalState, next: LocalMutationJournalState): boolean {
  const allowed: Readonly<Record<LocalMutationJournalState, readonly LocalMutationJournalState[]>> = {
    prepared: ['staged', 'recovering'],
    staged: ['applying', 'recovering'],
    applying: ['verified', 'recovering'],
    verified: ['committed', 'recovering'],
    committed: [],
    recovering: ['rolled-back', 'failed'],
    'rolled-back': [],
    failed: [],
  }
  return allowed[current].includes(next)
}

function isTerminalState(state: LocalMutationJournalState): boolean {
  return state === 'committed' || state === 'rolled-back' || state === 'failed'
}

function isJournalRecord(value: unknown): value is LocalMutationJournalRecord {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<LocalMutationJournalRecord>
  return (
    candidate.version === 1 &&
    typeof candidate.planId === 'string' &&
    /^[a-f0-9]{64}$/u.test(candidate.planDigest ?? '') &&
    localMutationJournalStates.includes(candidate.state as LocalMutationJournalState) &&
    (candidate.stagingCleanup === 'pending' || candidate.stagingCleanup === 'complete') &&
    Array.isArray(candidate.mutations) &&
    candidate.mutations.every(isJournalEntry)
  )
}

function isJournalEntry(value: unknown): value is LocalMutationJournalEntry {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<LocalMutationJournalEntry>
  return (
    Number.isSafeInteger(candidate.index) &&
    typeof candidate.destination === 'string' &&
    (candidate.kind === 'write-text' || candidate.kind === 'write-bytes' || candidate.kind === 'delete') &&
    typeof candidate.expectedRevision === 'string' &&
    (candidate.originalPresence === 'unknown' || candidate.originalPresence === 'absent' || candidate.originalPresence === 'present') &&
    (candidate.phase === 'pending' || candidate.phase === 'backup-created' || candidate.phase === 'applied')
  )
}

function isExistingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
