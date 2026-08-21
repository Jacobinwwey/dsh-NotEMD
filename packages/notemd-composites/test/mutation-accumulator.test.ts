import { expect, test } from 'vitest'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault } from '@notemd-harness/vault'

import {
  CompositeWorkspaceView,
  CompositeWorkflowError,
} from '../src/index.js'

class MemoryVault implements NotemdVault {
  readonly physical = new Map<string, string>()

  async listMarkdown(): Promise<readonly string[]> {
    return [...this.physical.keys()].filter((path) => path.endsWith('.md')).sort()
  }

  async read(path: string) {
    const content = this.physical.get(path)
    if (content === undefined) {
      const error = new Error('missing ' + path) as Error & { code: string }
      error.code = 'VAULT_NOT_FOUND'
      throw error
    }
    return { path, content, revision: createContentSha256(content) }
  }
}

const provenance = {
  operationId: 'workflow.one-click-extract',
  sourceRefs: ['notes/a.md'],
  evidenceRefs: [],
}

const firstLineage = {
  workflowId: 'one-click-extract',
  workflowVersion: 1 as const,
  definitionDigest: createContentSha256('one-click-extract@1'),
  stepId: 'add-links',
  ordinal: 0,
}

function plan(path: string, expected: string | 'absent', content: string) {
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'write-text' as const,
      destination: path,
      expectedRevision: expected,
      provenance,
      conflictPolicy: 'reject' as const,
      mediaType: 'text/markdown',
      content,
      contentSha256: createContentSha256(content),
    }],
  })
}

test('coalesces sequential text writes into one base-revision write', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/a.md', 'base')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  await overlay.applyPlannedPlan(plan('notes/a.md', createContentSha256('base'), 'one'), firstLineage)
  await overlay.applyPlannedPlan(
    plan('notes/a.md', createContentSha256('one'), 'two'),
    { ...firstLineage, stepId: 'generate-complete', ordinal: 1 },
  )

  const finalPlan = overlay.finalize()
  expect(finalPlan.mutations).toHaveLength(1)
  expect(finalPlan.mutations[0]).toMatchObject({
    kind: 'write-text',
    destination: 'notes/a.md',
    expectedRevision: createContentSha256('base'),
    content: 'two',
  })
})

test('emits one delete for an existing base document removed by the virtual workflow', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/a.md', 'base')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  await overlay.applyPlannedPlan(
    createWorkspaceMutationPlan({
      provenance,
      mutations: [{
        kind: 'delete' as const,
        destination: 'notes/a.md',
        expectedRevision: createContentSha256('base'),
        expectedContentSha256: createContentSha256('base'),
        provenance,
        conflictPolicy: 'reject' as const,
      }],
    }),
    { ...firstLineage, stepId: 'generate-complete', ordinal: 1 },
  )

  const finalPlan = overlay.finalize()
  expect(finalPlan.mutations).toEqual([
    expect.objectContaining({
      kind: 'delete',
      destination: 'notes/a.md',
      expectedRevision: createContentSha256('base'),
    }),
  ])
})

test('fails closed for an existing destination requested as absent', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/a.md', 'base')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  await expect(
    overlay.applyPlannedPlan(plan('notes/a.md', 'absent', 'replacement'), firstLineage),
  ).rejects.toMatchObject({ code: 'composite-destination-collision' })
})

test('fails closed for an empty aggregate plan', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/a.md', 'base')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  const noOp = createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'write-text' as const,
      destination: 'notes/a.md',
      expectedRevision: createContentSha256('base'),
      provenance,
      conflictPolicy: 'reject' as const,
      mediaType: 'text/markdown',
      content: 'base',
      contentSha256: createContentSha256('base'),
    }],
  })
  await overlay.applyPlannedPlan(noOp, firstLineage)
  expect(() => overlay.finalize()).toThrow(CompositeWorkflowError)
  expect(() => overlay.finalize()).toThrow(/no net workspace mutation/i)
})
