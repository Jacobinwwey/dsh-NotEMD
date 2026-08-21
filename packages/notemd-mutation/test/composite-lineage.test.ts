import { expect, test } from 'vitest'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
  type CompositeMutationLineageDraft,
  type MutationProvenanceDraft,
} from '../src/index.js'

function provenance(composite?: CompositeMutationLineageDraft): MutationProvenanceDraft {
  return {
    operationId: 'notemd.test',
    sourceRefs: ['notes/source.md'],
    evidenceRefs: [],
    ...(composite === undefined ? {} : { composite }),
  }
}

function textMutation(provenanceValue: MutationProvenanceDraft) {
  const content = 'source'
  return {
    kind: 'write-text' as const,
    destination: 'notes/source.md',
    expectedRevision: createContentSha256('before'),
    provenance: provenanceValue,
    conflictPolicy: 'reject' as const,
    mediaType: 'text/markdown',
    content,
    contentSha256: createContentSha256(content),
  }
}

function lineage(stepId: string, ordinal: number): CompositeMutationLineageDraft {
  return {
    workflowId: 'one-click-extract',
    workflowVersion: 1,
    definitionDigest: createContentSha256('one-click-extract@1'),
    stepId,
    ordinal,
  }
}

test('keeps the legacy digest when composite lineage is absent', () => {
  const base = provenance()
  const plan = createWorkspaceMutationPlan({
    provenance: base,
    mutations: [textMutation(base)],
  })

  expect(plan.digest).toBe('8b0d53125569f68384b85272483e15b1156f2fa1204d56dea88aba0246a49231')
  expect(plan.provenance).not.toHaveProperty('composite')
})

test('rejects a lineage with an empty step id or invalid ordinal', () => {
  expect(() => createWorkspaceMutationPlan({
    provenance: provenance(lineage('', 0)),
    mutations: [textMutation(provenance(lineage('', 0)))],
  })).toThrow(RangeError)

  expect(() => createWorkspaceMutationPlan({
    provenance: provenance(lineage('add-links', -1)),
    mutations: [textMutation(provenance(lineage('add-links', -1)))],
  })).toThrow(RangeError)

  expect(() => createWorkspaceMutationPlan({
    provenance: provenance({
      ...lineage('add-links', 0),
      definitionDigest: 'not-a-sha256',
    }),
    mutations: [textMutation(provenance({
      ...lineage('add-links', 0),
      definitionDigest: 'not-a-sha256',
    }))],
  })).toThrow(RangeError)
})

test('includes ordered lineage in the composite plan digest', () => {
  const firstLineage = lineage('add-links', 0)
  const secondLineage = lineage('generate-complete', 1)
  const firstProvenance = provenance(firstLineage)
  const secondProvenance = provenance(secondLineage)

  const first = createWorkspaceMutationPlan({
    provenance: firstProvenance,
    mutations: [textMutation(firstProvenance)],
  })
  const second = createWorkspaceMutationPlan({
    provenance: secondProvenance,
    mutations: [textMutation(secondProvenance)],
  })

  expect(first.digest).not.toBe(second.digest)
  expect(first.provenance.composite).toMatchObject(firstLineage)
  expect(second.provenance.composite).toMatchObject(secondLineage)
})
