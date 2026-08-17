import { expect, test } from 'vitest'

import type { ProcessArtifactExecution } from '@notemd-harness/process'

import { DrawnixArtifactRenderer } from '../src/index.js'

test('emits a versioned semantic Drawnix source and an explicitly labelled projection', async () => {
  const renderer = new DrawnixArtifactRenderer(processDouble({
    status: 'ready',
    mediaType: 'image/svg+xml',
    bytes: Buffer.from('<svg><rect /></svg>'),
    contentSha256: 'native-svg',
    executableFingerprint: 'drawnix-adapter',
  }))

  const output = await renderer.render(drawnixSpec())
  const source = JSON.parse('content' in output.source ? output.source.content : '{}') as Record<string, unknown>

  expect(source).toMatchObject({
    type: 'drawnix',
    version: 1,
    source: 'notemd',
    schema: 'notemd-drawnix-semantic-v1',
  })
  expect(output.preview).toMatchObject({ filename: 'preview.svg', mediaType: 'image/svg+xml' })
  expect('content' in output.preview && output.preview.content).toContain('data-notemd-projection="drawnix"')
  expect(output.export).toMatchObject({ filename: 'export.svg', mediaType: 'image/svg+xml' })
})

test('keeps the adapter optional and reports unavailable native Drawnix rendering', async () => {
  const renderer = new DrawnixArtifactRenderer(processDouble({ status: 'unavailable', code: 'executable-unavailable' }))

  await expect(renderer.render(drawnixSpec())).resolves.toMatchObject({
    export: { status: 'unavailable', mediaType: 'image/svg+xml' },
  })
})

function drawnixSpec() {
  return {
    schemaFamily: 'diagram-spec' as const,
    version: 2 as const,
    title: 'Knowledge map',
    source: { path: 'notes/diagram.md', revision: 'revision-1' as never },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.drawnix.v1', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'drawnix' as const,
    graph: {
      intent: 'drawnix-mindmap' as const,
      nodes: [{ id: 'root', label: 'Root', children: [{ id: 'child', label: 'Child' }] }],
      edges: [],
    },
  }
}

function processDouble(outcome: ProcessArtifactExecution) {
  return { renderDrawnixSvg: async () => outcome }
}
