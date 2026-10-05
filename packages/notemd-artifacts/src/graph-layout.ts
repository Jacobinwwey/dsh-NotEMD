import type { DiagramGraphInput, DiagramGraphNode } from './diagram-spec.js'

export interface GraphPoint {
  readonly x: number
  readonly y: number
}

export interface GraphRectangle extends GraphPoint {
  readonly width: number
  readonly height: number
}

export interface GraphLayoutNode extends GraphRectangle {
  readonly id: string
  readonly label: string
  readonly lines: readonly string[]
}

export interface GraphLayoutLabel extends GraphRectangle {
  readonly lines: readonly string[]
}

export interface GraphLayoutEdge {
  readonly from: string
  readonly to: string
  readonly points: readonly GraphPoint[]
  readonly label?: GraphLayoutLabel
}

export interface GraphLayout {
  readonly nodes: readonly GraphLayoutNode[]
  readonly hierarchy: readonly GraphLayoutEdge[]
  readonly relations: readonly GraphLayoutEdge[]
  readonly width: number
  readonly height: number
}

interface LayoutTree extends GraphLayoutNode {
  readonly children: LayoutTree[]
  x: number
  y: number
  subtreeHeight: number
  subtreeWidth: number
}

const nodeWidth = 220
const columnGap = 84
const siblingGap = 36
const forestGap = 72
const forestRowWidth = 1200
const routeClearance = 18
const labelWidth = 180
const labelLineHeight = 16
const labelPadding = 8
const margin = 52
const topMargin = 118
const optimizationWorkBudget = 2_000_000
const maxSwapCandidates = 4096
const routeHistoryLimit = 64

/** Conservative, host-free text metrics preserve all code points and explicit line breaks. */
export function wrapGraphText(text: string, width: number, fontSize: number): readonly string[] {
  const lines: string[] = []
  for (const paragraph of text.split(/\r\n|[\r\n]/u)) {
    let line = ''
    let used = 0
    for (const character of paragraph) {
      const advance = /\p{Mark}|\u200d/u.test(character) ? 0
        : /[\x20-\x7e]/u.test(character) ? fontSize * 0.65 : fontSize
      if (line.length > 0 && used + advance > width) {
        lines.push(line)
        line = ''
        used = 0
      }
      line += character
      used += advance
    }
    lines.push(line)
  }
  return lines
}

/** Input IDs and endpoints are already validated by DiagramSpec at the renderer boundary. */
export function layoutGraph(graph: DiagramGraphInput): GraphLayout {
  const { roots, nodes } = buildForest(graph.nodes)
  placeForest(roots)
  improveRelationshipDistance(roots, nodes, graph)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const hierarchy = nodes.flatMap((parent) => parent.children.map((child): GraphLayoutEdge => {
    const start = { x: parent.x + parent.width, y: parent.y + parent.height / 2 }
    const end = { x: child.x, y: child.y + child.height / 2 }
    const trunkX = (start.x + end.x) / 2
    return { from: parent.id, to: child.id, points: compactRoute([start, { x: trunkX, y: start.y }, { x: trunkX, y: end.y }, end]) }
  }))
  const nodeBounds = encloseRectangles(nodes)
  const pairCounts = new Map<string, number>()
  const pairOrdinals = new Map<string, number>()
  const pairKey = (from: string, to: string) => JSON.stringify([from, to].sort())
  for (const edge of graph.edges) {
    const key = pairKey(edge.from, edge.to)
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
  }
  const relations: GraphLayoutEdge[] = []
  const occupiedLabels: GraphLayoutLabel[] = []
  const previousRoutes = hierarchy.map((edge) => edge.points)
  for (const edge of graph.edges) {
    const from = nodeById.get(edge.from)!
    const to = nodeById.get(edge.to)!
    const key = pairKey(edge.from, edge.to)
    const ordinal = pairOrdinals.get(key) ?? 0
    pairOrdinals.set(key, ordinal + 1)
    const count = pairCounts.get(key)!
    const portFraction = count === 1 ? 0.5 : 0.2 + 0.6 * (ordinal + 1) / (count + 1)
    const points = selectRoute(routeCandidates(from, to, portFraction, ordinal, nodeBounds), [...nodes, ...occupiedLabels], previousRoutes.slice(-routeHistoryLimit))
    const text = edge.label ?? edge.relation
    const label = text === undefined ? undefined : placeRelationLabel(text, points, nodes, occupiedLabels, nodeBounds)
    if (label !== undefined) occupiedLabels.push(label)
    relations.push({ from: edge.from, to: edge.to, points, ...(label === undefined ? {} : { label }) })
    previousRoutes.push(points)
  }
  const geometry = [
    ...nodes,
    ...occupiedLabels,
    ...[...hierarchy, ...relations].flatMap((edge) => edge.points.map((point) => ({ ...point, width: 0, height: 0 }))),
  ]
  const bounds = encloseRectangles(geometry)
  const offset = { x: margin - bounds.x, y: topMargin - bounds.y }
  const shiftEdge = (edge: GraphLayoutEdge): GraphLayoutEdge => ({
    ...edge,
    points: edge.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })),
    ...(edge.label === undefined ? {} : { label: { ...edge.label, x: edge.label.x + offset.x, y: edge.label.y + offset.y } }),
  })
  return {
    nodes: nodes.map((node) => ({ id: node.id, label: node.label, lines: node.lines, x: node.x + offset.x, y: node.y + offset.y, width: node.width, height: node.height })),
    hierarchy: hierarchy.map(shiftEdge),
    relations: relations.map(shiftEdge),
    width: Math.max(960, Math.ceil(bounds.width + margin * 2)),
    height: Math.max(320, Math.ceil(bounds.height + topMargin + margin)),
  }
}

function buildForest(sources: readonly DiagramGraphNode[]) {
  const roots: LayoutTree[] = []
  const nodes: LayoutTree[] = []
  const pending = sources.map((source) => ({ source, siblings: roots })).reverse()
  while (pending.length > 0) {
    const { source, siblings } = pending.pop()!
    const lines = wrapGraphText(source.label, nodeWidth - 32, 14)
    const height = Math.max(84, lines.length * 18 + 28)
    const node: LayoutTree = { id: source.id, label: source.label, lines, children: [], x: 0, y: 0, width: nodeWidth, height, subtreeHeight: height, subtreeWidth: nodeWidth }
    siblings.push(node)
    nodes.push(node)
    for (let index = (source.children?.length ?? 0) - 1; index >= 0; index--) {
      pending.push({ source: source.children![index]!, siblings: node.children })
    }
  }
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index]!
    if (node.children.length > 0) {
      node.subtreeHeight = Math.max(node.height, node.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + siblingGap * (node.children.length - 1))
      node.subtreeWidth = nodeWidth + columnGap + node.children.reduce((width, child) => Math.max(width, child.subtreeWidth), 0)
    }
  }
  return { roots, nodes }
}

function placeForest(roots: readonly LayoutTree[]): void {
  let rowX = 0
  let rowY = 0
  let rowHeight = 0
  for (const root of roots) {
    if (rowX > 0 && rowX + root.subtreeWidth > forestRowWidth) {
      rowX = 0
      rowY += rowHeight + forestGap
      rowHeight = 0
    }
    const pending = [{ node: root, x: rowX, top: rowY }]
    while (pending.length > 0) {
      const { node, x, top } = pending.pop()!
      node.x = x
      node.y = top + (node.subtreeHeight - node.height) / 2
      const childrenHeight = node.children.reduce((sum, child) => sum + child.subtreeHeight, 0) + siblingGap * Math.max(0, node.children.length - 1)
      let childTop = top + (node.subtreeHeight - childrenHeight) / 2
      for (const child of node.children) {
        pending.push({ node: child, x: x + nodeWidth + columnGap, top: childTop })
        childTop += child.subtreeHeight + siblingGap
      }
    }
    rowX += root.subtreeWidth + forestGap
    rowHeight = Math.max(rowHeight, root.subtreeHeight)
  }
}

function improveRelationshipDistance(roots: LayoutTree[], nodes: readonly LayoutTree[], graph: DiagramGraphInput): void {
  if (graph.edges.length === 0) return
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const endpoints = graph.edges.map((edge) => [nodeById.get(edge.from)!, nodeById.get(edge.to)!] as const)
  const distance = () => endpoints.reduce((sum, [from, to]) => sum + Math.abs(from.x - to.x) + Math.abs(from.y + from.height / 2 - to.y - to.height / 2), 0)
  const groups = [roots, ...nodes.map((node) => node.children)].filter((siblings) => siblings.length > 1)
  // Strict improvements preserve source-order ties. Scale the swap budget by graph
  // size rather than truncating nodes or edges; this is a heuristic, not an optimum.
  const budget = Math.min(maxSwapCandidates, Math.max(1, Math.floor(optimizationWorkBudget / (nodes.length + endpoints.length))))
  let best = distance()
  let evaluated = 0
  let improved = true
  while (improved && evaluated < budget) {
    improved = false
    for (const siblings of groups) {
      for (let left = 0; left < siblings.length - 1 && evaluated < budget; left++) {
        for (let right = left + 1; right < siblings.length && evaluated < budget; right++) {
          const first = siblings[left]!
          siblings[left] = siblings[right]!
          siblings[right] = first
          placeForest(roots)
          const candidate = distance()
          evaluated++
          if (candidate < best - 0.001) {
            best = candidate
            improved = true
          } else {
            siblings[right] = siblings[left]!
            siblings[left] = first
          }
        }
      }
    }
  }
  placeForest(roots)
}

interface RoutePort {
  readonly point: GraphPoint
  readonly outside: GraphPoint
}

function ports(node: GraphRectangle, fraction: number): readonly RoutePort[] {
  const horizontal = node.x + node.width * fraction
  const vertical = node.y + node.height * fraction
  return [
    { point: { x: node.x, y: vertical }, outside: { x: node.x - routeClearance, y: vertical } },
    { point: { x: node.x + node.width, y: vertical }, outside: { x: node.x + node.width + routeClearance, y: vertical } },
    { point: { x: horizontal, y: node.y }, outside: { x: horizontal, y: node.y - routeClearance } },
    { point: { x: horizontal, y: node.y + node.height }, outside: { x: horizontal, y: node.y + node.height + routeClearance } },
  ]
}

function routeCandidates(from: GraphLayoutNode, to: GraphLayoutNode, fraction: number, ordinal: number, bounds: GraphRectangle): readonly (readonly GraphPoint[])[] {
  const fromPorts = ports(from, fraction)
  const toPorts = ports(to, fraction)
  const laneGap = routeClearance + ordinal * 8
  if (from.id === to.id) {
    const right = fromPorts[1]!.point
    const top = fromPorts[2]!.point
    const left = fromPorts[0]!.point
    const bottom = fromPorts[3]!.point
    return [
      [right, { x: right.x + laneGap, y: right.y }, { x: right.x + laneGap, y: from.y - laneGap }, { x: top.x, y: from.y - laneGap }, top],
      [left, { x: left.x - laneGap, y: left.y }, { x: left.x - laneGap, y: from.y + from.height + laneGap }, { x: bottom.x, y: from.y + from.height + laneGap }, bottom],
    ]
  }
  const candidates: GraphPoint[][] = []
  const pairs = [[1, 0], [0, 1], [3, 2], [2, 3], [0, 0], [1, 1], [2, 2], [3, 3]] as const
  for (const [sourceSide, targetSide] of pairs) {
    const start = fromPorts[sourceSide]!
    const end = toPorts[targetSide]!
    const a = start.outside
    const b = end.outside
    for (const x of [(a.x + b.x) / 2, bounds.x - laneGap, bounds.x + bounds.width + laneGap]) {
      candidates.push(compactRoute([start.point, a, { x, y: a.y }, { x, y: b.y }, b, end.point]))
    }
    for (const y of [(a.y + b.y) / 2, bounds.y - laneGap, bounds.y + bounds.height + laneGap]) {
      candidates.push(compactRoute([start.point, a, { x: a.x, y }, { x: b.x, y }, b, end.point]))
    }
  }
  return candidates
}

function compactRoute(points: readonly GraphPoint[]): GraphPoint[] {
  return points.filter((point, index) => index === 0 || point.x !== points[index - 1]!.x || point.y !== points[index - 1]!.y)
}

function selectRoute(candidates: readonly (readonly GraphPoint[])[], nodes: readonly GraphRectangle[], previous: readonly (readonly GraphPoint[])[]): readonly GraphPoint[] {
  let best = candidates[0]!
  let bestScore = Number.POSITIVE_INFINITY
  for (const points of candidates) {
    let length = 0
    let obstruction = 0
    let overlap = 0
    let crossings = 0
    for (let index = 1; index < points.length; index++) {
      const a = points[index - 1]!
      const b = points[index]!
      length += Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
      for (const node of nodes) obstruction += segmentInteriorLength(a, b, node)
      for (const route of previous) {
        for (let other = 1; other < route.length; other++) {
          const c = route[other - 1]!
          const d = route[other]!
          if (a.x === b.x && c.x === d.x && a.x === c.x) overlap += intervalOverlap(a.y, b.y, c.y, d.y)
          else if (a.y === b.y && c.y === d.y && a.y === c.y) overlap += intervalOverlap(a.x, b.x, c.x, d.x)
          else if (segmentsCross(a, b, c, d)) crossings++
        }
      }
    }
    const score = obstruction * 10000 + overlap * 30 + crossings * 200 + length
    if (score < bestScore) {
      bestScore = score
      best = points
    }
  }
  return best
}

function intervalOverlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(Math.max(a, b), Math.max(c, d)) - Math.max(Math.min(a, b), Math.min(c, d)))
}

function segmentInteriorLength(a: GraphPoint, b: GraphPoint, rect: GraphRectangle): number {
  if (a.x === b.x && a.x > rect.x && a.x < rect.x + rect.width) return intervalOverlap(a.y, b.y, rect.y, rect.y + rect.height)
  if (a.y === b.y && a.y > rect.y && a.y < rect.y + rect.height) return intervalOverlap(a.x, b.x, rect.x, rect.x + rect.width)
  return 0
}

function segmentsCross(a: GraphPoint, b: GraphPoint, c: GraphPoint, d: GraphPoint): boolean {
  if (a.x === b.x && c.y === d.y) return a.x > Math.min(c.x, d.x) && a.x < Math.max(c.x, d.x) && c.y > Math.min(a.y, b.y) && c.y < Math.max(a.y, b.y)
  if (a.y === b.y && c.x === d.x) return c.x > Math.min(a.x, b.x) && c.x < Math.max(a.x, b.x) && a.y > Math.min(c.y, d.y) && a.y < Math.max(c.y, d.y)
  return false
}

function placeRelationLabel(text: string, points: readonly GraphPoint[], nodes: readonly GraphRectangle[], occupied: readonly GraphLayoutLabel[], bounds: GraphRectangle): GraphLayoutLabel {
  const lines = wrapGraphText(text, labelWidth - labelPadding * 2, 12)
  const height = lines.length * labelLineHeight + labelPadding * 2
  const candidates: GraphLayoutLabel[] = []
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1]!
    const b = points[index]!
    const x = (a.x + b.x) / 2
    const y = (a.y + b.y) / 2
    candidates.push(
      { x: x - labelWidth / 2, y: y - height - labelPadding, width: labelWidth, height, lines },
      { x: x + labelPadding, y: y - height / 2, width: labelWidth, height, lines },
      { x: x - labelWidth - labelPadding, y: y - height / 2, width: labelWidth, height, lines },
      { x: x - labelWidth / 2, y: y + labelPadding, width: labelWidth, height, lines },
    )
  }
  const obstacles = [...nodes, ...occupied]
  for (const candidate of candidates) {
    if (obstacles.every((rect) => !rectanglesOverlap(candidate, rect))) return candidate
  }
  // Dense graphs retain the complete label in a separate annotation row instead
  // of shrinking or dropping it when no nearby candidate is clear.
  const y = occupied.reduce((bottom, label) => Math.max(bottom, label.y + label.height), bounds.y + bounds.height) + labelPadding * 2
  return { x: bounds.x, y, width: labelWidth, height, lines }
}

function rectanglesOverlap(a: GraphRectangle, b: GraphRectangle): boolean {
  return a.x < b.x + b.width + labelPadding && a.x + a.width + labelPadding > b.x && a.y < b.y + b.height + labelPadding && a.y + a.height + labelPadding > b.y
}

function encloseRectangles(rectangles: readonly GraphRectangle[]): GraphRectangle {
  let left = 0
  let top = 0
  let right = 0
  let bottom = 0
  for (const rect of rectangles) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}
