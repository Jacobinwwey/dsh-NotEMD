import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type CompositeMutationLineageDraft,
  type MutationProvenanceDraft,
  type WorkspaceMutation,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { VaultDocument } from '@notemd-harness/vault'

import { CompositeWorkflowError } from './diagnostics.js'

interface AccumulatedEntry {
  readonly path: string
  readonly base?: VaultDocument
  exists: boolean
  content: string | undefined
  provenance: MutationProvenanceDraft
  lineage: CompositeMutationLineageDraft
}

export interface MutationAccumulatorOptions {
  readonly provenance: MutationProvenanceDraft
}

export class MutationAccumulator {
  private readonly entries = new Map<string, AccumulatedEntry>()

  constructor(private readonly options: MutationAccumulatorOptions) {}

  recordWrite(
    base: VaultDocument | undefined,
    currentRevision: string | 'absent',
    mutation: Extract<WorkspaceMutation, { kind: 'write-text' }>,
    lineage: CompositeMutationLineageDraft,
  ): void {
    const entry = this.entryFor(base, mutation.destination, lineage, mutation.provenance)
    this.assertExpectedRevision(entry, currentRevision, mutation.expectedRevision, mutation.destination)
    if (mutation.mediaType !== 'text/markdown') {
      throw new CompositeWorkflowError(
        'composite-binary-dependency-unsupported',
        'Composite v1 accepts only text/markdown mutations: ' + mutation.destination,
      )
    }
    entry.exists = true
    entry.content = mutation.content
    entry.provenance = mutation.provenance
    entry.lineage = lineage
  }

  recordDelete(
    base: VaultDocument | undefined,
    currentRevision: string | 'absent',
    mutation: Extract<WorkspaceMutation, { kind: 'delete' }>,
    lineage: CompositeMutationLineageDraft,
  ): void {
    const entry = this.entryFor(base, mutation.destination, lineage, mutation.provenance)
    this.assertExpectedRevision(entry, currentRevision, mutation.expectedRevision, mutation.destination)
    if (mutation.expectedContentSha256 !== createContentSha256(entry.content ?? '')) {
      throw new CompositeWorkflowError(
        'composite-virtual-revision-conflict',
        'Virtual content digest changed before delete: ' + mutation.destination,
      )
    }
    if (base === undefined && !entry.exists) {
      throw new CompositeWorkflowError(
        'composite-virtual-revision-conflict',
        'Cannot delete an absent virtual destination: ' + mutation.destination,
      )
    }
    entry.exists = false
    entry.content = undefined
    entry.provenance = mutation.provenance
    entry.lineage = lineage
  }

  recordBytes(): never {
    throw new CompositeWorkflowError(
      'composite-binary-dependency-unsupported',
      'Composite v1 cannot expose a binary mutation to a later planning step.',
    )
  }

  finalize(): WorkspaceMutationPlan {
    const mutations = [...this.entries.values()]
      .filter((entry) => !sameAsBase(entry))
      .map((entry) => mutationFromEntry(entry))

    if (mutations.length === 0) {
      throw new CompositeWorkflowError(
        'composite-no-op',
        'Composite workflow produced no net workspace mutation.',
      )
    }

    return createWorkspaceMutationPlan({
      provenance: this.options.provenance,
      mutations,
    })
  }

  private entryFor(
    base: VaultDocument | undefined,
    path: string,
    lineage: CompositeMutationLineageDraft,
    provenance: MutationProvenanceDraft,
  ): AccumulatedEntry {
    const existing = this.entries.get(path)
    if (existing !== undefined) {
      if (existing.base?.revision !== base?.revision) {
        throw new CompositeWorkflowError(
          'composite-virtual-revision-conflict',
          'Base revision changed while planning ' + path + '.',
        )
      }
      return existing
    }

    const created: AccumulatedEntry = {
      path,
      ...(base === undefined ? {} : { base }),
      exists: base !== undefined,
      content: base?.content,
      provenance,
      lineage,
    }
    this.entries.set(path, created)
    return created
  }

  private assertExpectedRevision(
    entry: AccumulatedEntry,
    currentRevision: string | 'absent',
    expectedRevision: string | 'absent',
    path: string,
  ): void {
    if (currentRevision !== expectedRevision) {
      const code = expectedRevision === 'absent' && currentRevision !== 'absent'
        ? 'composite-destination-collision'
        : 'composite-virtual-revision-conflict'
      throw new CompositeWorkflowError(
        code,
        'Virtual revision mismatch for ' + path + ': expected ' + expectedRevision + ', received ' + currentRevision + '.',
      )
    }
    if (entry.base === undefined && expectedRevision !== 'absent' && currentRevision === 'absent') {
      throw new CompositeWorkflowError(
        'composite-virtual-revision-conflict',
        'A virtual absent destination cannot satisfy a concrete revision: ' + path + '.',
      )
    }
  }
}

function sameAsBase(entry: AccumulatedEntry): boolean {
  if (entry.base === undefined) {
    return !entry.exists
  }
  return entry.exists && entry.content === entry.base.content
}

function mutationFromEntry(entry: AccumulatedEntry): WorkspaceMutation {
  const provenance = {
    ...entry.provenance,
    composite: entry.lineage,
  }
  if (!entry.exists) {
    if (entry.base === undefined) {
      throw new CompositeWorkflowError(
        'composite-no-op',
        'Cannot emit a delete for an absent destination: ' + entry.path,
      )
    }
    return {
      kind: 'delete',
      destination: entry.path,
      expectedRevision: entry.base.revision,
      expectedContentSha256: createContentSha256(entry.base.content),
      provenance,
      conflictPolicy: 'reject',
    }
  }

  const content = entry.content ?? ''
  return {
    kind: 'write-text',
    destination: entry.path,
    expectedRevision: entry.base?.revision ?? 'absent',
    provenance,
    conflictPolicy: 'reject',
    mediaType: 'text/markdown',
    content,
    contentSha256: createContentSha256(content),
  }
}
