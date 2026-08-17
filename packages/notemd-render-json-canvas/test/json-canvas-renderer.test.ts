import { expect, test } from 'vitest'

import { JsonCanvasSvgRenderer } from '../src/index.js'

test('retains JSON Canvas as source and labels SVG as a non-canonical projection', () => {
  const output = new JsonCanvasSvgRenderer().render({
    schemaFamily: 'diagram-spec' as const,
    version: 2,
    title: 'Architecture Map',
    source: { path: 'notes/architecture.md', revision: 'revision' },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.canvas.v2', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'light', fontFamily: 'Inter' },
    canonicalTarget: 'json-canvas',
    graph: {
      intent: 'canvas-map',
      nodes: [{ id: 'core', label: 'Core' }, { id: 'tools', label: 'Tools' }],
      edges: [{ from: 'core', to: 'tools' }],
    },
  })

  expect(output.source).toMatchObject({ filename: 'diagram.canvas', mediaType: 'application/json' })
  expect(JSON.parse(output.source.content)).toMatchObject({ nodes: expect.any(Array), edges: expect.any(Array) })
  expect(readyContent(output.preview)).toContain('data-notemd-projection="json-canvas"')
  expect(readyContent(output.preview)).toContain('JSON Canvas projection')
})

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
