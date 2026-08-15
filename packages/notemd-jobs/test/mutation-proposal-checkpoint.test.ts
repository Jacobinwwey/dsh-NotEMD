import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { createContentSha256, createWorkspaceMutationPlan } from '@notemd-harness/mutation'

import { FileJobStore, createMutationProposalCheckpoint } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-mutation-checkpoint-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('persists only mutation proposal identity and evidence references in job checkpoints', async () => {
  const secret = 'checkpoint must not persist planned text or binary bytes'
  const plan = createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.job-checkpoint',
      sourceRefs: ['notes/private.md'],
      evidenceRefs: ['evidence:research-1'],
    },
    mutations: [
      {
        kind: 'write-text',
        destination: 'notes/private.md',
        expectedRevision: 'absent',
        provenance: {
          operationId: 'notemd.test.job-checkpoint',
          sourceRefs: ['notes/private.md'],
          evidenceRefs: ['evidence:research-1'],
        },
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content: secret,
        contentSha256: createContentSha256(secret),
      },
    ],
  })
  const store = await FileJobStore.open(workspaceRoot)
  const job = await store.start({
    workflow: 'formula-repair',
    idempotencyKey: 'checkpoint-metadata-only',
    input: {},
    targets: ['notes/private.md'],
  })
  await store.markRunning(job.id)

  await store.recordTargetCheckpoint(job.id, {
    target: 'notes/private.md',
    status: 'completed',
    checkpoint: createMutationProposalCheckpoint(plan),
  })

  const persisted = await readFile(join(workspaceRoot, '.notemd', 'jobs', `${job.id}.json`), 'utf8')
  expect(persisted).not.toContain(secret)
  expect(persisted).toContain(plan.id)
  expect(persisted).toContain(plan.digest)
  expect(persisted).toContain('evidence:research-1')
})
