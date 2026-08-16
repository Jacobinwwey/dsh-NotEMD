import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

import type { ProcessArtifactExecution } from '@notemd-harness/process'
import { createBinarySha256, StagedAssetStore } from '@notemd-harness/vault-local'

import { CircuitikzArtifactRenderer } from '../src/index.js'

const temporaryRoots: string[] = []

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

test('produces escaped deterministic Circuitikz source and digest-bound staged PDF export', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notemd-circuitikz-renderer-'))
  temporaryRoots.push(root)
  const pdf = Buffer.from('%PDF-1.7\nfixture')
  const renderer = new CircuitikzArtifactRenderer(processDouble({
    status: 'ready',
    mediaType: 'application/pdf',
    bytes: pdf,
    contentSha256: createBinarySha256(pdf),
    executableFingerprint: 'tectonic-executable',
  }), await StagedAssetStore.open(root))

  const output = await renderer.render(circuitSpec())
  const source = 'content' in output.source ? output.source.content : ''

  expect(source).toContain('\\usepackage{circuitikz}')
  expect(source).toContain('R\\&1')
  expect(output.preview).toMatchObject({ mediaType: 'image/svg+xml', filename: 'preview.svg' })
  expect(output.export).toMatchObject({ mediaType: 'application/pdf', filename: 'diagram.pdf' })
  expect(output.export).toHaveProperty('stagedAsset.mediaType', 'application/pdf')
  expect(output.export).toHaveProperty('stagedAsset.sha256', createBinarySha256(pdf))
})

test('reports missing Tectonic without creating a fake PDF', async () => {
  const root = await mkdtemp(join(tmpdir(), 'notemd-circuitikz-renderer-'))
  temporaryRoots.push(root)
  const renderer = new CircuitikzArtifactRenderer(processDouble({ status: 'unavailable', code: 'executable-unavailable' }), await StagedAssetStore.open(root))

  await expect(renderer.render(circuitSpec())).resolves.toMatchObject({
    export: { status: 'unavailable', mediaType: 'application/pdf' },
  })
})

function circuitSpec() {
  return {
    version: 2 as const,
    title: 'Circuit',
    source: { path: 'notes/circuit.md', revision: 'revision-1' as never },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.circuitikz.v1', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'circuitikz' as const,
    circuit: {
      components: [{ id: 'r1', kind: 'resistor', label: 'R&1' }, { id: 'c1', kind: 'capacitor', label: 'C1' }],
      connections: [{ from: 'r1', to: 'c1', net: 'out' }],
    },
  }
}

function processDouble(outcome: ProcessArtifactExecution) {
  return { compileCircuitikzPdf: async () => outcome }
}
