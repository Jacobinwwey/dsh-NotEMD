import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

interface MigrationOperation {
  readonly id: string
  readonly disposition: 'included' | 'excluded-by-design' | 'excluded-wip'
  readonly fixtureIds: readonly string[]
}

interface MigrationMatrix {
  readonly operations: readonly MigrationOperation[]
  readonly fixtures: readonly { readonly id: string; readonly expected: { readonly outputSchema: string } }[]
}

interface ConformanceImplementation {
  readonly fixtureId: string
  readonly testPath: string
  readonly proofTerms: readonly string[]
}

interface ConformanceManifest {
  readonly version: 1
  readonly implementations: readonly ConformanceImplementation[]
}

const repositoryRoot = new URL('../../../', import.meta.url)
const fixtureRoot = new URL('fixtures/migration/', repositoryRoot)

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, 'utf8')) as T
}

test('every included source operation has a passing implementation fixture', async () => {
  const matrix = await readJson<MigrationMatrix>(new URL('source-operation-matrix.json', fixtureRoot))
  const manifest = await readJson<ConformanceManifest>(new URL('conformance-implementations.json', fixtureRoot))
  const fixtureIds = new Set(matrix.fixtures.map((fixture) => fixture.id))
  const includedFixtureIds = new Set(
    matrix.operations
      .filter((operation) => operation.disposition === 'included')
      .flatMap((operation) => operation.fixtureIds),
  )
  const implementationIds = new Set(manifest.implementations.map((implementation) => implementation.fixtureId))

  expect(manifest.version).toBe(1)
  expect([...includedFixtureIds].every((fixtureId) => implementationIds.has(fixtureId))).toBe(true)
  expect(implementationIds).toEqual(fixtureIds)

  for (const implementation of manifest.implementations) {
    const fixture = matrix.fixtures.find((candidate) => candidate.id === implementation.fixtureId)
    expect(fixture, implementation.fixtureId).toBeDefined()
    expect(fixture?.expected.outputSchema, implementation.fixtureId).toMatch(/\S/u)

    const testSource = await readFile(new URL(implementation.testPath, repositoryRoot), 'utf8')
    expect(testSource, implementation.fixtureId).toMatch(/test\(/u)
    for (const proofTerm of implementation.proofTerms) {
      expect(testSource, `${implementation.fixtureId}: ${proofTerm}`).toContain(proofTerm)
    }
  }
})
