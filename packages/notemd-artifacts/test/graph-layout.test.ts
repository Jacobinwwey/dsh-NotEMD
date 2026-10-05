import { expect, test } from 'vitest'

import type { DiagramGraphInput, DiagramGraphNode } from '../src/diagram-spec.js'
import { layoutGraph, wrapGraphText, type GraphLayout, type GraphPoint, type GraphRectangle } from '../src/graph-layout.js'

test('is deterministic for deeply frozen input and preserves node, hierarchy and relation identity', () => {
  const graph: DiagramGraphInput = Object.freeze({
    intent: 'mindmap',
    nodes: Object.freeze([
      Object.freeze({ id: 'root', label: 'Root', children: Object.freeze(['a', 'b', 'c', 'd'].map((id) => Object.freeze({ id, label: id }))) }),
      Object.freeze({ id: 'other', label: 'Other' }),
    ]),
    edges: Object.freeze([Object.freeze({ from: 'a', to: 'd', label: 'Connection' }), Object.freeze({ from: 'other', to: 'b' })]),
  })
  const before = JSON.stringify(graph)
  const layout = layoutGraph(graph)
  expect(layoutGraph(graph)).toEqual(layout)
  expect(JSON.stringify(graph)).toBe(before)
  expect(layout.nodes.map((node) => node.id)).toEqual(['root', 'a', 'b', 'c', 'd', 'other'])
  expect(layout.hierarchy.map((edge) => `${edge.from}:${edge.to}`).sort()).toEqual(['a', 'b', 'c', 'd'].map((id) => `root:${id}`))
  expect(layout.relations.map((edge) => [edge.from, edge.to])).toEqual(graph.edges.map((edge) => [edge.from, edge.to]))
})

test('keeps relation-free sibling order stable and strictly improves a distant related pair', () => {
  const nodes = [{ id: 'root', label: 'Root', children: ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id, label: id })) }]
  const initial = layoutGraph({ intent: 'mindmap', nodes, edges: [] })
  const improved = layoutGraph({ intent: 'mindmap', nodes, edges: [{ from: 'a', to: 'f' }] })
  expect(initial.nodes.slice(1).map((node) => node.y)).toEqual(initial.nodes.slice(1).map((node) => node.y).sort((a, b) => a - b))
  expect(relationDistance(improved, 'a', 'f')).toBeLessThan(relationDistance(initial, 'a', 'f'))
  assertNoNodeOverlap(improved)
})

test('packs a forest deterministically and improves cross-root relations without changing hierarchy', () => {
  const nodes = Array.from({ length: 9 }, (_, index) => ({ id: `root-${index}`, label: `Root ${index}` }))
  const initial = layoutGraph({ intent: 'flowchart', nodes, edges: [] })
  const improved = layoutGraph({ intent: 'flowchart', nodes, edges: [{ from: 'root-0', to: 'root-8' }] })
  expect(relationDistance(improved, 'root-0', 'root-8')).toBeLessThan(relationDistance(initial, 'root-0', 'root-8'))
  expect(initial.nodes[0]!.x).toBeLessThan(initial.nodes[1]!.x)
  expect(initial.nodes[4]!.y).toBeGreaterThan(initial.nodes[0]!.y)
  assertNoNodeOverlap(improved)
})

test('attaches hierarchy and relations at boundaries and routes around an intervening node', () => {
  const layout = layoutGraph({
    intent: 'mindmap',
    nodes: [{ id: 'a', label: 'A', children: [{ id: 'b', label: 'Obstacle', children: [{ id: 'c', label: 'C' }] }] }],
    edges: [{ from: 'a', to: 'c' }],
  })
  expect(layout.hierarchy).toHaveLength(2)
  for (const edge of [...layout.hierarchy, ...layout.relations]) {
    expect(onBoundary(edge.points[0]!, layout.nodes.find((node) => node.id === edge.from)!)).toBe(true)
    expect(onBoundary(edge.points.at(-1)!, layout.nodes.find((node) => node.id === edge.to)!)).toBe(true)
    for (let index = 1; index < edge.points.length; index++) {
      const a = edge.points[index - 1]!
      const b = edge.points[index]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
      for (const node of layout.nodes) expect(crossesInterior(a, b, node)).toBe(false)
    }
  }
})

test('keeps self, parallel and reverse relationships distinct and nonzero', () => {
  const layout = layoutGraph({
    intent: 'flowchart',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [
      { from: 'a', to: 'a' }, { from: 'a', to: 'a' },
      { from: 'a', to: 'b' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' },
    ],
  })
  const routeSignatures = layout.relations.map((edge) => [JSON.stringify(edge.points), JSON.stringify([...edge.points].reverse())].sort()[0])
  expect(new Set(routeSignatures).size).toBe(5)
  for (const edge of layout.relations) {
    expect(edge.points.length).toBeGreaterThan(1)
    expect(edge.points.some((point) => point.x !== edge.points[0]!.x || point.y !== edge.points[0]!.y)).toBe(true)
    expect(onBoundary(edge.points[0]!, layout.nodes.find((node) => node.id === edge.from)!)).toBe(true)
    expect(onBoundary(edge.points.at(-1)!, layout.nodes.find((node) => node.id === edge.to)!)).toBe(true)
  }
})

test('retains complete multilingual text, uses growing node heights and encloses all geometry', () => {
  const label = 'Header\r\n\r\n' + '复杂关联 <XML> & 😀 é'.repeat(18) + '\nFinal line'
  const relation = '完整关系'.repeat(40) + '\nTail'
  const layout = layoutGraph({ intent: 'mindmap', nodes: [{ id: 'a', label }, { id: 'b', label: 'B' }], edges: [{ from: 'a', to: 'b', label: relation }, { from: 'a', to: 'a' }] })
  expect(layout.nodes[0]!.lines.join('')).toBe(label.replace(/\r\n|[\r\n]/gu, ''))
  expect(layout.nodes[0]!.lines[1]).toBe('')
  expect(layout.nodes[0]!.height).toBeGreaterThan(layout.nodes[1]!.height)
  expect(layout.relations[0]!.label!.lines.join('')).toBe(relation.replaceAll('\n', ''))
  assertNoNodeOverlap(layout)
  const rectangles = [...layout.nodes, ...layout.relations.flatMap((edge) => edge.label === undefined ? [] : [edge.label])]
  for (const rect of rectangles) {
    expect(rect.x).toBeGreaterThanOrEqual(0)
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.width).toBeLessThanOrEqual(layout.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(layout.height)
  }
  for (const point of [...layout.hierarchy, ...layout.relations].flatMap((edge) => edge.points)) {
    expect(point.x).toBeGreaterThanOrEqual(0)
    expect(point.y).toBeGreaterThanOrEqual(0)
    expect(point.x).toBeLessThanOrEqual(layout.width)
    expect(point.y).toBeLessThanOrEqual(layout.height)
  }
  expect(wrapGraphText('中文'.repeat(20), 56, 14).every((line) => Array.from(line).length <= 4)).toBe(true)
})

test('routes later parallel relationships around an earlier complete label', () => {
  const layout = layoutGraph({
    intent: 'flowchart',
    nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'a', to: 'b', label: 'A long relationship label that must remain readable' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  })
  const label = layout.relations[0]!.label!
  for (const edge of layout.relations.slice(1)) {
    for (let index = 1; index < edge.points.length; index++) {
      expect(crossesInterior(edge.points[index - 1]!, edge.points[index]!, label)).toBe(false)
    }
  }
})

test('traverses deep hierarchies iteratively without dropping nodes or hierarchy connectors', () => {
  let node: DiagramGraphNode = { id: '1499', label: 'Leaf' }
  for (let index = 1498; index >= 0; index--) node = { id: String(index), label: 'Node', children: [node] }
  const layout = layoutGraph({ intent: 'mindmap', nodes: [node], edges: [] })
  expect(layout.nodes).toHaveLength(1500)
  expect(layout.hierarchy).toHaveLength(1499)
  expect(layout.nodes.at(-1)!.x + layout.nodes.at(-1)!.width).toBeLessThan(layout.width)
})

function relationDistance(layout: GraphLayout, from: string, to: string): number {
  const a = layout.nodes.find((node) => node.id === from)!
  const b = layout.nodes.find((node) => node.id === to)!
  return Math.abs(a.x + a.width / 2 - b.x - b.width / 2) + Math.abs(a.y + a.height / 2 - b.y - b.height / 2)
}

function assertNoNodeOverlap(layout: GraphLayout): void {
  for (let first = 0; first < layout.nodes.length; first++) {
    for (let second = first + 1; second < layout.nodes.length; second++) {
      const a = layout.nodes[first]!
      const b = layout.nodes[second]!
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false)
    }
  }
}

function onBoundary(point: GraphPoint, node: GraphRectangle): boolean {
  return (point.x === node.x || point.x === node.x + node.width) && point.y >= node.y && point.y <= node.y + node.height
    || (point.y === node.y || point.y === node.y + node.height) && point.x >= node.x && point.x <= node.x + node.width
}

function crossesInterior(a: GraphPoint, b: GraphPoint, node: GraphRectangle): boolean {
  if (a.x === b.x) return a.x > node.x && a.x < node.x + node.width && Math.max(a.y, b.y) > node.y && Math.min(a.y, b.y) < node.y + node.height
  return a.y > node.y && a.y < node.y + node.height && Math.max(a.x, b.x) > node.x && Math.min(a.x, b.x) < node.x + node.width
}
