import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  createContentSha256,
  createStagedAssetRef,
  createWorkspaceMutationPlan,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'

import { FileApprovalLedger } from '../src/index.js'

let workspaceRoot = ''

function textPlan(content: string): WorkspaceMutationPlan {
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.approval',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-text',
        destination: 'notes/a.md',
        expectedRevision: 'absent',
        provenance: {
          operationId: 'notemd.test.approval',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content,
        contentSha256: createContentSha256(content),
      },
    ],
  })
}

function bytesPlan(assetId: string, content: string): WorkspaceMutationPlan {
  const sha256 = createContentSha256(content)
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.approval',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-bytes',
        destination: 'artifacts/a.svg',
        expectedRevision: 'absent',
        provenance: {
          operationId: 'notemd.test.approval',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        mediaType: 'image/svg+xml',
        contentSha256: sha256,
        stagedAsset: createStagedAssetRef({
          id: assetId,
          byteLength: Buffer.byteLength(content),
          mediaType: 'image/svg+xml',
          sha256,
        }),
      },
    ],
  })
}

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-approvals-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('does not accept an approval for a mutated plan', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const original = textPlan('original')
  const mutated = textPlan('mutated')

  const approval = await ledger.issue(original)

  await expect(ledger.consume(mutated, approval.approvalId)).resolves.toBe(false)
  await expect(ledger.consume(original, approval.approvalId)).resolves.toBe(true)
  await expect(ledger.consume(original, approval.approvalId)).resolves.toBe(false)
})

test('binds approval to staged asset digests as well as the proposal digest', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const approvedPlan = bytesPlan('asset-a', '<svg>approved</svg>')
  const substitutedPlan = bytesPlan('asset-a', '<svg>substituted</svg>')

  const approval = await ledger.issue(approvedPlan)

  expect(approval.assetDigests).toEqual([createContentSha256('<svg>approved</svg>')])
  await expect(ledger.consume(substitutedPlan, approval.approvalId)).resolves.toBe(false)
  await expect(ledger.consume(approvedPlan, approval.approvalId)).resolves.toBe(true)
})

test('persists an unconsumed receipt across a ledger reload', async () => {
  const plan = textPlan('content')
  const issued = await (await FileApprovalLedger.open(workspaceRoot)).issue(plan)
  const reloaded = await FileApprovalLedger.open(workspaceRoot)

  await expect(reloaded.consume(plan, issued.approvalId)).resolves.toBe(true)
})

test('rejects an expired receipt without applying a write', async () => {
  let now = 1_000
  const ledger = await FileApprovalLedger.open(workspaceRoot, { now: () => now, ttlMs: 100 })
  const plan = textPlan('content')
  const approval = await ledger.issue(plan)
  now = 1_101

  await expect(ledger.consume(plan, approval.approvalId)).resolves.toBe(false)
})

test('consumes a receipt exactly once when callers race', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const plan = textPlan('content')
  const approval = await ledger.issue(plan)

  const consumed = await Promise.all([
    ledger.consume(plan, approval.approvalId),
    ledger.consume(plan, approval.approvalId),
  ])

  expect(consumed.filter(Boolean)).toHaveLength(1)
})

test('persists only receipt metadata, never planned document content', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const plan = textPlan('this planned document content must not be persisted in the approval ledger')

  await ledger.issue(plan)

  const approvalsDirectory = join(workspaceRoot, '.notemd', 'approvals')
  const persisted = await Promise.all(
    (await readdir(approvalsDirectory)).map((fileName) => readFile(join(approvalsDirectory, fileName), 'utf8')),
  )

  expect(persisted.join('\n')).not.toContain('this planned document content')
})
