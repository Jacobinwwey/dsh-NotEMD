import { expect, test } from 'vitest'

import { VegaLiteSvgRenderer } from '../src/index.js'

test('emits a canonical Vega-Lite source and labelled SVG chart projection', () => {
  const output = new VegaLiteSvgRenderer().render({
    schemaFamily: 'diagram-spec' as const,
    version: 2,
    title: 'Latency Trend',
    source: { path: 'notes/metrics.md', revision: 'revision' },
    evidenceRefs: [],
    generation: { promptPolicyId: 'notemd.diagram.vega-lite.v2', provider: 'deepseek', model: 'deepseek-chat' },
    rendererIntent: { theme: 'dark', fontFamily: 'IBM Plex Sans' },
    canonicalTarget: 'vega-lite',
    chart: {
      chartType: 'line',
      series: [{ id: 'latency', label: 'Latency', points: [{ x: 1, y: 120 }, { x: 2, y: 95 }] }],
    },
  })

  expect(output.source).toMatchObject({ filename: 'diagram.vl.json', mediaType: 'application/vnd.vegalite.v5+json' })
  expect(JSON.parse(output.source.content)).toMatchObject({ $schema: 'https://vega.github.io/schema/vega-lite/v5.json' })
  expect(readyContent(output.preview)).toContain('data-notemd-renderer="vega-lite-projection"')
})

function readyContent(value: { readonly content?: string }): string {
  return value.content ?? ''
}
