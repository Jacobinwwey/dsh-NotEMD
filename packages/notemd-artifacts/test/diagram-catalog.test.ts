import { expect, test } from 'vitest'

import {
  diagramCatalog,
  validateDiagramIntent,
} from '../src/index.js'

test('exposes a versioned three-axis catalog without collapsing render and export concerns', () => {
  expect(diagramCatalog.schemaFamily).toBe('diagram-catalog')
  expect(diagramCatalog.version).toBe(1)
  const timeline = diagramCatalog.entries.find((entry) => entry.id === 'timeline')

  expect(timeline).toMatchObject({
    semanticType: 'timeline',
    defaultRenderTarget: 'mermaid',
    renderTargets: ['mermaid'],
  })
  expect(timeline?.exportFormats).toContain('svg-preview')
  expect(timeline?.exportFormats).toContain('mermaid-source')
})

test('validates typed timeline, swimlane, and quadrant payloads with target compatibility', () => {
  const timeline = validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: { events: [{ id: 'ship', date: '2026-08', label: 'Ship', details: ['Gate'] }] },
  })
  const swimlane = validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'swimlane',
    renderTarget: 'mermaid',
    exportFormat: 'mermaid-source',
    payload: { lanes: [{ id: 'api', label: 'API', steps: [{ id: 'design', label: 'Design' }] }] },
  })
  const quadrant = validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'quadrant',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: {
      xAxisLabel: ['Low', 'High'],
      yAxisLabel: ['Low', 'High'],
      quadrantLabels: ['Do', 'Plan', 'Watch', 'Drop'],
      items: [{ id: 'a', label: 'A', x: 0.8, y: 0.9 }],
    },
  })

  expect(timeline.payload.events[0]?.label).toBe('Ship')
  expect(swimlane.payload.lanes[0]?.steps[0]?.id).toBe('design')
  expect(quadrant.payload.items[0]?.x).toBe(0.8)
})

test('rejects an incompatible render target, malformed payload, and unknown top-level field', () => {
  expect(() => validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'vega-lite',
    exportFormat: 'svg-preview',
    payload: { events: [] },
  })).toThrow(/render target/i)

  expect(() => validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'quadrant',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: { items: [] },
  })).toThrow(/quadrant/i)

  expect(() => validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: { events: [] },
    mode: 'legacy',
  })).toThrow(/unknown|unsupported|field/i)

  expect(() => validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'quadrant',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: {
      xAxisLabel: ['Low', 'High'],
      yAxisLabel: ['Low', 'High'],
      quadrantLabels: ['Do', 'Plan', 'Watch', 'Drop'],
      items: [{ id: 'a', label: 'A', x: 1.2, y: 0.2 }],
    },
  })).toThrow(/between 0 and 1/i)

  expect(() => validateDiagramIntent({
    schemaFamily: 'diagram-intent',
    version: 1,
    semanticType: 'timeline',
    renderTarget: 'mermaid',
    exportFormat: 'svg-preview',
    payload: { events: [] },
  })).toThrow(/at least one/i)
})
