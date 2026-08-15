import {
  assertContentSha256,
  canonicalMediaType,
  createContentSha256,
  createStagedAssetRef,
  type ContentSha256,
  type StagedAssetRef,
} from './staged-asset.js'

export type WorkspaceRevision = string
export type ExpectedWorkspaceRevision = WorkspaceRevision | 'absent'
export type MutationConflictPolicy = 'reject'

export interface MutationProvenanceDraft {
  readonly operationId: string
  readonly sourceRefs: readonly string[]
  readonly evidenceRefs: readonly string[]
}

export interface MutationProvenance {
  readonly operationId: string
  readonly sourceRefs: readonly string[]
  readonly evidenceRefs: readonly string[]
}

interface WorkspaceMutationDraftBase {
  readonly destination: string
  readonly expectedRevision: ExpectedWorkspaceRevision
  readonly provenance: MutationProvenanceDraft
  readonly conflictPolicy: MutationConflictPolicy
}

export interface WriteTextMutationDraft extends WorkspaceMutationDraftBase {
  readonly kind: 'write-text'
  readonly mediaType: string
  readonly content: string
  readonly contentSha256: ContentSha256
}

export interface WriteBytesMutationDraft extends WorkspaceMutationDraftBase {
  readonly kind: 'write-bytes'
  readonly mediaType: string
  readonly contentSha256: ContentSha256
  readonly stagedAsset: StagedAssetRef
}

export interface DeleteMutationDraft extends WorkspaceMutationDraftBase {
  readonly kind: 'delete'
  readonly expectedContentSha256: ContentSha256
}

export type WorkspaceMutationDraft =
  | WriteTextMutationDraft
  | WriteBytesMutationDraft
  | DeleteMutationDraft

interface WorkspaceMutationBase {
  readonly destination: string
  readonly expectedRevision: ExpectedWorkspaceRevision
  readonly provenance: MutationProvenance
  readonly conflictPolicy: MutationConflictPolicy
}

export interface WriteTextMutation extends WorkspaceMutationBase {
  readonly kind: 'write-text'
  readonly mediaType: string
  readonly content: string
  readonly contentSha256: ContentSha256
}

export interface WriteBytesMutation extends WorkspaceMutationBase {
  readonly kind: 'write-bytes'
  readonly mediaType: string
  readonly contentSha256: ContentSha256
  readonly stagedAsset: StagedAssetRef
}

export interface DeleteMutation extends WorkspaceMutationBase {
  readonly kind: 'delete'
  readonly expectedContentSha256: ContentSha256
}

export type WorkspaceMutation = WriteTextMutation | WriteBytesMutation | DeleteMutation

export interface WorkspaceMutationPlanDraft {
  readonly provenance: MutationProvenanceDraft
  readonly mutations: readonly WorkspaceMutationDraft[]
}

export interface WorkspaceMutationPlan {
  readonly version: 1
  readonly id: string
  readonly digest: ContentSha256
  readonly provenance: MutationProvenance
  readonly mutations: readonly WorkspaceMutation[]
}

export function createWorkspaceMutationPlan(draft: WorkspaceMutationPlanDraft): WorkspaceMutationPlan {
  const provenance = cloneProvenance(draft.provenance)
  const mutations = draft.mutations.map(cloneMutation).sort(compareMutationDestination)

  if (mutations.length === 0) {
    throw new RangeError('A workspace mutation plan must contain at least one mutation.')
  }

  for (let index = 1; index < mutations.length; index += 1) {
    const previous = mutations[index - 1]
    const current = mutations[index]
    if (previous === undefined || current === undefined) {
      throw new Error('Mutation ordering lost an entry before duplicate validation.')
    }
    if (previous.destination === current.destination) {
      throw new RangeError(`A workspace mutation plan may contain each destination only once: ${current.destination}`)
    }
  }

  const frozenMutations = Object.freeze(mutations)
  const digest = createContentSha256(JSON.stringify(canonicalPlan(provenance, frozenMutations)))

  return Object.freeze({
    version: 1,
    id: `notemd-mutation-${digest.slice(0, 20)}`,
    digest,
    provenance,
    mutations: frozenMutations,
  })
}

function cloneMutation(draft: WorkspaceMutationDraft): WorkspaceMutation {
  const base = cloneMutationBase(draft)

  switch (draft.kind) {
    case 'write-text': {
      const content = requireContentText(draft.content, 'Text mutation content')
      const contentSha256 = assertContentSha256(draft.contentSha256, 'Text mutation content SHA-256')
      if (createContentSha256(content) !== contentSha256) {
        throw new RangeError('A text mutation content digest must match its UTF-8 content.')
      }
      return Object.freeze({
        ...base,
        kind: 'write-text',
        mediaType: canonicalMediaType(draft.mediaType),
        content,
        contentSha256,
      })
    }
    case 'write-bytes': {
      const stagedAsset = createStagedAssetRef(draft.stagedAsset)
      const mediaType = canonicalMediaType(draft.mediaType)
      const contentSha256 = assertContentSha256(draft.contentSha256, 'Bytes mutation content SHA-256')
      if (stagedAsset.mediaType !== mediaType || stagedAsset.sha256 !== contentSha256) {
        throw new RangeError('A bytes mutation staged asset must match its declared media type and content digest.')
      }
      return Object.freeze({
        ...base,
        kind: 'write-bytes',
        mediaType,
        contentSha256,
        stagedAsset,
      })
    }
    case 'delete': {
      if (base.expectedRevision === 'absent') {
        throw new RangeError('A delete mutation requires a concrete expected revision.')
      }
      return Object.freeze({
        ...base,
        kind: 'delete',
        expectedContentSha256: assertContentSha256(
          draft.expectedContentSha256,
          'Delete mutation expected content SHA-256',
        ),
      })
    }
  }
}

function cloneMutationBase(draft: WorkspaceMutationDraft): WorkspaceMutationBase {
  if (draft.conflictPolicy !== 'reject') {
    throw new RangeError('The mutation conflict policy must reject mismatched revisions.')
  }

  return Object.freeze({
    destination: canonicalDestination(draft.destination),
    expectedRevision: assertExpectedRevision(draft.expectedRevision),
    provenance: cloneProvenance(draft.provenance),
    conflictPolicy: 'reject',
  })
}

function cloneProvenance(draft: MutationProvenanceDraft): MutationProvenance {
  return Object.freeze({
    operationId: requireNonEmptyText(draft.operationId, 'Mutation provenance operation id'),
    sourceRefs: freezeReferenceList(draft.sourceRefs, 'Mutation provenance source reference'),
    evidenceRefs: freezeReferenceList(draft.evidenceRefs, 'Mutation provenance evidence reference'),
  })
}

function freezeReferenceList(values: readonly string[], field: string): readonly string[] {
  const normalized = values.map((value) => requireNonEmptyText(value, field)).sort(compareText)

  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1] === normalized[index]) {
      throw new RangeError(`${field}s must not contain duplicates.`)
    }
  }

  return Object.freeze(normalized)
}

function assertExpectedRevision(value: ExpectedWorkspaceRevision): ExpectedWorkspaceRevision {
  if (value === 'absent') {
    return value
  }
  return requireNonEmptyText(value, 'Expected workspace revision')
}

function canonicalDestination(value: string): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.includes('\\') ||
    value.startsWith('/') ||
    /^[A-Za-z]:/u.test(value)
  ) {
    throw new RangeError('A mutation destination must be a relative slash-separated workspace path.')
  }

  const segments = value.split('/')
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..' || segment.includes('\u0000'))) {
    throw new RangeError('A mutation destination must not contain empty, dot, or parent segments.')
  }
  return segments.join('/')
}

function canonicalPlan(provenance: MutationProvenance, mutations: readonly WorkspaceMutation[]): unknown {
  return {
    version: 1,
    provenance: canonicalProvenance(provenance),
    mutations: mutations.map((mutation) => {
      const common = {
        kind: mutation.kind,
        destination: mutation.destination,
        expectedRevision: mutation.expectedRevision,
        provenance: canonicalProvenance(mutation.provenance),
        conflictPolicy: mutation.conflictPolicy,
      }

      switch (mutation.kind) {
        case 'write-text':
          return {
            ...common,
            mediaType: mutation.mediaType,
            content: mutation.content,
            contentSha256: mutation.contentSha256,
          }
        case 'write-bytes':
          return {
            ...common,
            mediaType: mutation.mediaType,
            contentSha256: mutation.contentSha256,
            stagedAsset: {
              id: mutation.stagedAsset.id,
              byteLength: mutation.stagedAsset.byteLength,
              mediaType: mutation.stagedAsset.mediaType,
              sha256: mutation.stagedAsset.sha256,
            },
          }
        case 'delete':
          return {
            ...common,
            expectedContentSha256: mutation.expectedContentSha256,
          }
      }
    }),
  }
}

function canonicalProvenance(provenance: MutationProvenance): object {
  return {
    operationId: provenance.operationId,
    sourceRefs: provenance.sourceRefs,
    evidenceRefs: provenance.evidenceRefs,
  }
}

function compareMutationDestination(left: WorkspaceMutation, right: WorkspaceMutation): number {
  return compareText(left.destination, right.destination)
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}

function requireContentText(value: string, field: string): string {
  if (typeof value !== 'string' || value.includes('\u0000')) {
    throw new RangeError(`${field} must be text without NUL bytes.`)
  }
  return value
}

function requireNonEmptyText(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new RangeError(`${field} must be non-empty text without NUL bytes.`)
  }
  return value
}
