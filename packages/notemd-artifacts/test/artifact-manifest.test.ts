import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import {
  ArtifactPlanner,
  type DiagramArtifactRenderer,
  type SvgArtifactRenderers,
} from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-artifacts-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('never deletes an artifact absent from its manifest', async () => {
  const artifacts = createPlanner(await LocalVault.open(workspaceRoot))

  await expect(artifacts.planCleanup('unknown-id')).resolves.toEqual([])
})

test('reports installed renderers and the still-absent document export capability truthfully', async () => {
  const artifacts = createPlanner(await LocalVault.open(workspaceRoot))

  expect(artifacts.mermaidRenderingCapability()).toMatchObject({
    capability: 'diagram-rendering',
    status: 'available',
  })
  expect(artifacts.documentExportCapability()).toEqual({
    capability: 'document-export',
    status: 'unavailable',
    reason: 'Slidev and media export providers are not installed.',
  })
})

test('plans source, preview, and export content with a versioned manifest', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture')
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const artifacts = createPlanner(vault)

  const plan = artifacts.planMermaidArtifact(createMermaidSpec(source.path, source.revision), source)

  const manifestMutation = plan.mutations.find(
    (mutation) => mutation.kind === 'write-text' && mutation.destination.endsWith('/manifest.json'),
  )
  expect(manifestMutation).toBeDefined()
  expect(manifestMutation?.expectedRevision).toBe('absent')
  const manifestContent = manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}'
  expect(JSON.parse(manifestContent)).toMatchObject({
    version: 2,
    canonicalTarget: 'mermaid',
    sourcePath: 'notes/architecture.md',
    entries: expect.arrayContaining([
      expect.objectContaining({ role: 'source', status: 'ready' }),
      expect.objectContaining({ role: 'preview', status: 'ready' }),
      expect.objectContaining({ role: 'export', status: 'ready' }),
    ]),
  })
})

test('rejects a legacy manifest that claims a path outside its artifact directory', async () => {
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

  const artifacts = createPlanner(await LocalVault.open(workspaceRoot))

  await expect(artifacts.planCleanup(artifactId)).rejects.toMatchObject({
    code: 'ARTIFACT_MANIFEST_INVALID',
  })
})

function createPlanner(vault: Awaited<ReturnType<typeof LocalVault.open>>): ArtifactPlanner {
  return new ArtifactPlanner(vault, rendererSet())
}

function rendererSet(): SvgArtifactRenderers {
  return {
    mermaid: renderer('mermaid'),
    vegaLite: renderer('vega-lite'),
    jsonCanvas: renderer('json-canvas'),
    html: renderer('html'),
    editableSvg: renderer('editable-svg'),
  }
}

function renderer(target: DiagramArtifactRenderer['target']): DiagramArtifactRenderer {
  return {
    target,
    fingerprint: { id: `test-${target}`, version: '1' },
    render() {
      return {
        source: { filename: 'source.txt', mediaType: 'text/plain', content: target },
        preview: { filename: 'preview.svg', mediaType: 'image/svg+xml', content: '<svg><rect /></svg>' },
        export: { filename: 'export.svg', mediaType: 'image/svg+xml', content: '<svg><rect /></svg>' },
      }
    },
  }
}

function createMermaidSpec(path: string, revision: string) {
  return {
    version: 2 as const,
    title: 'Write Lifecycle',
    source: { path, revision },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.diagram.mermaid.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'mermaid' as const,
    graph: { intent: 'flowchart' as const, nodes: [{ id: 'plan', label: 'Plan' }], edges: [] },
  }
}
