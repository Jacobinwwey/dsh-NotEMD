import type { NotemdVault } from '@notemd-harness/vault'
import type { WorkspaceChangeEvent, WorkspaceChangeSource } from '@notemd-harness/workspace-events'

import type { VaultKnowledgeIndex } from './knowledge-index.js'

export class IncrementalKnowledgeSynchronizer {
  private unsubscribe: (() => void) | undefined
  private synchronizationTail = Promise.resolve()
  private failure: unknown

  constructor(
    private readonly index: VaultKnowledgeIndex,
    private readonly vault: NotemdVault,
    private readonly source: WorkspaceChangeSource,
  ) {}

  start(): void {
    if (this.unsubscribe !== undefined) {
      throw new Error('Knowledge synchronization has already started.')
    }
    this.unsubscribe = this.source.subscribe((event) => {
      this.enqueue(event)
    })
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = undefined
  }

  async whenIdle(): Promise<void> {
    await this.synchronizationTail
    if (this.failure !== undefined) {
      throw this.failure
    }
  }

  private enqueue(event: WorkspaceChangeEvent): void {
    this.synchronizationTail = this.synchronizationTail
      .then(() => this.synchronize(event))
      .catch((error: unknown) => {
        this.failure = error
      })
  }

  private async synchronize(event: WorkspaceChangeEvent): Promise<void> {
    for (const change of event.changes) {
      if (change.kind === 'deleted') {
        await this.index.remove(change.path)
        continue
      }

      try {
        await this.index.upsert(await this.vault.read(change.path))
      } catch (error) {
        if (!isMissingVaultDocument(error)) {
          throw error
        }
        await this.index.remove(change.path)
      }
    }
  }
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}
