import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  RecoveredMutation,
  WorkspaceMutationPlan,
  WorkspaceMutationReceipt,
} from '@notemd-harness/mutation'
import {
  createRevision,
  type NotemdVault,
  type Revision,
  type VaultDocument,
} from '@notemd-harness/vault'

import { LocalMutationExecutor } from './local-mutation-executor.js'
import { VaultPathBoundary } from './path-boundary.js'
import { TargetWriteLocks } from './write-lock.js'

export class VaultFileError extends Error {
  readonly code = 'VAULT_NOT_FOUND'

  constructor(path: string) {
    super(`Vault document does not exist: ${path}`)
    this.name = 'VaultFileError'
  }
}

/**
 * The local authority owns both workspace facts and the only recoverable
 * mutation path, so all in-process writes share its canonical target locks.
 */
export class LocalVault implements NotemdVault {
  private constructor(
    private readonly boundary: VaultPathBoundary,
    private readonly workspaceRoot: string,
    private readonly mutationExecutor: LocalMutationExecutor,
  ) {}

  static async open(workspaceRoot: string): Promise<LocalVault> {
    const boundary = await VaultPathBoundary.open(workspaceRoot)
    const mutationExecutor = await LocalMutationExecutor.open(boundary.workspaceRoot, {
      targetWriteLocks: new TargetWriteLocks(),
    })
    return new LocalVault(boundary, boundary.workspaceRoot, mutationExecutor)
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

  applyMutationPlan(
    plan: WorkspaceMutationPlan,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationReceipt> {
    return this.mutationExecutor.apply(plan, signal)
  }

  recoverIncompleteMutationPlans(signal?: AbortSignal): Promise<readonly RecoveredMutation[]> {
    return this.mutationExecutor.recover(signal)
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
}

function isMissingPath(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
