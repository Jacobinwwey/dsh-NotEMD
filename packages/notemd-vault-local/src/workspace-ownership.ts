import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

const ownershipDirectory = '.notemd/runtime'
const ownershipFilename = 'workspace-owner.json'
const ownerMetadataVersion = 1 as const
const defaultHeartbeatMs = 2_000
const defaultStaleAfterMs = 10_000

export interface WorkspaceOwnerMetadata {
  readonly version: 1
  readonly pid: number
  readonly processStartToken: string
  readonly workspaceRoot: string
  readonly ownerRevision: string
  readonly acquiredAt: string
  readonly heartbeatAt: string
  readonly recoveryCount: number
  readonly recoveredOwnerRevision?: string
}

export interface WorkspaceOwnershipProcessProbe {
  isAlive(pid: number): boolean | Promise<boolean>
}

export interface WorkspaceOwnershipOptions {
  readonly heartbeatMs?: number
  readonly staleAfterMs?: number
  readonly processProbe?: WorkspaceOwnershipProcessProbe
  readonly now?: () => Date
  readonly processId?: number
  readonly processStartToken?: string
  readonly ownerRevision?: string
}

export type WorkspaceOwnershipState = 'owned' | 'recovered'

export interface WorkspaceOwnershipDiagnostic {
  readonly code: 'workspace-owned' | 'workspace-owner-recovered' | 'workspace-process-already-owned'
  readonly state: WorkspaceOwnershipState | 'blocked'
  readonly workspaceRoot: string
  readonly lockPath: string
  readonly ownerRevision: string
  readonly ownerPid: number
  readonly processStartToken: string
  readonly recoveryCount: number
  readonly recoveredOwnerRevision?: string
}

export interface WorkspaceCleanupHealthFact {
  readonly cleanupHealthy: boolean
  readonly code: 'workspace-owner-released' | 'workspace-owner-lock-missing' | 'workspace-owner-lock-lost'
  readonly workspaceRoot: string
  readonly lockPath: string
  readonly ownerRevision: string
  readonly observedAt: string
}

export class WorkspaceOwnershipError extends Error {
  readonly code: 'workspace-process-already-owned' | 'workspace-owner-lock-invalid' | 'workspace-owner-lock-unreadable'
  readonly diagnostic?: WorkspaceOwnershipDiagnostic | undefined

  constructor(
    code: WorkspaceOwnershipError['code'],
    message: string,
    diagnostic?: WorkspaceOwnershipDiagnostic,
  ) {
    super(message)
    this.name = 'WorkspaceOwnershipError'
    this.code = code
    this.diagnostic = diagnostic
  }
}

/**
 * Owns one process-wide lease for a workspace. The lease is intentionally
 * file-backed: it prevents accidental double scheduling without pretending to
 * be a distributed queue. A dead PID is the only automatic stale-owner proof.
 */
export class WorkspaceOwnershipGuard {
  private readonly heartbeatMs: number
  private readonly processProbe: WorkspaceOwnershipProcessProbe
  private readonly now: () => Date
  private readonly processId: number
  private readonly processStartToken: string
  private readonly ownerRevision: string
  private readonly lockPath: string
  private readonly workspaceRoot: string
  private heartbeatTimer: ReturnType<typeof setInterval> | undefined
  private currentMetadata: WorkspaceOwnerMetadata
  private latestDiagnostic: WorkspaceOwnershipDiagnostic
  private cleanupFact: WorkspaceCleanupHealthFact | undefined
  private released = false

  private constructor(
    workspaceRoot: string,
    lockPath: string,
    metadata: WorkspaceOwnerMetadata,
    options: Required<Pick<WorkspaceOwnershipOptions, 'heartbeatMs' | 'processProbe' | 'now'>> & {
      readonly processId: number
      readonly processStartToken: string
      readonly ownerRevision: string
    },
  ) {
    this.workspaceRoot = workspaceRoot
    this.lockPath = lockPath
    this.currentMetadata = metadata
    this.heartbeatMs = options.heartbeatMs
    this.processProbe = options.processProbe
    this.now = options.now
    this.processId = options.processId
    this.processStartToken = options.processStartToken
    this.ownerRevision = options.ownerRevision
    this.latestDiagnostic = diagnosticFor(metadata, lockPath, 'owned')
  }

  static async acquire(workspaceRoot: string, options: WorkspaceOwnershipOptions = {}): Promise<WorkspaceOwnershipGuard> {
    const normalizedRoot = await normalizeWorkspaceRoot(workspaceRoot)
    const heartbeatMs = positiveInterval(options.heartbeatMs ?? defaultHeartbeatMs, 'heartbeatMs')
    const staleAfterMs = positiveInterval(options.staleAfterMs ?? defaultStaleAfterMs, 'staleAfterMs')
    if (staleAfterMs <= heartbeatMs) {
      throw new RangeError('Workspace ownership staleAfterMs must be greater than heartbeatMs.')
    }
    const now = options.now ?? (() => new Date())
    const processId = options.processId ?? process.pid
    const processStartToken = options.processStartToken ?? processStartTokenFor(processId)
    const ownerRevision = options.ownerRevision ?? randomUUID()
    const processProbe = options.processProbe ?? defaultProcessProbe
    const lockPath = join(normalizedRoot, ownershipDirectory, ownershipFilename)
    const lockDirectory = join(normalizedRoot, ownershipDirectory)
    await mkdir(lockDirectory, { recursive: true })

    let recoveredMetadata: WorkspaceOwnerMetadata | undefined
    try {
      await createLock(lockPath, createMetadata(normalizedRoot, processId, processStartToken, ownerRevision, now(), 0))
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error
      }
      const existing = await readExistingMetadata(lockPath, normalizedRoot)
      const ownerAlive = await isOwnerAlive(existing, processProbe)
      if (ownerAlive || heartbeatIsFresh(existing, now(), staleAfterMs)) {
        throw new WorkspaceOwnershipError(
          'workspace-process-already-owned',
          `Workspace is already owned by process ${existing.pid}.`,
          blockedDiagnostic(existing, lockPath),
        )
      }
      recoveredMetadata = existing
      await unlink(lockPath)
      await createLock(lockPath, createMetadata(
        normalizedRoot,
        processId,
        processStartToken,
        ownerRevision,
        now(),
        existing.recoveryCount + 1,
        existing.ownerRevision,
      ))
    }

    const metadata = await readExistingMetadata(lockPath, normalizedRoot)
    if (metadata.ownerRevision !== ownerRevision) {
      throw new WorkspaceOwnershipError('workspace-owner-lock-unreadable', 'Workspace ownership lock changed during acquisition.')
    }
    const guard = new WorkspaceOwnershipGuard(normalizedRoot, lockPath, metadata, {
      heartbeatMs,
      processProbe,
      now,
      processId,
      processStartToken,
      ownerRevision,
    })
    if (recoveredMetadata !== undefined) {
      guard.latestDiagnostic = diagnosticFor(metadata, lockPath, 'recovered')
    }
    guard.startHeartbeat()
    return guard
  }

  diagnostic(): WorkspaceOwnershipDiagnostic {
    return this.latestDiagnostic
  }

  cleanupHealth(): WorkspaceCleanupHealthFact | undefined {
    return this.cleanupFact
  }

  async release(): Promise<WorkspaceCleanupHealthFact> {
    if (this.cleanupFact !== undefined) {
      return this.cleanupFact
    }
    this.stopHeartbeat()
    const observedAt = this.now().toISOString()
    if (this.released) {
      this.cleanupFact = Object.freeze({
        cleanupHealthy: false,
        code: 'workspace-owner-lock-lost',
        workspaceRoot: this.workspaceRoot,
        lockPath: this.lockPath,
        ownerRevision: this.ownerRevision,
        observedAt,
      })
      return this.cleanupFact
    }
    this.released = true
    try {
      const existing = await readExistingMetadata(this.lockPath, this.workspaceRoot)
      if (existing.ownerRevision !== this.ownerRevision) {
        this.cleanupFact = Object.freeze({
          cleanupHealthy: false,
          code: 'workspace-owner-lock-lost',
          workspaceRoot: this.workspaceRoot,
          lockPath: this.lockPath,
          ownerRevision: this.ownerRevision,
          observedAt,
        })
        return this.cleanupFact
      }
      await unlink(this.lockPath)
      this.cleanupFact = Object.freeze({
        cleanupHealthy: true,
        code: 'workspace-owner-released',
        workspaceRoot: this.workspaceRoot,
        lockPath: this.lockPath,
        ownerRevision: this.ownerRevision,
        observedAt,
      })
      return this.cleanupFact
    } catch (error) {
      if (isMissingPath(error)) {
        this.cleanupFact = Object.freeze({
          cleanupHealthy: false,
          code: 'workspace-owner-lock-missing',
          workspaceRoot: this.workspaceRoot,
          lockPath: this.lockPath,
          ownerRevision: this.ownerRevision,
          observedAt,
        })
        return this.cleanupFact
      }
      if (error instanceof WorkspaceOwnershipError) {
        this.cleanupFact = Object.freeze({
          cleanupHealthy: false,
          code: 'workspace-owner-lock-lost',
          workspaceRoot: this.workspaceRoot,
          lockPath: this.lockPath,
          ownerRevision: this.ownerRevision,
          observedAt,
        })
        return this.cleanupFact
      }
      throw error
    }
  }

  private startHeartbeat(): void {
    const timer = setInterval(() => {
      void this.writeHeartbeat().catch(() => {
        this.latestDiagnostic = {
          ...this.latestDiagnostic,
          code: 'workspace-owned',
        }
      })
    }, this.heartbeatMs)
    timer.unref?.()
    this.heartbeatTimer = timer
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== undefined) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private async writeHeartbeat(): Promise<void> {
    if (this.released) {
      return
    }
    const existing = await readExistingMetadata(this.lockPath, this.workspaceRoot)
    if (existing.ownerRevision !== this.ownerRevision) {
      throw new WorkspaceOwnershipError('workspace-owner-lock-unreadable', 'Workspace ownership lock changed while heartbeating.')
    }
    const metadata = Object.freeze({
      ...this.currentMetadata,
      heartbeatAt: this.now().toISOString(),
    })
    await writeFile(this.lockPath, `${JSON.stringify(metadata)}\n`, 'utf8')
    this.currentMetadata = metadata
  }
}

const defaultProcessProbe: WorkspaceOwnershipProcessProbe = {
  isAlive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch (error) {
      return !isMissingProcess(error)
    }
  },
}

async function normalizeWorkspaceRoot(workspaceRoot: string): Promise<string> {
  if (typeof workspaceRoot !== 'string' || workspaceRoot.trim().length === 0) {
    throw new TypeError('Workspace ownership requires a non-empty workspace root.')
  }
  const resolved = resolve(workspaceRoot)
  if (!isAbsolute(resolved)) {
    throw new TypeError('Workspace ownership requires an absolute workspace root.')
  }
  return realpath(resolved)
}

function createMetadata(
  workspaceRoot: string,
  pid: number,
  processStartToken: string,
  ownerRevision: string,
  acquiredAt: Date,
  recoveryCount: number,
  recoveredOwnerRevision?: string,
): WorkspaceOwnerMetadata {
  return Object.freeze({
    version: ownerMetadataVersion,
    pid,
    processStartToken,
    workspaceRoot,
    ownerRevision,
    acquiredAt: acquiredAt.toISOString(),
    heartbeatAt: acquiredAt.toISOString(),
    recoveryCount,
    ...(recoveredOwnerRevision === undefined ? {} : { recoveredOwnerRevision }),
  })
}

async function createLock(lockPath: string, metadata: WorkspaceOwnerMetadata): Promise<void> {
  const handle = await open(lockPath, 'wx')
  try {
    await handle.writeFile(`${JSON.stringify(metadata)}\n`, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function readExistingMetadata(lockPath: string, workspaceRoot: string): Promise<WorkspaceOwnerMetadata> {
  let content: string
  try {
    content = await readFile(lockPath, 'utf8')
  } catch {
    throw new WorkspaceOwnershipError('workspace-owner-lock-unreadable', 'Workspace ownership lock cannot be read.')
  }
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    throw new WorkspaceOwnershipError('workspace-owner-lock-invalid', 'Workspace ownership lock is not valid JSON.')
  }
  if (!isRecord(value) || value.version !== ownerMetadataVersion || value.workspaceRoot !== workspaceRoot || !validPid(value.pid) || !nonEmpty(value.processStartToken) || !nonEmpty(value.ownerRevision) || !isoTimestamp(value.acquiredAt) || !isoTimestamp(value.heartbeatAt) || !safeCount(value.recoveryCount) || (value.recoveredOwnerRevision !== undefined && !nonEmpty(value.recoveredOwnerRevision))) {
    throw new WorkspaceOwnershipError('workspace-owner-lock-invalid', 'Workspace ownership lock has an invalid metadata shape.')
  }
  return Object.freeze(value as unknown as WorkspaceOwnerMetadata)
}

async function isOwnerAlive(metadata: WorkspaceOwnerMetadata, processProbe: WorkspaceOwnershipProcessProbe): Promise<boolean> {
  try {
    return await processProbe.isAlive(metadata.pid)
  } catch {
    return true
  }
}

function diagnosticFor(metadata: WorkspaceOwnerMetadata, lockPath: string, state: WorkspaceOwnershipState): WorkspaceOwnershipDiagnostic {
  return Object.freeze({
    code: state === 'recovered' ? 'workspace-owner-recovered' : 'workspace-owned',
    state,
    workspaceRoot: metadata.workspaceRoot,
    lockPath,
    ownerRevision: metadata.ownerRevision,
    ownerPid: metadata.pid,
    processStartToken: metadata.processStartToken,
    recoveryCount: metadata.recoveryCount,
    ...(metadata.recoveredOwnerRevision === undefined ? {} : { recoveredOwnerRevision: metadata.recoveredOwnerRevision }),
  })
}

function blockedDiagnostic(metadata: WorkspaceOwnerMetadata, lockPath: string): WorkspaceOwnershipDiagnostic {
  return Object.freeze({
    ...diagnosticFor(metadata, lockPath, 'owned'),
    code: 'workspace-process-already-owned',
    state: 'blocked',
  })
}

function processStartTokenFor(pid: number): string {
  return `${pid}:${Math.floor((Date.now() - process.uptime() * 1_000)).toString(36)}`
}

function positiveInterval(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`Workspace ownership ${name} must be a positive integer.`)
  }
  return value
}

function validPid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function safeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAlreadyExists(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST'
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function isMissingProcess(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ESRCH'
}

function heartbeatIsFresh(metadata: WorkspaceOwnerMetadata, now: Date, staleAfterMs: number): boolean {
  const heartbeatAt = Date.parse(metadata.heartbeatAt)
  return Number.isFinite(heartbeatAt) && now.getTime() - heartbeatAt < staleAfterMs
}
