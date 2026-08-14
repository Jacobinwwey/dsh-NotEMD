import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { createWritePlan } from '@notemd-harness/vault'

import { FileApprovalLedger } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-approvals-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('does not accept an approval for a mutated plan', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const original = createWritePlan([{ path: 'notes/a.md', content: 'original', expectedRevision: 'absent' }])
  const mutated = createWritePlan([{ path: 'notes/a.md', content: 'mutated', expectedRevision: 'absent' }])

  const approval = await ledger.issue(original)

  await expect(ledger.consume(mutated, approval.approvalId)).resolves.toBe(false)
  await expect(ledger.consume(original, approval.approvalId)).resolves.toBe(true)
  await expect(ledger.consume(original, approval.approvalId)).resolves.toBe(false)
})

test('persists an unconsumed receipt across a ledger reload', async () => {
  const plan = createWritePlan([{ path: 'notes/a.md', content: 'content', expectedRevision: 'absent' }])
  const issued = await (await FileApprovalLedger.open(workspaceRoot)).issue(plan)
  const reloaded = await FileApprovalLedger.open(workspaceRoot)

  await expect(reloaded.consume(plan, issued.approvalId)).resolves.toBe(true)
})

test('rejects an expired receipt without applying a write', async () => {
  let now = 1_000
  const ledger = await FileApprovalLedger.open(workspaceRoot, { now: () => now, ttlMs: 100 })
  const plan = createWritePlan([{ path: 'notes/a.md', content: 'content', expectedRevision: 'absent' }])
  const approval = await ledger.issue(plan)
  now = 1_101

  await expect(ledger.consume(plan, approval.approvalId)).resolves.toBe(false)
})

test('consumes a receipt exactly once when callers race', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const plan = createWritePlan([{ path: 'notes/a.md', content: 'content', expectedRevision: 'absent' }])
  const approval = await ledger.issue(plan)

  const consumed = await Promise.all([
    ledger.consume(plan, approval.approvalId),
    ledger.consume(plan, approval.approvalId),
  ])

  expect(consumed.filter(Boolean)).toHaveLength(1)
})

test('persists only receipt metadata, never planned document content', async () => {
  const ledger = await FileApprovalLedger.open(workspaceRoot)
  const plan = createWritePlan([
    {
      path: 'notes/private.md',
      content: 'this planned document content must not be persisted in the approval ledger',
      expectedRevision: 'absent',
    },
  ])

  await ledger.issue(plan)

  const approvalsDirectory = join(workspaceRoot, '.notemd', 'approvals')
  const persisted = await Promise.all(
    (await readdir(approvalsDirectory)).map((fileName) => readFile(join(approvalsDirectory, fileName), 'utf8')),
  )

  expect(persisted.join('\n')).not.toContain('this planned document content')
})
