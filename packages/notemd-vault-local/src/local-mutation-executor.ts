import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  createWorkspaceMutationReceipt,
  type MutationReceiptEntryDraft,
  type RecoveredMutation,
  type WorkspaceMutation,
  type WorkspaceMutationExecutor,
  type WorkspaceMutationPlan,
  type WorkspaceMutationReceipt,
  type WorkspaceMutationReceiptStatus,
} from '@notemd-harness/mutation'

import {
  LocalMutationJournal,
  MutationJournalAlreadyPreparedError,
  type LocalMutationJournalEntry,
  type LocalMutationJournalRecord,
  type LocalMutationJournalState,
  type MutationOriginalPresence,
} from './local-mutation-journal.js'
import { VaultBoundaryError, VaultPathBoundary, VaultPathError } from './path-boundary.js'
import {
  createBinarySha256,
  StagedAssetIntegrityError,
  StagedAssetStore,
  writeDurableFile,
} from './staged-asset-store.js'
import { TargetWriteLocks } from './write-lock.js'

export interface LocalMutationLifecycleObserver {
  afterJournalState(state: LocalMutationJournalState, plan: WorkspaceMutationPlan): void | Promise<void>
  afterMutationApplied?(destination: string, plan: WorkspaceMutationPlan): void | Promise<void>
}

export interface LocalMutationExecutorDependencies {
  readonly lifecycleObserver?: LocalMutationLifecycleObserver
  readonly targetWriteLocks?: TargetWriteLocks
}

interface PreparedMutationTarget {
  readonly index: number
  readonly mutation: WorkspaceMutation
  readonly absolutePath: string
  readonly originalPresence: Exclude<MutationOriginalPresence, 'unknown'>
  readonly originalSha256?: string
}

interface StagedPlanPayloads {
  readonly root: string
  readonly payloadPaths: readonly (string | undefined)[]
}

class MutationConflictError extends Error {
  readonly code = 'MUTATION_CONFLICT'

  constructor(message: string) {
    super(message)
    this.name = 'MutationConflictError'
  }
}

export class LocalMutationExecutor implements WorkspaceMutationExecutor {
  private constructor(
    private readonly boundary: VaultPathBoundary,
    private readonly workspaceRoot: string,
    private readonly locks: TargetWriteLocks,
    private readonly journal: LocalMutationJournal,
    private readonly stagedAssets: StagedAssetStore,
    private readonly lifecycleObserver?: LocalMutationLifecycleObserver,
  ) {}

  static async open(
    workspaceRoot: string,
    dependencies: LocalMutationExecutorDependencies = {},
  ): Promise<LocalMutationExecutor> {
    const boundary = await VaultPathBoundary.open(workspaceRoot)
    const canonicalRoot = boundary.workspaceRoot
    const [journal, stagedAssets] = await Promise.all([
      LocalMutationJournal.open(canonicalRoot),
      StagedAssetStore.open(canonicalRoot),
    ])
    return new LocalMutationExecutor(
      boundary,
      canonicalRoot,
      dependencies.targetWriteLocks ?? new TargetWriteLocks(),
      journal,
      stagedAssets,
      dependencies.lifecycleObserver,
    )
  }

  async apply(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt> {
    let record: LocalMutationJournalRecord | undefined

    try {
      throwIfAborted(signal)
      const preparedRecord = await this.journal.prepare(plan)
      record = preparedRecord
      await this.notifyState(preparedRecord.state, plan)

      const staged = await this.stagePlan(plan)
      await this.journal.transition(preparedRecord, 'staged')
      await this.notifyState(preparedRecord.state, plan)

      const lockKeys = plan.mutations.map((mutation) => this.boundary.lockKey(mutation.destination))
      return await this.locks.runAll(lockKeys, () => this.applyWithLocks(plan, preparedRecord, staged, signal))
    } catch (error) {
      if (record?.state === 'committed') {
        return this.receipt(plan, 'committed', 'mutation-finalization-interrupted')
      }
      return this.failureReceipt(plan, error)
    }
  }

  async recover(signal?: AbortSignal): Promise<readonly RecoveredMutation[]> {
    const recoverable = await this.journal.listRecoverable()
    const pendingStagingCleanup = await this.journal.listPendingStagingCleanup()
    const recovered: RecoveredMutation[] = []

    for (const record of recoverable) {
      try {
        throwIfAborted(signal)
        const lockKeys = record.mutations.map((mutation) => this.boundary.lockKey(mutation.destination))
        const outcome = await this.locks.runAll(lockKeys, () => this.recoverRecord(record, signal))
        recovered.push({
          planId: record.planId,
          planDigest: record.planDigest,
          outcome,
        })
      } catch (error) {
        if (isAbortError(error)) {
          throw error
        }
        await this.markRecoveryFailed(record)
        recovered.push({
          planId: record.planId,
          planDigest: record.planDigest,
          outcome: 'failed',
        })
      }
    }

    for (const record of pendingStagingCleanup) {
      try {
        throwIfAborted(signal)
        await this.finalizePlanStaging(record)
        recovered.push({
          planId: record.planId,
          planDigest: record.planDigest,
          outcome: record.state === 'committed' ? 'committed' : 'rolled-back',
        })
      } catch (error) {
        if (isAbortError(error)) {
          throw error
        }
        recovered.push({
          planId: record.planId,
          planDigest: record.planDigest,
          outcome: 'failed',
        })
      }
    }

    return recovered
  }

  private async recoverRecord(
    record: LocalMutationJournalRecord,
    signal?: AbortSignal,
  ): Promise<'committed' | 'rolled-back'> {
    throwIfAborted(signal)

    if (record.state === 'verified') {
      await this.verifyRecoveredCommit(record)
      await this.journal.transition(record, 'committed')
      await this.finalizePlanStaging(record)
      return 'committed'
    }

    if (record.state !== 'recovering') {
      await this.journal.transition(record, 'recovering')
    }
    await this.rollback(record)
    await this.journal.transition(record, 'rolled-back')
    await this.finalizePlanStaging(record)
    return 'rolled-back'
  }

  private async markRecoveryFailed(record: LocalMutationJournalRecord): Promise<void> {
    if (record.state === 'recovering') {
      await this.journal.transition(record, 'failed')
      return
    }
    if (record.state === 'verified') {
      await this.journal.transition(record, 'recovering')
      await this.journal.transition(record, 'failed')
    }
  }

  private async applyWithLocks(
    plan: WorkspaceMutationPlan,
    record: LocalMutationJournalRecord,
    staged: StagedPlanPayloads,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationReceipt> {
    throwIfAborted(signal)
    const targets = await this.preflight(plan, signal)
    await this.journal.recordOriginalPresence(
      record,
      targets.map((target) => target.originalPresence),
    )
    await this.journal.transition(record, 'applying')
    await this.notifyState(record.state, plan)

    for (const target of targets) {
      throwIfAborted(signal)
      await this.assertTargetStillMatches(target)
      await this.applyTarget(plan, record, staged, target)
      await this.lifecycleObserver?.afterMutationApplied?.(target.mutation.destination, plan)
    }

    await this.verifyTargets(targets)
    await this.journal.transition(record, 'verified')
    await this.notifyState(record.state, plan)
    await this.journal.transition(record, 'committed')
    await this.notifyState(record.state, plan)
    await this.finalizePlanStaging(record)
    return this.committedReceipt(plan)
  }

  private async stagePlan(plan: WorkspaceMutationPlan): Promise<StagedPlanPayloads> {
    const root = this.planStagingRoot(plan.id)
    const payloadDirectory = join(root, 'payloads')
    await mkdir(payloadDirectory, { recursive: true })
    const payloadPaths: (string | undefined)[] = []

    for (const [index, mutation] of plan.mutations.entries()) {
      if (mutation.kind === 'delete') {
        payloadPaths.push(undefined)
        continue
      }

      const payload = mutation.kind === 'write-text'
        ? Buffer.from(mutation.content, 'utf8')
        : await this.stagedAssets.readBytes(mutation.stagedAsset)
      if (createBinarySha256(payload) !== mutation.contentSha256) {
        throw new StagedAssetIntegrityError(`Mutation payload digest does not match: ${mutation.destination}`)
      }

      const payloadPath = join(payloadDirectory, `${index.toString().padStart(6, '0')}.payload`)
      await writeDurableFile(payloadPath, payload)
      payloadPaths.push(payloadPath)
    }

    return { root, payloadPaths: Object.freeze(payloadPaths) }
  }

  private async preflight(
    plan: WorkspaceMutationPlan,
    signal?: AbortSignal,
  ): Promise<readonly PreparedMutationTarget[]> {
    const targets: PreparedMutationTarget[] = []

    for (const [index, mutation] of plan.mutations.entries()) {
      throwIfAborted(signal)
      const resolved = await this.resolveMutationTarget(mutation)
      const existing = await readExistingBytes(resolved.absolutePath)
      const originalSha256 = existing === undefined ? undefined : createBinarySha256(existing)

      if (!matchesExpectedRevision(mutation, existing, originalSha256)) {
        throw new MutationConflictError(`Workspace revision changed before mutation: ${mutation.destination}`)
      }
      if (
        mutation.kind === 'delete' &&
        (originalSha256 === undefined || originalSha256 !== mutation.expectedContentSha256)
      ) {
        throw new MutationConflictError(`Workspace content changed before deletion: ${mutation.destination}`)
      }

      targets.push(
        originalSha256 === undefined
          ? {
              index,
              mutation,
              absolutePath: resolved.absolutePath,
              originalPresence: 'absent',
            }
          : {
              index,
              mutation,
              absolutePath: resolved.absolutePath,
              originalPresence: 'present',
              originalSha256,
            },
      )
    }

    return targets
  }

  private async assertTargetStillMatches(target: PreparedMutationTarget): Promise<void> {
    const resolved = await this.resolveMutationTarget(target.mutation)
    const current = await readExistingBytes(resolved.absolutePath)
    const currentSha256 = current === undefined ? undefined : createBinarySha256(current)

    if (target.originalPresence === 'absent') {
      if (current !== undefined) {
        throw new MutationConflictError(`Workspace target appeared during mutation: ${target.mutation.destination}`)
      }
      return
    }

    if (currentSha256 !== target.originalSha256) {
      throw new MutationConflictError(`Workspace target changed during mutation: ${target.mutation.destination}`)
    }
  }

  private async applyTarget(
    plan: WorkspaceMutationPlan,
    record: LocalMutationJournalRecord,
    staged: StagedPlanPayloads,
    target: PreparedMutationTarget,
  ): Promise<void> {
    const resolved = await this.resolveMutationTarget(target.mutation)
    const root = staged.root

    if (target.mutation.kind === 'delete') {
      const quarantinePath = join(root, 'quarantine', `${target.index.toString().padStart(6, '0')}.deleted`)
      await mkdir(dirname(quarantinePath), { recursive: true })
      await renameWithRetry(resolved.absolutePath, quarantinePath)
      await this.journal.markMutationPhase(record, target.index, 'applied')
      return
    }

    const payloadPath = staged.payloadPaths[target.index]
    if (payloadPath === undefined) {
      throw new Error(`Mutation payload is missing for ${target.mutation.destination}.`)
    }

    if (target.originalPresence === 'present') {
      const backupPath = join(root, 'rollback', `${target.index.toString().padStart(6, '0')}.original`)
      await mkdir(dirname(backupPath), { recursive: true })
      await renameWithRetry(resolved.absolutePath, backupPath)
      await this.journal.markMutationPhase(record, target.index, 'backup-created')
    }

    await renameWithRetry(payloadPath, resolved.absolutePath)
    await this.journal.markMutationPhase(record, target.index, 'applied')
  }

  private async verifyTargets(targets: readonly PreparedMutationTarget[]): Promise<void> {
    for (const target of targets) {
      const resolved = await this.resolveMutationTarget(target.mutation)
      const content = await readExistingBytes(resolved.absolutePath)

      if (target.mutation.kind === 'delete') {
        if (content !== undefined) {
          throw new Error(`Deleted mutation target still exists: ${target.mutation.destination}`)
        }
        continue
      }

      if (content === undefined || createBinarySha256(content) !== target.mutation.contentSha256) {
        throw new StagedAssetIntegrityError(`Written mutation target failed digest verification: ${target.mutation.destination}`)
      }
    }
  }

  private async verifyRecoveredCommit(record: LocalMutationJournalRecord): Promise<void> {
    for (const entry of record.mutations) {
      const resolved = await this.resolveMutationTarget(entryToMutationShape(entry))
      const content = await readExistingBytes(resolved.absolutePath)

      if (entry.kind === 'delete') {
        if (content !== undefined) {
          throw new MutationConflictError(`Verified deletion changed before recovery: ${entry.destination}`)
        }
        continue
      }

      if (content === undefined || createBinarySha256(content) !== entry.contentSha256) {
        throw new MutationConflictError(`Verified mutation changed before recovery: ${entry.destination}`)
      }
    }
  }

  private async rollback(record: LocalMutationJournalRecord): Promise<void> {
    const root = this.planStagingRoot(record.planId)

    for (const entry of [...record.mutations].reverse()) {
      if (entry.originalPresence === 'unknown') {
        continue
      }
      await this.rollbackEntry(root, entry)
    }
  }

  private async rollbackEntry(root: string, entry: LocalMutationJournalEntry): Promise<void> {
    const mutation = entryToMutationShape(entry)
    const resolved = await this.resolveMutationTarget(mutation)
    const targetContent = await readExistingBytes(resolved.absolutePath)

    if (entry.kind === 'delete') {
      const quarantinePath = join(root, 'quarantine', `${entry.index.toString().padStart(6, '0')}.deleted`)
      const quarantineContent = await readExistingBytes(quarantinePath)
      if (quarantineContent !== undefined) {
        if (createBinarySha256(quarantineContent) !== entry.expectedContentSha256) {
          throw new MutationConflictError(`Deletion quarantine changed before recovery: ${entry.destination}`)
        }
        if (targetContent !== undefined) {
          throw new MutationConflictError(`Cannot restore deletion over an existing target: ${entry.destination}`)
        }
        await mkdir(dirname(resolved.absolutePath), { recursive: true })
        await renameWithRetry(quarantinePath, resolved.absolutePath)
        return
      }
      if (targetContent === undefined) {
        throw new MutationConflictError(`Deletion recovery cannot find the original target: ${entry.destination}`)
      }
      if (createBinarySha256(targetContent) !== entry.expectedContentSha256) {
        throw new MutationConflictError(`Deletion target changed before recovery: ${entry.destination}`)
      }
      return
    }

    const backupPath = join(root, 'rollback', `${entry.index.toString().padStart(6, '0')}.original`)
    const backupContent = await readExistingBytes(backupPath)

    if (entry.originalPresence === 'present') {
      if (backupContent !== undefined && createBinarySha256(backupContent) !== entry.expectedRevision) {
        throw new MutationConflictError(`Mutation backup changed before recovery: ${entry.destination}`)
      }
      if (backupContent === undefined) {
        if (targetContent !== undefined && createBinarySha256(targetContent) === entry.expectedRevision) {
          return
        }
        throw new MutationConflictError(`Mutation target changed before recovery: ${entry.destination}`)
      }
      if (targetContent !== undefined) {
        if (createBinarySha256(targetContent) !== entry.contentSha256) {
          throw new MutationConflictError(`Cannot replace changed target during recovery: ${entry.destination}`)
        }
        await rm(resolved.absolutePath, { force: true })
      }
      await mkdir(dirname(resolved.absolutePath), { recursive: true })
      await renameWithRetry(backupPath, resolved.absolutePath)
      return
    }

    if (targetContent !== undefined) {
      if (createBinarySha256(targetContent) !== entry.contentSha256) {
        throw new MutationConflictError(`Cannot remove changed target during recovery: ${entry.destination}`)
      }
      await rm(resolved.absolutePath, { force: true })
    }
  }

  private async resolveMutationTarget(mutation: Pick<WorkspaceMutation, 'destination' | 'kind'>) {
    return mutation.kind === 'delete'
      ? this.boundary.resolveForRead(mutation.destination)
      : this.boundary.resolveForWrite(mutation.destination)
  }

  private async notifyState(state: LocalMutationJournalState, plan: WorkspaceMutationPlan): Promise<void> {
    await this.lifecycleObserver?.afterJournalState(state, plan)
  }

  private committedReceipt(plan: WorkspaceMutationPlan): WorkspaceMutationReceipt {
    return this.receipt(plan, 'committed')
  }

  private failureReceipt(plan: WorkspaceMutationPlan, error: unknown): WorkspaceMutationReceipt {
    if (error instanceof MutationConflictError) {
      return this.receipt(plan, 'conflict', 'mutation-conflict')
    }
    if (error instanceof VaultBoundaryError || error instanceof VaultPathError) {
      return this.receipt(plan, 'rejected', 'vault-path-rejected')
    }
    if (error instanceof StagedAssetIntegrityError) {
      return this.receipt(plan, 'rejected', 'staged-asset-integrity')
    }
    if (error instanceof MutationJournalAlreadyPreparedError) {
      return this.receipt(plan, 'rejected', 'mutation-already-prepared')
    }
    if (isAbortError(error)) {
      return this.receipt(plan, 'cancelled', 'mutation-cancelled')
    }
    return this.receipt(plan, 'failed', 'mutation-failed')
  }

  private receipt(
    plan: WorkspaceMutationPlan,
    status: WorkspaceMutationReceiptStatus,
    diagnosticCode?: string,
  ): WorkspaceMutationReceipt {
    const mutations = plan.mutations.map((mutation) => {
      return {
        destination: mutation.destination,
        kind: mutation.kind,
        status,
        ...(status === 'committed' && mutation.kind !== 'delete'
          ? { revision: mutation.contentSha256 }
          : {}),
        ...(diagnosticCode === undefined ? {} : { diagnosticCode }),
      } satisfies MutationReceiptEntryDraft
    })
    return createWorkspaceMutationReceipt({
      planId: plan.id,
      planDigest: plan.digest,
      status,
      mutations,
    })
  }

  private planStagingRoot(planId: string): string {
    if (!/^notemd-mutation-[a-f0-9]{20}$/u.test(planId)) {
      throw new RangeError('A mutation staging root requires a content-addressed mutation id.')
    }
    return join(this.workspaceRoot, '.notemd', 'staging', planId)
  }

  private async removePlanStaging(planId: string): Promise<void> {
    await rm(this.planStagingRoot(planId), { recursive: true, force: true })
  }

  private async finalizePlanStaging(record: LocalMutationJournalRecord): Promise<void> {
    await this.removePlanStaging(record.planId)
    await this.journal.markStagingCleaned(record)
  }
}

function matchesExpectedRevision(
  mutation: WorkspaceMutation,
  current: Buffer | undefined,
  currentSha256: string | undefined,
): boolean {
  if (mutation.expectedRevision === 'absent') {
    return current === undefined
  }
  return currentSha256 === mutation.expectedRevision
}

function entryToMutationShape(entry: LocalMutationJournalEntry): Pick<WorkspaceMutation, 'destination' | 'kind'> {
  return { destination: entry.destination, kind: entry.kind } as Pick<WorkspaceMutation, 'destination' | 'kind'>
}

async function readExistingBytes(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path)
  } catch (error) {
    if (isMissingPath(error)) {
      return undefined
    }
    throw error
  }
}

async function renameWithRetry(source: string, destination: string): Promise<void> {
  const retryDelays = [10, 30, 90]

  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const delay = retryDelays[attempt]
      if (!isRenameConflict(error) || delay === undefined) {
        throw error
      }
      await new Promise<void>((resolve) => setTimeout(resolve, delay))
    }
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('The workspace mutation was cancelled.', 'AbortError')
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isRenameConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTEMPTY')
  )
}
