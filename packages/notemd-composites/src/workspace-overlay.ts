import {
  createContentSha256,
  type CompositeMutationLineageDraft,
  type MutationProvenanceDraft,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault, VaultDocument } from '@notemd-harness/vault'

import { CompositeWorkflowError } from './diagnostics.js'
import { MutationAccumulator } from './mutation-accumulator.js'

export interface CompositeWorkspaceLimits {
  readonly maxVirtualFiles: number
  readonly maxVirtualBytes: number
  readonly maxCompletionInputBytes: number
}

export interface CompositeWorkspaceViewOptions {
  readonly provenance: MutationProvenanceDraft
  readonly limits?: Partial<CompositeWorkspaceLimits>
}

const DEFAULT_LIMITS: CompositeWorkspaceLimits = {
  maxVirtualFiles: 10_000,
  maxVirtualBytes: 16 * 1024 * 1024,
  maxCompletionInputBytes: 2 * 1024 * 1024,
}

interface VirtualDocument {
  readonly path: string
  readonly base?: VaultDocument
  exists: boolean
  content: string | undefined
  revision: string | 'absent'
}

export class CompositeWorkspaceView implements NotemdVault {
  private readonly documents = new Map<string, VirtualDocument>()
  private readonly limits: CompositeWorkspaceLimits
  private readonly accumulator: MutationAccumulator

  constructor(
    private readonly baseVault: NotemdVault,
    options: CompositeWorkspaceViewOptions,
  ) {
    this.limits = {
      ...DEFAULT_LIMITS,
      ...options.limits,
    }
    assertLimits(this.limits)
    this.accumulator = new MutationAccumulator({ provenance: options.provenance })
  }

  async read(path: string, signal?: AbortSignal): Promise<VaultDocument> {
    const canonicalPath = normalizeCompositePath(path)
    const document = await this.stateFor(canonicalPath, signal)
    if (!document.exists || document.content === undefined) {
      throw new CompositeWorkflowError(
        'composite-document-not-found',
        'Composite document does not exist: ' + canonicalPath,
      )
    }
    return {
      path: canonicalPath,
      content: document.content,
      revision: document.revision,
    }
  }

  async listMarkdown(signal?: AbortSignal): Promise<readonly string[]> {
    const physicalPaths = await this.baseVault.listMarkdown(signal)
    const paths = new Set(physicalPaths.map(normalizeCompositePath))
    for (const document of this.documents.values()) {
      if (document.exists && document.path.toLowerCase().endsWith('.md')) {
        paths.add(document.path)
      } else if (!document.exists) {
        paths.delete(document.path)
      }
    }
    return [...paths].sort((left, right) => left.localeCompare(right))
  }

  async applyPlannedPlan(
    plan: WorkspaceMutationPlan,
    lineage: CompositeMutationLineageDraft,
  ): Promise<void> {
    for (const mutation of plan.mutations) {
      if (mutation.kind === 'write-bytes') {
        this.accumulator.recordBytes()
      }
      const state = await this.stateFor(mutation.destination)
      const currentRevision = state.revision
      if (mutation.kind === 'write-text') {
        this.accumulator.recordWrite(state.base, currentRevision, mutation, lineage)
        state.exists = true
        state.content = mutation.content
        state.revision = createContentSha256(mutation.content)
      } else if (mutation.kind === 'delete') {
        this.accumulator.recordDelete(state.base, currentRevision, mutation, lineage)
        state.exists = false
        state.content = undefined
        state.revision = 'absent'
      }
      this.assertStateBudget()
    }
  }

  assertCompletionInputBudget(input: string): void {
    if (Buffer.byteLength(input, 'utf8') > this.limits.maxCompletionInputBytes) {
      throw new CompositeWorkflowError(
        'composite-budget-exceeded',
        'Completion input exceeds ' + this.limits.maxCompletionInputBytes + ' UTF-8 bytes.',
      )
    }
  }

  finalize(): WorkspaceMutationPlan {
    return this.accumulator.finalize()
  }

  private async stateFor(path: string, signal?: AbortSignal): Promise<VirtualDocument> {
    const existing = this.documents.get(path)
    if (existing !== undefined) {
      return existing
    }
    let base: VaultDocument | undefined
    try {
      base = await this.baseVault.read(path, signal)
    } catch (error) {
      if (!isNotFound(error)) {
        throw error
      }
    }
    const state: VirtualDocument = {
      path,
      ...(base === undefined ? {} : { base }),
      exists: base !== undefined,
      content: base?.content,
      revision: base?.revision ?? 'absent',
    }
    this.documents.set(path, state)
    return state
  }

  private assertStateBudget(): void {
    let files = 0
    let bytes = 0
    for (const document of this.documents.values()) {
      if (!document.exists || document.content === undefined) {
        continue
      }
      files += 1
      bytes += Buffer.byteLength(document.content, 'utf8')
    }
    if (files > this.limits.maxVirtualFiles || bytes > this.limits.maxVirtualBytes) {
      throw new CompositeWorkflowError(
        'composite-budget-exceeded',
        'Virtual workspace exceeds limits (' + files + ' files, ' + bytes + ' bytes).',
      )
    }
  }
}

export function normalizeCompositePath(path: string): string {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.includes('\\')
    || path.startsWith('/')
    || /^[A-Za-z]:/u.test(path)
  ) {
    throw new CompositeWorkflowError(
      'composite-path-invalid',
      'Composite paths must be relative slash-separated workspace paths.',
    )
  }
  const segments = path.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\u0000'))) {
    throw new CompositeWorkflowError(
      'composite-path-invalid',
      'Invalid composite workspace path: ' + path,
    )
  }
  return segments.join('/')
}

function assertLimits(limits: CompositeWorkspaceLimits): void {
  if (
    !Number.isSafeInteger(limits.maxVirtualFiles)
    || limits.maxVirtualFiles < 1
    || !Number.isSafeInteger(limits.maxVirtualBytes)
    || limits.maxVirtualBytes < 1
    || !Number.isSafeInteger(limits.maxCompletionInputBytes)
    || limits.maxCompletionInputBytes < 1
  ) {
    throw new RangeError('Composite workspace limits must be positive safe integers.')
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error.code === 'VAULT_NOT_FOUND' || error.code === 'COMPOSITE_DOCUMENT_NOT_FOUND')
}
