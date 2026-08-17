import { expect, test } from 'vitest'

import { validateDiagramSpec } from '../src/index.js'

const mermaidSpec = {
  schemaFamily: 'diagram-spec' as const,
  version: 2,
  title: 'Write Lifecycle',
  source: { path: 'notes/architecture.md', revision: 'revision-1' },
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
    nodes: [
      { id: 'plan', label: 'Plan' },
      { id: 'approve', label: 'Approve' },
    ],
    edges: [{ from: 'plan', to: 'approve', label: 'review' }],
  },
} as const

test('accepts a source-bound v2 Mermaid graph with rendering provenance', () => {
  expect(validateDiagramSpec(mermaidSpec)).toEqual(mermaidSpec)
})

test('accepts a v2 Vega-Lite chart with structured series data', () => {
  const spec = {
    schemaFamily: 'diagram-spec' as const,
    version: 2,
    title: 'Latency Trend',
    source: { path: 'notes/metrics.md', revision: 'revision-2' },
    evidenceRefs: [],
    generation: {
      promptPolicyId: 'notemd.diagram.vega-lite.v2',
      provider: 'deepseek',
      model: 'deepseek-chat',
    },
    rendererIntent: { theme: 'dark', fontFamily: 'IBM Plex Sans' },
    canonicalTarget: 'vega-lite',
    chart: {
      chartType: 'line',
      series: [{
        id: 'latency',
        label: 'Latency',
        points: [
          { x: 1, y: 120 },
          { x: 2, y: 95 },
        ],
      }],
    },
  } as const

  expect(validateDiagramSpec(spec)).toEqual(spec)
})

test('rejects a canonical target whose structured source kind does not match', () => {
  const malformed = {
    ...mermaidSpec,
    graph: undefined,
    chart: {
      chartType: 'bar',
      series: [{ id: 'items', label: 'Items', points: [{ x: 'A', y: 1 }] }],
    },
  }

  expect(() => validateDiagramSpec(malformed)).toThrow('unsupported fields: chart')
})
