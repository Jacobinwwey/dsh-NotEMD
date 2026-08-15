import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
  createWorkspaceMutationReceipt,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import { createRevision } from '@notemd-harness/vault'
import { LocalVault } from '@notemd-harness/vault-local'

import { WorkspaceChangeCoordinator } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-workspace-events-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

function mutationPlan(
  expectedRevision: string | 'absent',
  content: string,
): WorkspaceMutationPlan {
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.workspace-events',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-text',
        destination: 'notes/a.md',
        expectedRevision,
        provenance: {
          operationId: 'notemd.test.workspace-events',
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

test('publishes metadata-only changes from a committed receipt', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const coordinator = new WorkspaceChangeCoordinator(vault)
  await coordinator.captureSnapshot()
  const plan = mutationPlan('absent', '# A\nnew\n')
  const receipt = createWorkspaceMutationReceipt({
    planId: plan.id,
    planDigest: plan.digest,
    status: 'committed',
    mutations: [
      {
        destination: 'notes/a.md',
        kind: 'write-text',
        status: 'committed',
        revision: createRevision('# A\nnew\n'),
      },
    ],
  })

  const event = await coordinator.recordMutationReceipt(plan, receipt)

  expect(event).toMatchObject({
    origin: 'notemd-mutation-receipt',
    causationId: plan.id,
    changes: [{ path: 'notes/a.md', kind: 'created', revision: createRevision('# A\nnew\n') }],
  })
  expect(JSON.stringify(event)).not.toContain('# A\nnew\n')
})

test('publishes a committed delete as a metadata-only deletion', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), '# A\nold\n')
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/a.md')
  const coordinator = new WorkspaceChangeCoordinator(vault)
  await coordinator.captureSnapshot()
  const plan = createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.workspace-events',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'delete',
        destination: 'notes/a.md',
        expectedRevision: source.revision,
        provenance: {
          operationId: 'notemd.test.workspace-events',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        expectedContentSha256: createContentSha256(source.content),
      },
    ],
  })
  const receipt = createWorkspaceMutationReceipt({
    planId: plan.id,
    planDigest: plan.digest,
    status: 'committed',
    mutations: [{ destination: 'notes/a.md', kind: 'delete', status: 'committed' }],
  })

  const event = await coordinator.recordMutationReceipt(plan, receipt)

  expect(event).toMatchObject({
    origin: 'notemd-mutation-receipt',
    causationId: plan.id,
    changes: [{ path: 'notes/a.md', kind: 'deleted' }],
  })
})

test.each(['conflict', 'rejected', 'cancelled', 'failed'] as const)(
  'does not publish an indexable event for a %s receipt',
  async (status) => {
    const vault = await LocalVault.open(workspaceRoot)
    const coordinator = new WorkspaceChangeCoordinator(vault)
    await coordinator.captureSnapshot()
    const plan = mutationPlan('absent', '# A\nnew\n')
    const receipt = createWorkspaceMutationReceipt({
      planId: plan.id,
      planDigest: plan.digest,
      status,
      mutations: [{ destination: 'notes/a.md', kind: 'write-text', status, diagnosticCode: `mutation-${status}` }],
    })

    await expect(coordinator.recordMutationReceipt(plan, receipt)).resolves.toBeUndefined()
  },
)
