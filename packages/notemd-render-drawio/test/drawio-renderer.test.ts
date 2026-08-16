import { afterEach, expect, test } from 'vitest'

import type { ProcessArtifactExecution, ProcessExecutableCapability } from '@notemd-harness/process'

import { DrawioArtifactRenderer } from '../src/index.js'

const signal = undefined

afterEach(() => {
  // Keep tests deterministic if a future renderer acquires process resources.
})

test('produces deterministic escaped Draw.io XML and a labelled projection', async () => {
  const renderer = new DrawioArtifactRenderer(processDouble({
    status: 'ready',
    mediaType: 'image/svg+xml',
    bytes: Buffer.from('<svg><rect /></svg>'),
    contentSha256: 'native-svg',
    executableFingerprint: 'drawio-executable',
  }))

  const first = await renderer.render(drawioSpec(), signal)
  const second = await renderer.render(drawioSpec(), signal)

  expect(first.source).toMatchObject({ mediaType: 'application/vnd.jgraph.mxfile', filename: 'diagram.drawio' })
  expect('content' in first.source && first.source.content).toContain('value="A &amp; B &lt;safe&gt;"')
  expect('content' in first.source && first.source.content).toBe('' + ('content' in second.source ? second.source.content : ''))
  expect(first.preview).toMatchObject({ mediaType: 'image/svg+xml', filename: 'preview.svg' })
  expect('content' in first.preview && first.preview.content).toContain('data-notemd-projection="drawio"')
  expect(first.export).toMatchObject({ mediaType: 'image/svg+xml', filename: 'export.svg' })
})

test('reports a missing Draw.io executable without fabricating an export', async () => {
  const renderer = new DrawioArtifactRenderer(processDouble({ status: 'unavailable', code: 'executable-unavailable' }))

  const output = await renderer.render(drawioSpec())

  expect(output.export).toEqual({
    status: 'unavailable',
    mediaType: 'image/svg+xml',
    reason: 'Draw.io executable is unavailable.',
  })
})

test('preserves nonzero and malformed native process failures as failed derivatives', async () => {
  const renderer = new DrawioArtifactRenderer(processDouble({ status: 'failed', code: 'process-nonzero-exit' }))
  const nonzero = await renderer.render(drawioSpec())
  expect(nonzero.export).toEqual({ status: 'failed', mediaType: 'image/svg+xml', code: 'process-nonzero-exit' })

  const malformed = new DrawioArtifactRenderer(processDouble({ status: 'failed', code: 'process-output-invalid' }))
  const invalid = await malformed.render(drawioSpec())
  expect(invalid.export).toEqual({ status: 'failed', mediaType: 'image/svg+xml', code: 'process-output-invalid' })
})

test('surfaces process cancellation instead of turning it into a successful artifact', async () => {
  const renderer = new DrawioArtifactRenderer(processDouble({ status: 'cancelled', code: 'process-cancelled' }))

  await expect(renderer.render(drawioSpec())).rejects.toMatchObject({ code: 'process-cancelled' })
})

function drawioSpec() {
  return {
    version: 2 as const,
    title: 'Flow & <safe>',
    source: { path: 'notes/diagram.md', revision: 'revision-1' as never },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.drawio.v1', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'drawio' as const,
    graph: {
      intent: 'flowchart' as const,
      nodes: [{ id: 'a', label: 'A & B <safe>' }, { id: 'b', label: 'B' }],
      edges: [{ from: 'a', to: 'b', label: 'next' }],
    },
  }
}

function processDouble(outcome: ProcessArtifactExecution) {
  return {
    renderDrawioSvg: async () => outcome,
    drawioSvgCapability: async (): Promise<ProcessExecutableCapability> => outcome.status === 'ready'
      ? { status: 'available', executableFingerprint: outcome.executableFingerprint }
      : outcome.status === 'unavailable'
        ? { status: 'unavailable', code: outcome.code }
        : outcome.status === 'cancelled'
          ? outcome
          : { status: 'unavailable', code: 'process-executable-invalid' },
  }
}
