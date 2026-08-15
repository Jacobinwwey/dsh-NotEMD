import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import { SourceArtifactPlanner } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-artifacts-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('never deletes an artifact absent from its manifest', async () => {
  const artifacts = new SourceArtifactPlanner(await LocalVault.open(workspaceRoot))

  await expect(artifacts.planCleanup('unknown-id')).resolves.toEqual([])
})

test('reports renderer and export gaps as explicit unavailable capabilities', async () => {
  const artifacts = new SourceArtifactPlanner(await LocalVault.open(workspaceRoot))

  expect(artifacts.diagramRenderingCapability()).toEqual({
    capability: 'diagram-rendering',
    status: 'unavailable',
    reason: 'No portable diagram renderer is configured.',
  })
  expect(artifacts.documentExportCapability()).toEqual({
    capability: 'document-export',
    status: 'unavailable',
    reason: 'No portable document export provider is configured.',
  })
})

test('plans portable source files and a manifest with exact ownership', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture')
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const artifacts = new SourceArtifactPlanner(vault)

  const plan = artifacts.planDiagram(
    {
      version: 1,
      title: 'Write Lifecycle',
      intent: 'flowchart',
      source: 'flowchart TD\n  Plan --> Approval --> Write',
    },
    source,
  )

  const manifestMutation = plan.mutations.find(
    (mutation) => mutation.kind === 'write-text' && mutation.destination.endsWith('/manifest.json'),
  )
  expect(manifestMutation).toBeDefined()
  expect(manifestMutation?.expectedRevision).toBe('absent')
  const manifestContent = manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}'
  expect(JSON.parse(manifestContent)).toMatchObject({
    version: 1,
    renderer: 'source',
    sourcePath: 'notes/architecture.md',
    ownedPaths: expect.arrayContaining(
      plan.mutations.map((mutation) => mutation.destination).filter((path) => !path.endsWith('/manifest.json')),
    ),
  })
})

test('rejects a manifest that claims a path outside its artifact directory', async () => {
  const artifactId = `notemd-artifact-${'a'.repeat(20)}`
  const artifactDirectory = join(workspaceRoot, '.notemd', 'artifacts', artifactId)
  await mkdir(artifactDirectory, { recursive: true })
  await writeFile(join(artifactDirectory, 'manifest.json'), JSON.stringify({
    version: 1,
    artifactId,
    sourcePath: 'notes/architecture.md',
    sourceRevision: 'revision',
    renderer: 'source',
    ownedPaths: [`.notemd/artifacts/${artifactId}/../../notes/architecture.md`],
  }))

  const artifacts = new SourceArtifactPlanner(await LocalVault.open(workspaceRoot))

  await expect(artifacts.planCleanup(artifactId)).rejects.toMatchObject({
    code: 'ARTIFACT_MANIFEST_INVALID',
  })
})
