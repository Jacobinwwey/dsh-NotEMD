import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type MutationProvenanceDraft,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { VaultDocument } from '@notemd-harness/vault'

export interface WorkflowMutationContext {
  readonly operationId: string
  readonly sourceRefs: readonly string[]
  readonly evidenceRefs: readonly string[]
}

export function replaceDocumentPlan(
  document: VaultDocument,
  content: string,
  context: WorkflowMutationContext,
): WorkspaceMutationPlan {
  const provenance = provenanceOf(context)
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [
      {
        kind: 'write-text',
        destination: document.path,
        expectedRevision: document.revision,
        provenance,
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content,
        contentSha256: createContentSha256(content),
      },
    ],
  })
}

export function createDocumentPlan(
  path: string,
  content: string,
  context: WorkflowMutationContext,
): WorkspaceMutationPlan {
  const provenance = provenanceOf(context)
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [
      {
        kind: 'write-text',
        destination: path,
        expectedRevision: 'absent',
        provenance,
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content,
        contentSha256: createContentSha256(content),
      },
    ],
  })
}

export function translationTargetPath(sourcePath: string, language: string): string {
  const normalizedLanguage = language.trim()
  if (!/^[a-z]{2,3}(?:-[A-Z]{2})?$/u.test(normalizedLanguage)) {
    throw new RangeError(`Translation language must be a BCP 47 language tag: ${language}`)
  }
  return `translations/${normalizedLanguage}/${sourcePath}`
}

function provenanceOf(context: WorkflowMutationContext): MutationProvenanceDraft {
  return {
    operationId: context.operationId,
    sourceRefs: context.sourceRefs,
    evidenceRefs: context.evidenceRefs,
  }
}
