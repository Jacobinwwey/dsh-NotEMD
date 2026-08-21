import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

interface CompositeSourceLock {
  readonly version: 1
  readonly source: {
    readonly commit: string
    readonly historicalOracle: string
    readonly defaultWorkflowName: string
    readonly defaultActionIds: readonly string[]
  }
  readonly request: {
    readonly sourcePath: string
    readonly conceptFolderPath: string
    readonly completedFolderPath: string
    readonly mermaidFolderPath: string
    readonly mermaidErrorFolderPath: string
  }
  readonly inputPaths: readonly string[]
  readonly expectedOutputPaths: readonly string[]
  readonly collisionCases: readonly { readonly id: string; readonly path: string; readonly disposition: string }[]
  readonly failureCases: readonly { readonly id: string; readonly disposition: string }[]
}

const fixtureRoot = new URL('../../../fixtures/migration/', import.meta.url)

async function loadLock(): Promise<CompositeSourceLock> {
  return JSON.parse(await readFile(new URL('composite-source-lock.json', fixtureRoot), 'utf8')) as CompositeSourceLock
}

test('records the source default workflow actions in order', async () => {
  const lock = await loadLock()

  expect(lock.version).toBe(1)
  expect(lock.source).toMatchObject({
    commit: '07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5',
    historicalOracle: '4168a51cd19ad8c3d1e05f604b50936255461a31',
    defaultWorkflowName: 'One-Click Extract',
  })
  expect(lock.source.defaultActionIds).toEqual([
    'process-current-add-links',
    'batch-generate-from-titles',
    'batch-mermaid-fix',
  ])
})

test('requires explicit destination and unresolved-error paths', async () => {
  const lock = await loadLock()

  expect(lock.request).toEqual({
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    mermaidErrorFolderPath: 'mermaid-errors',
  })
  expect(lock.inputPaths).toEqual([
    'notes/source.md',
    'concepts/alpha.md',
    'concepts/beta.md',
  ])
  expect(lock.expectedOutputPaths).toContain('completed/alpha.md')
  expect(lock.expectedOutputPaths).toContain('mermaid-errors/report.md')
})

test('pins collision and failure dispositions instead of silently skipping them', async () => {
  const lock = await loadLock()

  expect(lock.collisionCases).toEqual([
    {
      id: 'completed-destination-exists',
      path: 'completed/alpha.md',
      disposition: 'reject-before-approval',
    },
    {
      id: 'mermaid-error-destination-exists',
      path: 'mermaid-errors/alpha.md',
      disposition: 'reject-before-approval',
    },
  ])
  expect(lock.failureCases.map((failure) => failure.id)).toEqual([
    'source-revision-changed',
    'malformed-llm-markdown',
    'cancelled-between-steps',
  ])
})

test('pins deterministic Markdown fixture inputs', async () => {
  const expectedHashes = {
    'one-click-extract/notes/source.md': '56df038e507aa502d1b93ec1e9954489c9257b4617e966209ac0abbccad75224',
    'one-click-extract/concepts/alpha.md': '7edd5c201912863622a09a229121e7f5d8724fb94a016f02d891a1eb8e17973d',
    'one-click-extract/concepts/beta.md': '1e368948123ac89f2384b28e95ce20f93debe7bc528937daa4d2a14c778e4c07',
    'one-click-extract/mermaid/alpha.md': 'ee3680cde32fd4c45381ac38195a71c54c3e1fe021867c7e13d6e4b496e277fa',
  }

  for (const [path, expectedHash] of Object.entries(expectedHashes)) {
    const content = await readFile(new URL(path, fixtureRoot), 'utf8')
    expect(createHash('sha256').update(content, 'utf8').digest('hex'), path).toBe(expectedHash)
  }
})
