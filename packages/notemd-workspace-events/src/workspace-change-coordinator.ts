import { randomUUID } from 'node:crypto'

import type {
  WorkspaceMutationPlan,
  WorkspaceMutationReceipt,
} from '@notemd-harness/mutation'
import type { NotemdVault, Revision } from '@notemd-harness/vault'

export type WorkspaceChangeOrigin = 'notemd-mutation-receipt' | 'external-scan'

export interface WorkspaceChange {
  path: string
  kind: 'created' | 'updated' | 'deleted'
  revision?: Revision
}

export interface WorkspaceChangeEvent {
  id: string
  occurredAt: string
  origin: WorkspaceChangeOrigin
  causationId: string
  changes: readonly WorkspaceChange[]
}

export interface WorkspaceChangeSource {
  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void
}

export class WorkspaceChangeCoordinator implements WorkspaceChangeSource {
  private snapshot = new Map<string, Revision>()
  private readonly listeners = new Set<(event: WorkspaceChangeEvent) => void>()
  private synchronizationTail = Promise.resolve()

  constructor(
    private readonly vault: NotemdVault,
    private readonly createScanId: () => string = () => `notemd-scan-${randomUUID()}`,
  ) {}

  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async captureSnapshot(signal?: AbortSignal): Promise<void> {
    await this.synchronize(async () => {
      this.snapshot = await readSnapshot(this.vault, signal)
    })
  }

  async recordMutationReceipt(
    plan: WorkspaceMutationPlan,
    receipt: WorkspaceMutationReceipt,
  ): Promise<WorkspaceChangeEvent | undefined> {
    return this.synchronize(async () => {
      const changes = committedMutationChanges(plan, receipt)
      if (changes.length === 0) {
        return undefined
      }

      for (const change of changes) {
        if (change.kind === 'deleted') {
          this.snapshot.delete(change.path)
        } else if (change.revision !== undefined) {
          this.snapshot.set(change.path, change.revision)
        } else {
          return undefined
        }
      }
      return this.publish('notemd-mutation-receipt', receipt.planId, changes)
    })
  }

  async scan(signal?: AbortSignal): Promise<WorkspaceChangeEvent | undefined> {
    return this.synchronize(async () => {
      const nextSnapshot = await readSnapshot(this.vault, signal)
      const changes = changesBetween(this.snapshot, nextSnapshot)
      this.snapshot = nextSnapshot
      return changes.length === 0 ? undefined : this.publish('external-scan', this.createScanId(), changes)
    })
  }

  private publish(
    origin: WorkspaceChangeOrigin,
    causationId: string,
    changes: readonly WorkspaceChange[],
  ): WorkspaceChangeEvent {
    const event: WorkspaceChangeEvent = {
      id: `notemd-change-${randomUUID()}`,
      occurredAt: new Date().toISOString(),
      origin,
      causationId,
      changes: changes.map(cloneChange),
    }
    for (const listener of this.listeners) {
      listener(event)
    }
    return event
  }

  private async synchronize<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.synchronizationTail
    let release!: () => void
    this.synchronizationTail = new Promise<void>((resolve) => {
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

async function readSnapshot(vault: NotemdVault, signal?: AbortSignal): Promise<Map<string, Revision>> {
  const snapshot = new Map<string, Revision>()
  const paths = await vault.listMarkdown(signal)

  for (const path of paths) {
    throwIfAborted(signal)
    try {
      const document = await vault.read(path, signal)
      snapshot.set(document.path, document.revision)
    } catch (error) {
      if (!isMissingVaultDocument(error)) {
        throw error
      }
    }
  }

  throwIfAborted(signal)
  return snapshot
}

function committedMutationChanges(
  plan: WorkspaceMutationPlan,
  receipt: WorkspaceMutationReceipt,
): readonly WorkspaceChange[] {
  if (
    receipt.status !== 'committed' ||
    receipt.planId !== plan.id ||
    receipt.planDigest !== plan.digest ||
    receipt.mutations.length !== plan.mutations.length
  ) {
    return []
  }

  const entries = new Map(receipt.mutations.map((entry) => [entry.destination, entry]))
  if (entries.size !== receipt.mutations.length) {
    return []
  }

  const changes: WorkspaceChange[] = []
  for (const mutation of plan.mutations) {
    const entry = entries.get(mutation.destination)
    if (entry === undefined || entry.kind !== mutation.kind || entry.status !== 'committed') {
      return []
    }
    if (mutation.kind === 'delete') {
      if (entry.revision !== undefined) {
        return []
      }
      changes.push({ path: mutation.destination, kind: 'deleted' })
      continue
    }
    if (entry.revision === undefined) {
      return []
    }
    changes.push({
      path: mutation.destination,
      kind: mutation.expectedRevision === 'absent' ? 'created' : 'updated',
      revision: entry.revision,
    })
  }
  return changes
}

function changesBetween(previous: Map<string, Revision>, next: Map<string, Revision>): WorkspaceChange[] {
  const changes: WorkspaceChange[] = []

  for (const [path, revision] of next) {
    const priorRevision = previous.get(path)
    if (priorRevision === undefined) {
      changes.push({ path, kind: 'created', revision })
    } else if (priorRevision !== revision) {
      changes.push({ path, kind: 'updated', revision })
    }
  }
  for (const path of previous.keys()) {
    if (!next.has(path)) {
      changes.push({ path, kind: 'deleted' })
    }
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path))
}

function cloneChange(change: WorkspaceChange): WorkspaceChange {
  return change.revision === undefined
    ? { path: change.path, kind: change.kind }
    : { path: change.path, kind: change.kind, revision: change.revision }
}

function isMissingVaultDocument(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'VAULT_NOT_FOUND'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Workspace change scan was cancelled.', 'AbortError')
  }
}
