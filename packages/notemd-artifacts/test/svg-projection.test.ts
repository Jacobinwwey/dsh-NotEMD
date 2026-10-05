import { expect, test } from 'vitest'

import { renderGraphProjectionSvg } from '../src/svg-projection.js'

const options = { title: 'Architecture', rendererId: 'test', theme: 'light', fontFamily: 'Arial' }

test('shows hierarchy connectors even without explicit relationships', () => {
  const svg = renderGraphProjectionSvg({
    intent: 'mindmap',
    nodes: [{ id: 'root', label: 'Root', children: [{ id: 'child', label: 'Child' }] }],
    edges: [],
  }, options)
  expect(svg).toContain('data-edge-kind="hierarchy"')
})

test('preserves every label line, wraps CJK and escapes XML text', () => {
  const svg = renderGraphProjectionSvg({
    intent: 'mindmap',
    nodes: [{ id: 'root', label: '第一行\n第二行\n第三行\n末行 <API> & "安全"\n' + '复杂关联'.repeat(30) }],
    edges: [],
  }, options)
  expect(svg).toContain('末行 &lt;API&gt; &amp; "安全"')
  expect(svg.match(/<tspan /gu)?.length).toBeGreaterThan(8)
})

test('draws self relationships as nonzero routes and retains relationship fallback labels', () => {
  const svg = renderGraphProjectionSvg({
    intent: 'flowchart',
    nodes: [{ id: 'a', label: 'A' }],
    edges: [{ from: 'a', to: 'a', relation: 'retry & recover' }],
  }, options)
  expect(svg).toContain('data-edge-kind="relation"')
  expect(svg).toContain('retry &amp; recover')
  expect(svg).toContain('<polyline ')
})
