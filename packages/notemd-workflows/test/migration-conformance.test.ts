import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

import {
  migrationFixtureAdapters,
  type FixtureOperationObservation,
} from './migration-fixture-adapters.js'

interface MigrationOperation {
  readonly id: string
  readonly disposition: 'included' | 'excluded-by-design' | 'excluded-wip'
  readonly fixtureIds: readonly string[]
}

interface FixtureContract {
  readonly outputSchema: string
  readonly targetPaths: readonly string[]
  readonly citationIds: readonly string[]
  readonly mutationPreconditions: Readonly<Record<string, string>>
}

interface MigrationMatrix {
  readonly operations: readonly MigrationOperation[]
  readonly fixtures: readonly {
    readonly id: string
    readonly expected: FixtureContract
    readonly expectedByOperation?: Readonly<Record<string, FixtureContract>>
  }[]
}

interface ConformanceImplementation {
  readonly fixtureId: string
  readonly adapterId: string
  readonly sourceOperationIds: readonly string[]
  readonly operationIds: readonly string[]
}

interface ConformanceManifest {
  readonly version: 2
  readonly implementations: readonly ConformanceImplementation[]
}

const repositoryRoot = new URL('../../../', import.meta.url)
const fixtureRoot = new URL('fixtures/migration/', repositoryRoot)

async function readJson<T>(url: URL): Promise<T> {
  return JSON.parse(await readFile(url, 'utf8')) as T
}

test('every included source operation has an executable typed fixture adapter', async () => {
  const matrix = await readJson<MigrationMatrix>(new URL('source-operation-matrix.json', fixtureRoot))
  const manifest = await readJson<ConformanceManifest>(new URL('conformance-implementations.json', fixtureRoot))
  const fixtureIds = new Set(matrix.fixtures.map((fixture) => fixture.id))
  const includedOperations = matrix.operations.filter((operation) => operation.disposition === 'included')
  const includedOperationIds = new Set(includedOperations.map((operation) => operation.id))
  const implementationIds = new Set(manifest.implementations.map((implementation) => implementation.fixtureId))

  expect(manifest.version).toBe(2)
  expect(implementationIds).toEqual(fixtureIds)
  expect(new Set(Object.keys(migrationFixtureAdapters))).toEqual(fixtureIds)

  for (const implementation of manifest.implementations) {
    const fixture = matrix.fixtures.find((candidate) => candidate.id === implementation.fixtureId)
    expect(fixture, implementation.fixtureId).toBeDefined()
    expect(fixture?.expected.outputSchema, implementation.fixtureId).toMatch(/\S/u)
    expect(implementation.operationIds.length, implementation.fixtureId).toBeGreaterThan(0)
    expect(new Set(implementation.operationIds).size, implementation.fixtureId).toBe(implementation.operationIds.length)
    expect(new Set(implementation.sourceOperationIds).size, implementation.fixtureId).toBe(implementation.sourceOperationIds.length)
    expect(implementation.sourceOperationIds.every((operationId) => includedOperationIds.has(operationId)), implementation.fixtureId).toBe(true)
    for (const operationId of implementation.sourceOperationIds) {
      expect(matrix.operations.find((operation) => operation.id === operationId)?.fixtureIds, `${implementation.fixtureId}:${operationId}`).toContain(implementation.fixtureId)
    }
    expect(migrationFixtureAdapters[implementation.adapterId], implementation.adapterId).toBeDefined()
  }

  const mappedOperationIds = new Set(manifest.implementations.flatMap((implementation) => implementation.sourceOperationIds))
  expect(mappedOperationIds).toEqual(includedOperationIds)
})

test('executes every typed fixture adapter and checks its contract observation', async () => {
  const matrix = await readJson<MigrationMatrix>(new URL('source-operation-matrix.json', fixtureRoot))
  const manifest = await readJson<ConformanceManifest>(new URL('conformance-implementations.json', fixtureRoot))

  for (const implementation of manifest.implementations) {
    const adapter = migrationFixtureAdapters[implementation.adapterId]
    expect(adapter, implementation.adapterId).toBeDefined()
    expect(adapter?.fixtureId, implementation.adapterId).toBe(implementation.fixtureId)

    const execution = await adapter!.execute()
    expect(execution.fixtureId).toBe(implementation.fixtureId)
    const observations = new Map(execution.operations.map((operation) => [operation.operationId, operation]))
    expect(observations.size, implementation.fixtureId).toBe(implementation.operationIds.length)

    const fixture = matrix.fixtures.find((candidate) => candidate.id === implementation.fixtureId)
    expect(fixture, implementation.fixtureId).toBeDefined()
    expect(new Set(execution.operations.map((operation) => operation.operationId)), implementation.fixtureId)
      .toEqual(new Set(implementation.operationIds))
    for (const operationId of implementation.operationIds) {
      const observation = observations.get(operationId)
      expect(observation, `${implementation.fixtureId}:${operationId}`).toBeDefined()
      assertFixtureObservation(observation!, fixture!, `${implementation.fixtureId}:${operationId}`)
    }
  }
})

function assertFixtureObservation(
  observation: FixtureOperationObservation,
  fixture: MigrationMatrix['fixtures'][number],
  label: string,
): void {
  const expected = fixture.expectedByOperation?.[observation.operationId] ?? fixture.expected
  expect.soft(observation.outputSchema, label).toBe(expected.outputSchema)
  expect.soft(observation.targetPaths, label).toEqual(expected.targetPaths)
  expect.soft(observation.citationIds, label).toEqual(expected.citationIds)
  expect.soft(observation.mutationPreconditions, label).toEqual(expected.mutationPreconditions)
}
