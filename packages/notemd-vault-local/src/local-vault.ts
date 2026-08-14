import { randomUUID } from 'node:crypto'
import { chmod, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import {
  createRevision,
  type NotemdVault,
  type PlannedWrite,
  type Revision,
  type VaultDocument,
  type WritePlan,
  type WriteResult,
  type WriteStatus,
} from '@notemd-harness/vault'

import { VaultBoundaryError, VaultPathBoundary } from './path-boundary.js'
import { TargetWriteLocks } from './write-lock.js'

export class VaultFileError extends Error {
  readonly code = 'VAULT_NOT_FOUND'

  constructor(path: string) {
    super(`Vault document does not exist: ${path}`)
    this.name = 'VaultFileError'
  }
}

export class LocalVault implements NotemdVault {
  private readonly locks = new TargetWriteLocks()

  private constructor(
    private readonly boundary: VaultPathBoundary,
    private readonly workspaceRoot: string,
  ) {}

  static async open(workspaceRoot: string): Promise<LocalVault> {
    return new LocalVault(await VaultPathBoundary.open(workspaceRoot), workspaceRoot)
  }

  async listMarkdown(signal?: AbortSignal): Promise<readonly string[]> {
    if (signal?.aborted) {
      return []
    }

    const paths: string[] = []
    await this.collectMarkdown(this.workspaceRoot, '', paths, signal)
    return paths.sort((left, right) => left.localeCompare(right))
  }

  async read(path: string, signal?: AbortSignal): Promise<VaultDocument> {
    if (signal?.aborted) {
      throw new DOMException('The vault read was cancelled.', 'AbortError')
    }

    const resolved = await this.boundary.resolveForRead(path)
    const document = await this.readExisting(resolved.absolutePath)

    if (document === undefined) {
      throw new VaultFileError(resolved.relativePath)
    }

    return {
      path: resolved.relativePath,
      content: document.content,
      revision: document.revision,
    }
  }

  async apply(plan: WritePlan, signal?: AbortSignal): Promise<readonly WriteResult[]> {
    return Promise.all(plan.writes.map((write) => this.applyWrite(write, signal)))
  }

  private async applyWrite(write: PlannedWrite, signal?: AbortSignal): Promise<WriteResult> {
    if (signal?.aborted) {
      return this.result(write.path, 'cancelled')
    }

    let lockKey: string
    try {
      lockKey = this.boundary.lockKey(write.path)
    } catch (error) {
      return this.result(write.path, 'rejected', undefined, diagnostic(error))
    }

    try {
      return await this.locks.run(lockKey, async () => {
        if (signal?.aborted) {
          return this.result(write.path, 'cancelled')
        }

        const resolved = await this.boundary.resolveForWrite(write.path)
        const existing = await this.readExisting(resolved.absolutePath)

        if (write.expectedRevision === 'absent') {
          if (existing !== undefined) {
            return this.result(resolved.relativePath, 'skipped-stale')
          }
        } else if (existing === undefined || existing.revision !== write.expectedRevision) {
          return this.result(resolved.relativePath, 'skipped-stale')
        }

        if (signal?.aborted) {
          return this.result(resolved.relativePath, 'cancelled')
        }

        await replaceAtomically(resolved.absolutePath, write.content)
        return this.result(
          resolved.relativePath,
          existing === undefined ? 'created' : 'updated',
          createRevision(write.content),
        )
      })
    } catch (error) {
      return this.result(
        write.path,
        error instanceof VaultBoundaryError ? 'rejected' : 'failed',
        undefined,
        diagnostic(error),
      )
    }
  }

  private async collectMarkdown(
    directory: string,
    relativeDirectory: string,
    paths: string[],
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) {
      return
    }

    const entries = await readdir(directory, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (signal?.aborted) {
        return
      }
      if (entry.name === '.notemd' || entry.isSymbolicLink()) {
        continue
      }

      const relativePath = relativeDirectory.length === 0 ? entry.name : `${relativeDirectory}/${entry.name}`
      const absolutePath = join(directory, entry.name)

      if (entry.isDirectory()) {
        await this.collectMarkdown(absolutePath, relativePath, paths, signal)
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
        await this.boundary.resolveForRead(relativePath)
        paths.push(relativePath)
      }
    }
  }

  private async readExisting(absolutePath: string): Promise<{ content: string; revision: Revision } | undefined> {
    try {
      const content = await readFile(absolutePath, 'utf8')
      return { content, revision: createRevision(content) }
    } catch (error) {
      if (isMissingPath(error)) {
        return undefined
      }
      throw error
    }
  }

  private result(
    path: string,
    status: WriteStatus,
    revision?: Revision,
    failureDiagnostic?: string,
  ): WriteResult {
    const result: WriteResult = { path, status }
    if (revision !== undefined) {
      result.revision = revision
    }
    if (failureDiagnostic !== undefined) {
      result.diagnostic = failureDiagnostic
    }
    return result
  }
}

async function replaceAtomically(targetPath: string, content: string): Promise<void> {
  const originalMode = await existingMode(targetPath)
  const temporaryPath = join(
    dirname(targetPath),
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.notemd-tmp`,
  )

  try {
    const handle = await open(temporaryPath, 'wx', originalMode ?? 0o600)
    try {
      await handle.writeFile(content, 'utf8')
      await handle.sync()
    } finally {
      await handle.close()
    }

    if (originalMode !== undefined) {
      await chmod(temporaryPath, originalMode)
    }

    await renameWithRetry(temporaryPath, targetPath)
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

async function existingMode(targetPath: string): Promise<number | undefined> {
  try {
    return (await stat(targetPath)).mode
  } catch (error) {
    if (isMissingPath(error)) {
      return undefined
    }
    throw error
  }
}

async function renameWithRetry(temporaryPath: string, targetPath: string): Promise<void> {
  const retryDelays = [10, 30, 90]

  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(temporaryPath, targetPath)
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

function isRenameConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTEMPTY')
  )
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
