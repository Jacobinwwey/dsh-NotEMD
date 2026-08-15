import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { createWorkspaceMutationPlan } from '@notemd-harness/mutation'
import { createRevision, createWritePlan } from '@notemd-harness/vault'

import { LocalVault } from '../src/index.js'

let workspaceRoot = ''
let outsideRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-vault-'))
  outsideRoot = await mkdtemp(join(tmpdir(), 'notemd-outside-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
  await rm(outsideRoot, { recursive: true, force: true })
})

function planFor(path: string, content: string, expectedRevision: string | 'absent') {
  return createWritePlan([{ path, content, expectedRevision }])
}

test('rejects traversal and absolute paths before filesystem access', async () => {
  const vault = await LocalVault.open(workspaceRoot)

  await expect(vault.read('../outside.md')).rejects.toMatchObject({ code: 'VAULT_PATH_INVALID' })
  await expect(vault.read('C:/outside.md')).rejects.toMatchObject({ code: 'VAULT_PATH_INVALID' })
})

test('rejects a path that escapes through a symlink', async () => {
  await writeFile(join(outsideRoot, 'secret.md'), 'outside')
  await symlink(outsideRoot, join(workspaceRoot, 'escape'), 'junction')
  const vault = await LocalVault.open(workspaceRoot)

  await expect(vault.read('escape/secret.md')).rejects.toMatchObject({ code: 'VAULT_PATH_ESCAPE' })
})

test('creates an absent document with an exact revision', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const [result] = await vault.apply(planFor('notes/a.md', 'first', 'absent'))

  expect(result).toMatchObject({ path: 'notes/a.md', status: 'created' })
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('first')
  expect((await vault.read('notes/a.md')).revision).toBe(result.revision)
})

test('does not overwrite a changed document', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const vault = await LocalVault.open(workspaceRoot)
  const before = await vault.read('notes/a.md')
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'newer')

  const [result] = await vault.apply(planFor('notes/a.md', 'replacement', before.revision))

  expect(result).toMatchObject({ path: 'notes/a.md', status: 'skipped-stale' })
  expect(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8')).toBe('newer')
})

test('serializes competing writes for the same revision', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const vault = await LocalVault.open(workspaceRoot)
  const before = await vault.read('notes/a.md')

  const results = await Promise.all([
    vault.apply(planFor('notes/a.md', 'first writer', before.revision)),
    vault.apply(planFor('notes/a.md', 'second writer', before.revision)),
  ])

  expect(results.flat().map(({ status }) => status).sort()).toEqual(['skipped-stale', 'updated'])
  expect(['first writer', 'second writer']).toContain(
    await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8'),
  )
})

test('serializes a mutation proposal against a legacy write plan through shared target locks', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), 'before')
  const vault = await LocalVault.open(workspaceRoot)
  const before = await vault.read('notes/a.md')
  const mutationContent = 'mutation writer'
  const mutationPlan = createWorkspaceMutationPlan({
    provenance: {
      operationId: 'notemd.test.shared-lock',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-text',
        destination: 'notes/a.md',
        expectedRevision: before.revision,
        provenance: {
          operationId: 'notemd.test.shared-lock',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content: mutationContent,
        contentSha256: createRevision(mutationContent),
      },
    ],
  })

  const [legacyResults, mutationReceipt] = await Promise.all([
    vault.apply(planFor('notes/a.md', 'legacy writer', before.revision)),
    vault.applyMutationPlan(mutationPlan),
  ])

  expect([
    [legacyResults[0]?.status, mutationReceipt.status],
  ]).toContainEqual(['updated', 'conflict'])
  expect(['legacy writer', mutationContent]).toContain(await readFile(join(workspaceRoot, 'notes', 'a.md'), 'utf8'))
})

test('lists markdown while excluding internal Notemd state', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'a.md'), '# A')
  await mkdir(join(workspaceRoot, '.notemd'))
  await writeFile(join(workspaceRoot, '.notemd', 'internal.md'), '# Internal')
  const vault = await LocalVault.open(workspaceRoot)

  await expect(vault.listMarkdown()).resolves.toEqual(['notes/a.md'])
})
