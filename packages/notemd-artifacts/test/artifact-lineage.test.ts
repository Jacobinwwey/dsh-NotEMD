import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import { ArtifactPlanner, type DiagramArtifactRenderer } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-artifact-lineage-'))
  await mkdir(join(workspaceRoot, 'notes'))
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture\n')
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('records source, sanitized SVG preview, and SVG export as distinct lineage entries', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const planner = new ArtifactPlanner(vault, {
    mermaid: renderer('mermaid'),
    vegaLite: renderer('vega-lite'),
    jsonCanvas: renderer('json-canvas'),
    html: renderer('html'),
    editableSvg: renderer('editable-svg'),
  })

  const plan = planner.planMermaidArtifact({
    schemaFamily: 'diagram-spec',
    version: 2,
    title: 'Write Lifecycle',
    source: { path: source.path, revision: source.revision },
    evidenceRefs: ['evidence:mutation-contract'],
    generation: {
      promptPolicyId: 'notemd.diagram.mermaid.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'mermaid',
    graph: {
      intent: 'flowchart',
      nodes: [{ id: 'plan', label: 'Plan' }],
      edges: [],
    },
  }, source)

  const manifestMutation = plan.mutations.find((mutation) => mutation.destination.endsWith('/manifest.json'))
  expect(manifestMutation?.kind).toBe('write-text')
  const manifest = JSON.parse(manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}') as {
    readonly version: number
    readonly artifactId: string
    readonly canonicalTarget: string
    readonly entries: readonly {
      readonly role: string
      readonly status: string
      readonly parentArtifactId: string | null
      readonly mediaType: string
      readonly contentSha256?: string
      readonly rendererFingerprint: string
      readonly themeFingerprint: string
      readonly fontFingerprint: string
    }[]
  }

  expect(manifest).toMatchObject({ schemaFamily: 'diagram-lineage', version: 2, canonicalTarget: 'mermaid' })
  expect(manifest.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'source', status: 'ready', parentArtifactId: null, mediaType: 'text/vnd.mermaid' }),
    expect.objectContaining({ role: 'preview', status: 'ready', parentArtifactId: manifest.artifactId, mediaType: 'image/svg+xml' }),
    expect.objectContaining({ role: 'export', status: 'ready', parentArtifactId: manifest.artifactId, mediaType: 'image/svg+xml' }),
  ]))
  expect(manifest.entries.every((entry) => entry.contentSha256 !== undefined && entry.rendererFingerprint.length > 0 && entry.themeFingerprint.length > 0 && entry.fontFingerprint.length > 0)).toBe(true)

  const preview = plan.mutations.find((mutation) => mutation.destination.endsWith('/preview.svg'))
  expect(preview?.kind === 'write-text' ? preview.content : '').not.toMatch(/script|onload/iu)
})

function renderer(target: DiagramArtifactRenderer['target']): DiagramArtifactRenderer {
  return {
    target,
    fingerprint: { id: `test-${target}`, version: '1' },
    render() {
      return {
        source: { filename: 'source.mmd', mediaType: 'text/vnd.mermaid', content: 'flowchart TD\n  Plan' },
        preview: { filename: 'preview.svg', mediaType: 'image/svg+xml', content: '<svg><script>unsafe()</script><rect onload="unsafe()" /></svg>' },
        export: { filename: 'export.svg', mediaType: 'image/svg+xml', content: '<svg><rect /></svg>' },
      }
    },
  }
}
