import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'
import { createStagedAssetRef } from '@notemd-harness/mutation'

import { SpecialistArtifactPlanner, type SpecialistArtifactRenderers } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-specialist-artifact-'))
  await mkdir(join(workspaceRoot, 'notes'))
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture\n')
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('compiles specialist source, preview, and staged export into one truthful lineage plan', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const planner = new SpecialistArtifactPlanner(rendererSet())

  const plan = await planner.planDrawioArtifact(drawioSpec(source.path, source.revision), source)
  const manifestMutation = plan.mutations.find((mutation) => mutation.kind === 'write-text' && mutation.destination.endsWith('/manifest.json'))
  const manifest = JSON.parse(manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}') as {
    readonly version: number
    readonly canonicalTarget: string
    readonly entries: readonly {
      readonly role: string
      readonly status: string
      readonly mediaType: string
      readonly parentArtifactId: string | null
      readonly rendererFingerprint: string
    }[]
  }

  expect(manifest).toMatchObject({ version: 2, canonicalTarget: 'drawio' })
  expect(manifest.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'source', status: 'ready', mediaType: 'application/vnd.jgraph.mxfile', parentArtifactId: null }),
    expect.objectContaining({ role: 'preview', status: 'ready', mediaType: 'image/svg+xml', parentArtifactId: expect.any(String) }),
    expect.objectContaining({ role: 'export', status: 'ready', mediaType: 'image/svg+xml', parentArtifactId: expect.any(String) }),
  ]))
  expect(new Set(manifest.entries.map((entry) => entry.rendererFingerprint)).size).toBeGreaterThan(1)
  expect(plan.mutations.some((mutation) => mutation.kind === 'write-bytes')).toBe(false)
})

test('keeps an unavailable native derivative explicit while preserving canonical source and projection', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const installed = rendererSet()
  const unavailableDrawio = {
    ...installed.drawio,
    render: async () => ({
    source: { filename: 'diagram.drawio', mediaType: 'application/vnd.jgraph.mxfile', content: '<mxfile />' },
    preview: { filename: 'preview.svg', mediaType: 'image/svg+xml', content: '<svg><rect /></svg>' },
    export: { status: 'unavailable', mediaType: 'image/svg+xml', reason: 'Draw.io executable is unavailable.' },
    }),
  }
  const planner = new SpecialistArtifactPlanner({ ...installed, drawio: unavailableDrawio })

  const plan = await planner.planDrawioArtifact(drawioSpec(source.path, source.revision), source)
  const manifestMutation = plan.mutations.find((mutation) => mutation.kind === 'write-text' && mutation.destination.endsWith('/manifest.json'))
  const manifest = JSON.parse(manifestMutation?.kind === 'write-text' ? manifestMutation.content : '{}') as {
    readonly entries: readonly { readonly role: string; readonly status: string; readonly reason?: string }[]
  }

  expect(manifest.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'export', status: 'unavailable', reason: 'Draw.io executable is unavailable.' }),
  ]))
  expect(plan.mutations.every((mutation) => !mutation.destination.endsWith('/export.svg'))).toBe(true)
})

test('binds a staged binary derivative to the artifact mutation and manifest digest', async () => {
  const vault = await LocalVault.open(workspaceRoot)
  const source = await vault.read('notes/architecture.md')
  const planner = new SpecialistArtifactPlanner(rendererSet())

  const plan = await planner.planCircuitikzArtifact(circuitikzSpec(source.path, source.revision), source)
  const binary = plan.mutations.find((mutation) => mutation.kind === 'write-bytes')

  expect(binary).toMatchObject({
    kind: 'write-bytes',
    mediaType: 'application/pdf',
    contentSha256: 'a'.repeat(64),
    stagedAsset: { id: 'circuitikz-pdf', sha256: 'a'.repeat(64) },
  })
})

function rendererSet(): SpecialistArtifactRenderers {
  const staged = createStagedAssetRef({
    id: 'circuitikz-pdf',
    byteLength: 8,
    mediaType: 'application/pdf',
    sha256: 'a'.repeat(64),
  })
  const renderer = {
    target: 'drawio' as const,
    fingerprint: { id: 'drawio-test', version: '1' },
    render: async () => ({
      source: {
        filename: 'diagram.drawio',
        mediaType: 'application/vnd.jgraph.mxfile',
        content: '<mxfile />',
        fingerprint: { id: 'drawio-source-test', version: '1' },
      },
      preview: {
        filename: 'preview.svg',
        mediaType: 'image/svg+xml',
        content: '<svg><rect /></svg>',
        fingerprint: { id: 'drawio-preview-test', version: '1' },
      },
      export: {
        filename: 'export.svg',
        mediaType: 'image/svg+xml',
        content: '<svg><rect /></svg>',
        fingerprint: { id: 'drawio-export-test', version: '1' },
      },
    }),
    capability: async () => ({ capability: 'diagram-rendering' as const, status: 'available' as const, reason: 'test' }),
  }
  const drawnix = { ...renderer, target: 'drawnix' as const }
  const circuitikz = {
    ...renderer,
    target: 'circuitikz' as const,
    render: async () => ({
      source: { filename: 'diagram.tex', mediaType: 'text/x-tex', content: 'tex' },
      preview: { filename: 'preview.svg', mediaType: 'image/svg+xml', content: '<svg><rect /></svg>' },
      export: { filename: 'diagram.pdf', mediaType: 'application/pdf', stagedAsset: staged },
    }),
  }
  return { drawio: renderer, drawnix, circuitikz }
}

function drawioSpec(path: string, revision: string) {
  return {
    version: 2 as const,
    title: 'Architecture',
    source: { path, revision },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.drawio.v1', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'drawio' as const,
    graph: { intent: 'flowchart' as const, nodes: [{ id: 'a', label: 'A' }], edges: [] },
  }
}

function circuitikzSpec(path: string, revision: string) {
  return {
    version: 2 as const,
    title: 'Circuit',
    source: { path, revision },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.circuitikz.v1', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'circuitikz' as const,
    circuit: {
      components: [{ id: 'r1', kind: 'resistor', label: 'R1' }],
      connections: [],
    },
  }
}
