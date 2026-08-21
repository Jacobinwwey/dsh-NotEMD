import { expect, test } from 'vitest'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault, VaultDocument } from '@notemd-harness/vault'

import {
  CompositeWorkspaceView,
  type CompositeWorkspaceLimits,
} from '../src/index.js'

class MemoryVault implements NotemdVault {
  readonly physical = new Map<string, string>()
  reads = 0

  async listMarkdown(): Promise<readonly string[]> {
    return [...this.physical.keys()].filter((path) => path.endsWith('.md')).sort()
  }

  async read(path: string): Promise<VaultDocument> {
    this.reads += 1
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
  sourceRefs: ['notes/source.md'],
  evidenceRefs: [],
}

const lineage = {
  workflowId: 'one-click-extract',
  workflowVersion: 1 as const,
  definitionDigest: createContentSha256('one-click-extract@1'),
  stepId: 'add-links',
  ordinal: 0,
}

function writePlan(path: string, before: string, after: string) {
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'write-text' as const,
      destination: path,
      expectedRevision: createContentSha256(before),
      provenance,
      conflictPolicy: 'reject' as const,
      mediaType: 'text/markdown',
      content: after,
      contentSha256: createContentSha256(after),
    }],
  })
}

function deletePlan(path: string, content: string) {
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'delete' as const,
      destination: path,
      expectedRevision: createContentSha256(content),
      expectedContentSha256: createContentSha256(content),
      provenance,
      conflictPolicy: 'reject' as const,
    }],
  })
}

function createPlan(path: string, content: string) {
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'write-text' as const,
      destination: path,
      expectedRevision: 'absent' as const,
      provenance,
      conflictPolicy: 'reject' as const,
      mediaType: 'text/markdown',
      content,
      contentSha256: createContentSha256(content),
    }],
  })
}

function deleteVirtualPlan(path: string, content: string) {
  return createWorkspaceMutationPlan({
    provenance,
    mutations: [{
      kind: 'delete' as const,
      destination: path,
      expectedRevision: createContentSha256(content),
      expectedContentSha256: createContentSha256(content),
      provenance,
      conflictPolicy: 'reject' as const,
    }],
  })
}

test('makes a planned Markdown write visible to the next step without touching disk', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/source.md', 'old')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  await overlay.applyPlannedPlan(writePlan('notes/source.md', 'old', 'new'), lineage)

  await expect(overlay.read('notes/source.md')).resolves.toMatchObject({
    content: 'new',
    revision: createContentSha256('new'),
  })
  expect(base.physical.get('notes/source.md')).toBe('old')
  expect(base.reads).toBe(1)
})

test('removes a planned delete from listMarkdown without touching disk', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/source.md', 'old')
  const overlay = new CompositeWorkspaceView(base, { provenance })
  const deleteLineage = { ...lineage, stepId: 'repair-mermaid', ordinal: 2 }

  await overlay.applyPlannedPlan(deletePlan('notes/source.md', 'old'), deleteLineage)

  await expect(overlay.listMarkdown()).resolves.not.toContain('notes/source.md')
  expect(base.physical.get('notes/source.md')).toBe('old')
})

test('fails closed when a later plan uses a stale virtual revision', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/source.md', 'old')
  const overlay = new CompositeWorkspaceView(base, { provenance })

  await overlay.applyPlannedPlan(writePlan('notes/source.md', 'old', 'new'), lineage)
  await expect(
    overlay.applyPlannedPlan(writePlan('notes/source.md', 'old', 'stale'), { ...lineage, ordinal: 1 }),
  ).rejects.toMatchObject({ code: 'composite-virtual-revision-conflict' })
})

test('coalesces a virtual create followed by delete into a net no-op', async () => {
  const base = new MemoryVault()
  const overlay = new CompositeWorkspaceView(base, { provenance })
  const path = 'notes/generated.md'

  await overlay.applyPlannedPlan(createPlan(path, 'generated'), lineage)
  await overlay.applyPlannedPlan(deleteVirtualPlan(path, 'generated'), { ...lineage, stepId: 'repair-mermaid', ordinal: 2 })

  await expect(overlay.listMarkdown()).resolves.not.toContain(path)
  expect(() => overlay.finalize()).toThrowError(expect.objectContaining({ code: 'composite-no-op' }))
})

test('enforces virtual file and completion input budgets', async () => {
  const base = new MemoryVault()
  base.physical.set('notes/source.md', 'old')
  const limits: Partial<CompositeWorkspaceLimits> = {
    maxVirtualFiles: 1,
    maxVirtualBytes: 3,
    maxCompletionInputBytes: 3,
  }
  const overlay = new CompositeWorkspaceView(base, { provenance, limits })

  expect(() => overlay.assertCompletionInputBudget('four')).toThrow(/completion input/i)
  await expect(
    overlay.applyPlannedPlan(writePlan('notes/source.md', 'old', 'long'), lineage),
  ).rejects.toMatchObject({ code: 'composite-budget-exceeded' })
})
