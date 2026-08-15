import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

interface ArtifactFixture {
  readonly id: string
  readonly inputPath: string
  readonly inputSha256: string
  readonly expected: {
    readonly targetPaths: readonly string[]
    readonly artifactSha256?: string
  }
}

interface ArtifactMatrix {
  readonly fixtures: readonly ArtifactFixture[]
}

const fixtureRoot = new URL('../../../fixtures/migration/', import.meta.url)

async function loadMatrix(): Promise<ArtifactMatrix> {
  const matrix = await readFile(new URL('source-operation-matrix.json', fixtureRoot), 'utf8')
  return JSON.parse(matrix) as ArtifactMatrix
}

test('pins diagram and slide source fixtures by content digest', async () => {
  const matrix = await loadMatrix()

  for (const fixtureId of ['diagram-source', 'slide-source']) {
    const fixture = matrix.fixtures.find((candidate) => candidate.id === fixtureId)
    expect(fixture, fixtureId).toBeDefined()

    const input = await readFile(new URL(fixture?.inputPath ?? '', fixtureRoot), 'utf8')
    const digest = createHash('sha256').update(input, 'utf8').digest('hex')
    expect(fixture?.inputSha256).toBe(digest)
    expect(fixture?.expected.artifactSha256).toBe(digest)
    expect(fixture?.expected.targetPaths.length).toBeGreaterThan(0)
  }
})
