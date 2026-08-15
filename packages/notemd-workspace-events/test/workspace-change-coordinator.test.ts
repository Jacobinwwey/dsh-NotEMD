import { expect, test } from 'vitest'

import { createRevision, createWritePlan, type NotemdVault, type VaultDocument } from '@notemd-harness/vault'

import { WorkspaceChangeCoordinator, type WorkspaceChangeEvent } from '../src/index.js'

test('publishes only successful approved writes with plan causation', async () => {
  const vault = new MemoryVault({ 'notes/a.md': '# A\nold\n' })
  const coordinator = new WorkspaceChangeCoordinator(vault)
  await coordinator.captureSnapshot()
  const events: WorkspaceChangeEvent[] = []
  coordinator.subscribe((event) => events.push(event))
  const plan = createWritePlan([{ path: 'notes/a.md', content: '# A\nnew\n', expectedRevision: createRevision('# A\nold\n') }])

  const event = await coordinator.recordApprovedPlan(plan, [
    { path: 'notes/a.md', status: 'updated', revision: createRevision('# A\nnew\n') },
    { path: 'notes/b.md', status: 'skipped-stale' },
  ])

  expect(event).toMatchObject({
    origin: 'notemd-approved-plan',
    causationId: plan.id,
    changes: [{ path: 'notes/a.md', kind: 'updated', revision: createRevision('# A\nnew\n') }],
  })
  expect(events).toEqual([event])
})

test('reconciles external create update and delete events from fresh revisions', async () => {
  const vault = new MemoryVault({
    'notes/a.md': '# A\nold\n',
    'notes/delete.md': '# Delete\nold\n',
  })
  const coordinator = new WorkspaceChangeCoordinator(vault, () => 'scan-1')
  await coordinator.captureSnapshot()
  vault.write('notes/a.md', '# A\nnew\n')
  vault.write('notes/new.md', '# New\ncreated\n')
  vault.delete('notes/delete.md')

  await expect(coordinator.scan()).resolves.toMatchObject({
    origin: 'external-scan',
    causationId: 'scan-1',
    changes: expect.arrayContaining([
      { path: 'notes/a.md', kind: 'updated', revision: createRevision('# A\nnew\n') },
      { path: 'notes/new.md', kind: 'created', revision: createRevision('# New\ncreated\n') },
      { path: 'notes/delete.md', kind: 'deleted' },
    ]),
  })
})

class MemoryVault implements NotemdVault {
  private readonly documents = new Map<string, string>()

  constructor(initial: Record<string, string>) {
    for (const [path, content] of Object.entries(initial)) {
      this.documents.set(path, content)
    }
  }

  async listMarkdown(): Promise<readonly string[]> {
    return [...this.documents.keys()].sort((left, right) => left.localeCompare(right))
  }

  async read(path: string): Promise<VaultDocument> {
    const content = this.documents.get(path)
    if (content === undefined) {
      throw Object.assign(new Error(`Missing ${path}`), { code: 'VAULT_NOT_FOUND' })
    }
    return { path, content, revision: createRevision(content) }
  }

  async apply(): Promise<readonly []> {
    return []
  }

  write(path: string, content: string): void {
    this.documents.set(path, content)
  }

  delete(path: string): void {
    this.documents.delete(path)
  }
}
