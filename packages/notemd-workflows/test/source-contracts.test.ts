import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

type OperationDisposition = 'included' | 'excluded-by-design' | 'excluded-wip'

interface MigrationOperation {
  readonly id: string
  readonly disposition: OperationDisposition
  readonly reason?: string
  readonly fixtureIds: readonly string[]
}

interface MigrationFixture {
  readonly id: string
  readonly inputPath: string
  readonly inputSha256: string
  readonly expected: {
    readonly outputSchema: string
    readonly targetPaths: readonly string[]
    readonly citationIds: readonly string[]
    readonly mutationPreconditions: Readonly<Record<string, 'source-revision' | 'absent'>>
  }
}

interface SourceOperationMatrix {
  readonly source: {
    readonly commit: string
    readonly registryPath: string
    readonly intake: {
      readonly lockPath: string
      readonly candidateCommit: string
      readonly status: 'audit-only'
    }
  }
  readonly operations: readonly MigrationOperation[]
  readonly fixtures: readonly MigrationFixture[]
  readonly excludedWip: readonly {
    readonly sourcePath: string
    readonly disposition: 'excluded-wip'
    readonly reason: string
  }[]
}

const sourceOperationIds = [
  'provider.diagnostic.run',
  'provider.diagnostic.stability-run',
  'diagram.generate',
  'diagram.preview',
  'provider.connection.test',
  'editor.create-link-and-generate',
  'file.process-add-links',
  'file.process-folder-add-links',
  'content.generate-from-title',
  'content.batch-generate-from-titles',
  'content.split-note-by-chapters',
  'research.summarize-topic',
  'translate.file',
  'translate.folder-batch',
  'concept.extract-file',
  'concept.extract-folder',
  'content.extract-original-text',
  'workflow.extract-and-generate',
  'duplicate.check-file',
  'concept.dedupe',
  'mermaid.batch-fix',
  'formula.fix-file',
  'formula.batch-fix',
  'cli.capability-manifest.export',
  'cli.invocation-contract.export',
  'cli.public-surface.export',
  'provider.profile.export',
  'provider.profile.export-redacted',
  'provider.profile.import',
] as const

const requiredFixtureIds = [
  'wiki-links',
  'title-generation',
  'chapter-split',
  'research-synthesis',
  'translation',
  'concept-extraction',
  'original-text',
  'extract-and-generate',
  'duplicate-reconciliation',
  'mermaid-repair',
  'formula-repair',
  'local-retrieval',
  'diagram-source',
  'slide-source',
] as const

const excludedWip = [
  {
    sourcePath: 'src/diagram/adapters/drawnix/drawnixCrossRootRouter.ts',
    disposition: 'excluded-wip',
    reason: 'Uncommitted source-worktree routing experiment is not a reproducible parity oracle.',
  },
  {
    sourcePath: 'src/diagram/adapters/drawnix/drawnixMindMapProjection.ts',
    disposition: 'excluded-wip',
    reason: 'Uncommitted source-worktree projection experiment is not a reproducible parity oracle.',
  },
  {
    sourcePath: 'src/diagram/adapters/drawnix/drawnixRelationLaneLayout.ts',
    disposition: 'excluded-wip',
    reason: 'Uncommitted source-worktree layout experiment is not a reproducible parity oracle.',
  },
  {
    sourcePath: 'src/tests/fixtures/',
    disposition: 'excluded-wip',
    reason: 'The source working tree contains untracked Drawnix fixture material outside the pinned commit.',
  },
] as const

const fixtureRoot = new URL('../../../fixtures/migration/', import.meta.url)
const matrixUrl = new URL('source-operation-matrix.json', fixtureRoot)

async function loadMatrix(): Promise<SourceOperationMatrix> {
  return JSON.parse(await readFile(matrixUrl, 'utf8')) as SourceOperationMatrix
}

test('classifies exactly the operation registry pinned for migration', async () => {
  const matrix = await loadMatrix()

  expect(matrix.source).toEqual({
    commit: '4168a51cd19ad8c3d1e05f604b50936255461a31',
    registryPath: 'src/operations/registry.ts',
    intake: {
      lockPath: 'fixtures/migration/source-intake-lock.json',
      candidateCommit: 'cdf580c6c876190ecc1040caea08e5ba5bee004f',
      status: 'audit-only',
    },
  })
  expect(matrix.operations.map((operation) => operation.id).sort()).toEqual([...sourceOperationIds].sort())
  expect(new Set(matrix.operations.map((operation) => operation.id)).size).toBe(sourceOperationIds.length)

  for (const operation of matrix.operations) {
    expect(['included', 'excluded-by-design', 'excluded-wip']).toContain(operation.disposition)
    if (operation.disposition === 'included') {
      expect(operation.fixtureIds.length, operation.id).toBeGreaterThan(0)
    } else {
      expect(operation.reason, operation.id).toMatch(/\S/u)
    }
  }
})

test('pins deterministic fixture inputs and migration preconditions', async () => {
  const matrix = await loadMatrix()
  const fixtureIds = new Set(matrix.fixtures.map((fixture) => fixture.id))

  expect(fixtureIds).toEqual(new Set(requiredFixtureIds))

  for (const operation of matrix.operations.filter((candidate) => candidate.disposition === 'included')) {
    for (const fixtureId of operation.fixtureIds) {
      expect(fixtureIds, operation.id).toContain(fixtureId)
    }
  }

  for (const fixture of matrix.fixtures) {
    const input = await readFile(new URL(fixture.inputPath, fixtureRoot), 'utf8')
    expect(createHash('sha256').update(input, 'utf8').digest('hex'), fixture.id).toBe(fixture.inputSha256)
    expect(fixture.expected.outputSchema, fixture.id).toMatch(/\S/u)
    expect(fixture.expected.targetPaths.length, fixture.id).toBeGreaterThan(0)
    expect(Object.keys(fixture.expected.mutationPreconditions).length, fixture.id).toBeGreaterThan(0)
    expect(fixture.expected.citationIds.every((citationId) => /\S/u.test(citationId)), fixture.id).toBe(true)
  }
})

test('quarantines only the uncommitted Drawnix work in progress', async () => {
  const matrix = await loadMatrix()

  expect(matrix.excludedWip).toEqual(excludedWip)
  expect(matrix.excludedWip.every((entry) => entry.reason.trim().length > 0)).toBe(true)
})
