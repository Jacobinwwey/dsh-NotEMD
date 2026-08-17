import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

interface SourceIntakeLock {
  readonly version: 1
  readonly baseline: {
    readonly commit: string
    readonly operationCount: number
  }
  readonly candidate: {
    readonly commit: string
    readonly workingTree: 'dirty'
    readonly dirtyPaths: readonly string[]
  }
  readonly registryComparison: {
    readonly candidateOperationCount: number
    readonly addedOperationIds: readonly string[]
    readonly removedOperationIds: readonly string[]
  }
  readonly fixtureComparison: {
    readonly migrationFixtureIds: number
    readonly migrationFixtureHashChanges: readonly string[]
  }
  readonly categories: readonly { readonly id: string }[]
  readonly acceptedChanges: readonly { readonly decision: string }[]
  readonly rejectedChanges: readonly { readonly id: string }[]
  readonly drawnixQuarantine: readonly { readonly kind: string; readonly paths: readonly string[] }[]
  readonly exit: {
    readonly matrixContractCommit: string
    readonly candidateImplementation: string
  }
}

const fixtureRoot = new URL('../../../fixtures/migration/', import.meta.url)

test('locks source intake without accepting dirty Drawnix behavior', async () => {
  const lock = JSON.parse(await readFile(new URL('source-intake-lock.json', fixtureRoot), 'utf8')) as SourceIntakeLock

  expect(lock.version).toBe(1)
  expect(lock.baseline).toMatchObject({
    commit: '4168a51cd19ad8c3d1e05f604b50936255461a31',
    operationCount: 29,
  })
  expect(lock.candidate).toMatchObject({
    commit: 'cdf580c6c876190ecc1040caea08e5ba5bee004f',
    workingTree: 'dirty',
  })
  expect(lock.candidate.dirtyPaths).toEqual([
    'src/diagram/adapters/drawnix/drawnixSourceCoverage.ts',
    'src/diagram/diagramGenerationService.ts',
    'src/diagram/planner.ts',
    'src/tests/diagramPlannerFlow.test.ts',
    'src/tests/drawnixSourceCoverage.test.ts',
  ])
  expect(lock.registryComparison).toMatchObject({
    candidateOperationCount: 29,
    addedOperationIds: [],
    removedOperationIds: [],
  })
  expect(lock.fixtureComparison).toMatchObject({
    migrationFixtureIds: 14,
    migrationFixtureHashChanges: [],
  })

  expect(new Set(lock.categories.map((category) => category.id))).toEqual(new Set([
    'diagram-gallery',
    'response-cache',
    'render-target',
    'mermaid-normalization',
  ]))
  expect(lock.acceptedChanges.some((change) => change.decision === 'accepted-no-op')).toBe(true)
  expect(lock.rejectedChanges.map((change) => change.id)).toEqual(expect.arrayContaining([
    'provider-cache',
    'host-gallery-and-preview',
  ]))
  expect(lock.drawnixQuarantine.map((entry) => entry.kind)).toEqual(expect.arrayContaining([
    'baseline-exclusion',
    'candidate-committed',
    'candidate-working-tree',
  ]))
  expect(lock.drawnixQuarantine.every((entry) => entry.paths.length > 0)).toBe(true)
  expect(lock.exit).toMatchObject({
    matrixContractCommit: '4168a51cd19ad8c3d1e05f604b50936255461a31',
    candidateImplementation: 'not-accepted',
  })
})
