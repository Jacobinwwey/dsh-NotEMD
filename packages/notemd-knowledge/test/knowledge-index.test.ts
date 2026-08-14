import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import { VaultKnowledgeIndex } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-knowledge-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('rebuilds derived matches from vault documents', async () => {
  await writeFile(
    join(workspaceRoot, 'notes', 'architecture.md'),
    '# Atomic Writes\n\nAtomic writes preserve document integrity.',
  )
  const index = new VaultKnowledgeIndex(await LocalVault.open(workspaceRoot))

  await index.rebuild()

  await expect(index.search('atomic writes')).resolves.toMatchObject([
    { path: 'notes/architecture.md', title: 'Atomic Writes' },
  ])
})

test('does not return deleted document content after a rebuild', async () => {
  const path = join(workspaceRoot, 'notes', 'temporary.md')
  await writeFile(path, '# Temporary\n\nA unique indexed phrase.')
  const vault = await LocalVault.open(workspaceRoot)
  const index = new VaultKnowledgeIndex(vault)
  await index.rebuild()
  await rm(path)

  await index.rebuild()

  await expect(index.search('unique indexed phrase')).resolves.toEqual([])
})
