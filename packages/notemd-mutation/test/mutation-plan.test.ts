import { createHash } from 'node:crypto'

import { expect, test } from 'vitest'

import {
  createStagedAssetRef,
  createWorkspaceMutationPlan,
  createWorkspaceMutationReceipt,
  type MutationProvenanceDraft,
  type MutationReceiptEntry,
  type StagedAssetRef,
  type WorkspaceMutationDraft,
  type WriteTextMutationDraft,
} from '../src/index.js'

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function provenance(operationId = 'notemd.test'): MutationProvenanceDraft {
  return {
    operationId,
    sourceRefs: ['notes/source.md'],
    evidenceRefs: [],
  }
}

function textMutation(destination = 'notes/source.md', content = 'source'): WriteTextMutationDraft {
  return {
    kind: 'write-text',
    destination,
    expectedRevision: sha256('before'),
    provenance: provenance(),
    conflictPolicy: 'reject',
    mediaType: 'text/markdown',
    content,
    contentSha256: sha256(content),
  }
}

function stagedAsset(): StagedAssetRef {
  return {
    id: 'asset-atomic-write',
    byteLength: 3,
    mediaType: 'image/svg+xml',
    sha256: sha256('svg'),
  }
}

test('creates the same content-addressed plan regardless of mutation input order', () => {
  const first = createWorkspaceMutationPlan({
    provenance: provenance('notemd.chapter-split'),
    mutations: [
      textMutation('chapters/b.md', 'B'),
      {
        kind: 'delete',
        destination: 'chapters/a.md',
        expectedRevision: sha256('A'),
        expectedContentSha256: sha256('A'),
        provenance: provenance('notemd.chapter-split'),
        conflictPolicy: 'reject',
      },
    ],
  })
  const second = createWorkspaceMutationPlan({
    provenance: provenance('notemd.chapter-split'),
    mutations: [...first.mutations].reverse(),
  })

  expect(first).toEqual(second)
  expect(first.id).toBe(`notemd-mutation-${first.digest.slice(0, 20)}`)
  expect(first.mutations.map((entry) => entry.destination)).toEqual(['chapters/a.md', 'chapters/b.md'])
})

test('rejects duplicate destinations before a plan receives an authority digest', () => {
  expect(() =>
    createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [
        textMutation('notes/source.md'),
        {
          kind: 'delete',
          destination: 'notes/source.md',
          expectedRevision: sha256('source'),
          expectedContentSha256: sha256('source'),
          provenance: provenance(),
          conflictPolicy: 'reject',
        },
      ],
    }),
  ).toThrow(/destination/i)
})

test('rejects a text mutation whose claimed content digest does not bind its UTF-8 content', () => {
  expect(() =>
    createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [{ ...textMutation(), contentSha256: sha256('different') }],
    }),
  ).toThrow(/digest/i)
})

test('permits an empty text payload when its SHA-256 still binds the exact content', () => {
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textMutation('notes/empty.md', '')],
  })

  expect(plan.mutations[0]).toMatchObject({
    kind: 'write-text',
    destination: 'notes/empty.md',
    content: '',
    contentSha256: sha256(''),
  })
})

test('rejects a bytes mutation whose staged asset cannot prove its content and media identity', () => {
  expect(() =>
    createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [
        {
          kind: 'write-bytes',
          destination: 'diagrams/atomic.svg',
          expectedRevision: 'absent',
          provenance: provenance(),
          conflictPolicy: 'reject',
          mediaType: 'image/svg+xml',
          contentSha256: sha256('different'),
          stagedAsset: stagedAsset(),
        },
      ],
    }),
  ).toThrow(/staged asset|digest/i)
})

test('requires a concrete existing revision and digest before deleting a workspace path', () => {
  expect(() =>
    createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [
        {
          kind: 'delete',
          destination: 'notes/source.md',
          expectedRevision: 'absent',
          expectedContentSha256: sha256('source'),
          provenance: provenance(),
          conflictPolicy: 'reject',
        },
      ],
    }),
  ).toThrow(/delete|revision/i)
})

test('rejects malformed staged asset references before they can name a staging path', () => {
  expect(() =>
    createStagedAssetRef({
      ...stagedAsset(),
      id: '../escape',
    }),
  ).toThrow(/staged asset/i)
})

test('rejects malformed JSON values with mutation-boundary diagnostics', () => {
  expect(() =>
    createWorkspaceMutationPlan({
      provenance: provenance(),
      mutations: [{ ...textMutation(), destination: 42 as unknown as string }],
    }),
  ).toThrow(/mutation destination/i)

  expect(() =>
    createStagedAssetRef({
      ...stagedAsset(),
      mediaType: 42 as unknown as string,
    }),
  ).toThrow(/media type/i)
})

test('freezes a defensive plan snapshot instead of retaining caller-owned arrays and objects', () => {
  const draft = textMutation()
  const mutations: WorkspaceMutationDraft[] = [draft]
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations,
  })

  mutations[0] = textMutation('notes/changed.md')

  expect(plan.mutations[0]?.destination).toBe('notes/source.md')
  expect(Object.isFrozen(plan)).toBe(true)
  expect(Object.isFrozen(plan.mutations)).toBe(true)
  expect(Object.isFrozen(plan.mutations[0])).toBe(true)
  expect(Object.isFrozen(plan.provenance.sourceRefs)).toBe(true)
})

test('creates receipts from an allowlisted summary without copying workspace payloads', () => {
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textMutation()],
  })
  const receipt = createWorkspaceMutationReceipt({
    planId: plan.id,
    planDigest: plan.digest,
    status: 'committed',
    mutations: [
      {
        destination: 'notes/source.md',
        kind: 'write-text',
        status: 'committed',
        revision: sha256('source'),
      },
    ],
  })

  expect(receipt).toEqual({
    version: 1,
    planId: plan.id,
    planDigest: plan.digest,
    status: 'committed',
    mutations: [
      {
        destination: 'notes/source.md',
        kind: 'write-text',
        status: 'committed',
        revision: sha256('source'),
      },
    ],
  })
  expect(receipt.mutations[0]).not.toHaveProperty('content')
  expect(receipt.mutations[0]).not.toHaveProperty('stagedAsset')
})

test('rejects receipt states outside the closed mutation vocabulary', () => {
  const plan = createWorkspaceMutationPlan({
    provenance: provenance(),
    mutations: [textMutation()],
  })

  expect(() =>
    createWorkspaceMutationReceipt({
      planId: plan.id,
      planDigest: plan.digest,
      status: 'pending' as unknown as MutationReceiptEntry['status'],
      mutations: [
        {
          destination: 'notes/source.md',
          kind: 'write-text',
          status: 'committed',
        },
      ],
    }),
  ).toThrow(/closed receipt vocabulary/i)
})
