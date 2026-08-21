import { assertContentSha256, type ContentSha256 } from './staged-asset.js'

export interface CompositeMutationLineageDraft {
  readonly workflowId: string
  readonly workflowVersion: 1
  readonly definitionDigest: ContentSha256
  readonly stepId: string
  readonly ordinal: number
}

export interface CompositeMutationLineage {
  readonly workflowId: string
  readonly workflowVersion: 1
  readonly definitionDigest: ContentSha256
  readonly stepId: string
  readonly ordinal: number
}

export function createCompositeMutationLineage(
  draft: CompositeMutationLineageDraft,
): CompositeMutationLineage {
  if (draft.workflowVersion !== 1) {
    throw new RangeError('Composite mutation lineage workflow version must be 1.')
  }

  return Object.freeze({
    workflowId: nonEmptyIdentifier(draft.workflowId, 'Composite mutation workflow id'),
    workflowVersion: 1 as const,
    definitionDigest: assertContentSha256(
      draft.definitionDigest,
      'Composite mutation definition digest',
    ),
    stepId: nonEmptyIdentifier(draft.stepId, 'Composite mutation step id'),
    ordinal: safeOrdinal(draft.ordinal),
  })
}

function nonEmptyIdentifier(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new RangeError(field + ' must be non-empty text without NUL bytes.')
  }
  return value
}

function safeOrdinal(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Composite mutation lineage ordinal must be a non-negative safe integer.')
  }
  return value
}
