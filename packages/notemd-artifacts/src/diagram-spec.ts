import type { Revision } from '@notemd-harness/vault'

import {
  assertArtifactSchema,
  ArtifactSchemaError,
  type ArtifactSchemaDiagnostic,
  type ArtifactSchemaMetadata,
} from './schema-registry.js'

export const svgCanonicalTargets = [
  'mermaid',
  'vega-lite',
  'json-canvas',
  'html',
  'editable-svg',
] as const

export const deferredCanonicalTargets = ['drawio', 'drawnix', 'circuitikz'] as const

export const diagramCanonicalTargets = [...svgCanonicalTargets, ...deferredCanonicalTargets] as const
export type SvgCanonicalTarget = (typeof svgCanonicalTargets)[number]
export type DiagramCanonicalTarget = (typeof diagramCanonicalTargets)[number]

export const graphDiagramIntents = [
  'flowchart',
  'sequence',
  'mindmap',
  'class',
  'er',
  'state',
  'canvas-map',
  'drawnix-mindmap',
] as const
export type GraphDiagramIntent = (typeof graphDiagramIntents)[number]

export const chartTypes = ['bar', 'line', 'area', 'point', 'scatter', 'pie', 'table'] as const
export type ChartType = (typeof chartTypes)[number]

export interface DiagramSourceRef {
  readonly path: string
  readonly revision: Revision
}

export interface DiagramGenerationProvenance {
  readonly promptPolicyId: string
  readonly provider: string
  readonly model: string
}

export interface DiagramRendererIntent {
  readonly theme: string
  readonly fontFamily: string
}

export interface DiagramGraphNode {
  readonly id: string
  readonly label: string
  readonly kind?: string
  readonly children?: readonly DiagramGraphNode[]
}

export interface DiagramGraphEdge {
  readonly from: string
  readonly to: string
  readonly label?: string
  readonly relation?: string
}

export interface DiagramGraphInput {
  readonly intent: GraphDiagramIntent
  readonly nodes: readonly DiagramGraphNode[]
  readonly edges: readonly DiagramGraphEdge[]
}

export interface DiagramChartPoint {
  readonly x: string | number
  readonly y: number
}

export interface DiagramChartSeries {
  readonly id: string
  readonly label: string
  readonly points: readonly DiagramChartPoint[]
}

export interface DiagramChartInput {
  readonly chartType: ChartType
  readonly series: readonly DiagramChartSeries[]
}

export interface CircuitComponentInput {
  readonly id: string
  readonly kind: string
  readonly label: string
}

export interface CircuitConnectionInput {
  readonly from: string
  readonly to: string
  readonly net?: string
}

export interface CircuitDiagramInput {
  readonly components: readonly CircuitComponentInput[]
  readonly connections: readonly CircuitConnectionInput[]
}

interface DiagramSpecBase {
  readonly schemaFamily: 'diagram-spec'
  readonly version: 2
  readonly title: string
  readonly source: DiagramSourceRef
  readonly evidenceRefs: readonly string[]
  readonly generation: DiagramGenerationProvenance
  readonly rendererIntent: DiagramRendererIntent
  readonly metadata?: ArtifactSchemaMetadata
}

export interface MermaidDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'mermaid'
  readonly graph: DiagramGraphInput
}

export interface VegaLiteDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'vega-lite'
  readonly chart: DiagramChartInput
}

export interface JsonCanvasDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'json-canvas'
  readonly graph: DiagramGraphInput
}

export interface HtmlDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'html'
  readonly graph: DiagramGraphInput
}

export interface EditableSvgDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'editable-svg'
  readonly graph: DiagramGraphInput
}

export interface DrawioDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'drawio'
  readonly graph: DiagramGraphInput
}

export interface DrawnixDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'drawnix'
  readonly graph: DiagramGraphInput
}

export interface CircuitikzDiagramSpec extends DiagramSpecBase {
  readonly canonicalTarget: 'circuitikz'
  readonly circuit: CircuitDiagramInput
}

export type DiagramSpec =
  | MermaidDiagramSpec
  | VegaLiteDiagramSpec
  | JsonCanvasDiagramSpec
  | HtmlDiagramSpec
  | EditableSvgDiagramSpec
  | DrawioDiagramSpec
  | DrawnixDiagramSpec
  | CircuitikzDiagramSpec

export class DiagramSpecError extends Error {
  readonly code = 'ARTIFACT_SPEC_INVALID'
  readonly diagnostic?: ArtifactSchemaDiagnostic | undefined

  constructor(message: string, diagnostic?: ArtifactSchemaDiagnostic) {
    super(message)
    this.name = 'DiagramSpecError'
    this.diagnostic = diagnostic
  }
}

export function validateDiagramSpec(value: unknown): DiagramSpec {
  const record = requiredRecord(value, 'Diagram specifications must be objects.')
  try {
    assertArtifactSchema(record, { family: 'diagram-spec', version: 2 })
  } catch (error) {
    if (error instanceof ArtifactSchemaError) {
      throw new DiagramSpecError(error.message, error.diagnostic)
    }
    if (error instanceof Error) {
      throw new DiagramSpecError(error.message)
    }
    throw error
  }
  const base = parseBase(record)
  const target = requiredTarget(record.canonicalTarget)
  switch (target) {
    case 'mermaid':
    case 'json-canvas':
    case 'html':
    case 'editable-svg':
    case 'drawio':
    case 'drawnix':
      assertKnownKeys(record, [...baseKeys, 'canonicalTarget', 'graph'], `DiagramSpec ${target}`)
      return Object.freeze({ ...base, canonicalTarget: target, graph: parseGraph(record.graph) })
    case 'vega-lite':
      assertKnownKeys(record, [...baseKeys, 'canonicalTarget', 'chart'], 'DiagramSpec vega-lite')
      return Object.freeze({ ...base, canonicalTarget: target, chart: parseChart(record.chart) })
    case 'circuitikz':
      assertKnownKeys(record, [...baseKeys, 'canonicalTarget', 'circuit'], 'DiagramSpec circuitikz')
      return Object.freeze({ ...base, canonicalTarget: target, circuit: parseCircuit(record.circuit) })
  }
}

export function isSvgCanonicalTarget(value: DiagramCanonicalTarget): value is SvgCanonicalTarget {
  return (svgCanonicalTargets as readonly string[]).includes(value)
}

const baseKeys = ['schemaFamily', 'version', 'title', 'source', 'evidenceRefs', 'generation', 'rendererIntent', 'metadata'] as const

function parseBase(record: Record<string, unknown>): DiagramSpecBase {
  const schema = assertArtifactSchema(record, { family: 'diagram-spec', version: 2 })
  return Object.freeze({
    schemaFamily: 'diagram-spec',
    version: 2,
    title: requiredText(record.title, 'DiagramSpec title'),
    source: parseSource(record.source),
    evidenceRefs: parseTextList(record.evidenceRefs, 'DiagramSpec evidenceRefs'),
    generation: parseGeneration(record.generation),
    rendererIntent: parseRendererIntent(record.rendererIntent),
    ...(schema.metadata === undefined ? {} : { metadata: schema.metadata }),
  })
}

function parseSource(value: unknown): DiagramSourceRef {
  const record = requiredRecord(value, 'DiagramSpec source must be an object.')
  assertKnownKeys(record, ['path', 'revision'], 'DiagramSpec source')
  const path = requiredText(record.path, 'DiagramSpec source path')
  if (!isWorkspacePath(path)) {
    throw new DiagramSpecError('DiagramSpec source path must be workspace-relative.')
  }
  return Object.freeze({
    path,
    revision: requiredText(record.revision, 'DiagramSpec source revision') as Revision,
  })
}

function parseGeneration(value: unknown): DiagramGenerationProvenance {
  const record = requiredRecord(value, 'DiagramSpec generation must be an object.')
  assertKnownKeys(record, ['promptPolicyId', 'provider', 'model'], 'DiagramSpec generation')
  return Object.freeze({
    promptPolicyId: requiredText(record.promptPolicyId, 'DiagramSpec prompt policy'),
    provider: requiredText(record.provider, 'DiagramSpec provider'),
    model: requiredText(record.model, 'DiagramSpec model'),
  })
}

function parseRendererIntent(value: unknown): DiagramRendererIntent {
  const record = requiredRecord(value, 'DiagramSpec rendererIntent must be an object.')
  assertKnownKeys(record, ['theme', 'fontFamily'], 'DiagramSpec rendererIntent')
  return Object.freeze({
    theme: requiredText(record.theme, 'DiagramSpec theme'),
    fontFamily: requiredText(record.fontFamily, 'DiagramSpec font family'),
  })
}

function parseGraph(value: unknown): DiagramGraphInput {
  const record = requiredRecord(value, 'DiagramSpec requires a graph payload.')
  assertKnownKeys(record, ['intent', 'nodes', 'edges'], 'DiagramSpec graph')
  const intent = requiredGraphIntent(record.intent)
  if (!Array.isArray(record.nodes) || record.nodes.length === 0) {
    throw new DiagramSpecError('DiagramSpec graph requires at least one node.')
  }
  const nodeIds = new Set<string>()
  const nodes = Object.freeze(record.nodes.map((node, index) => parseGraphNode(node, nodeIds, `DiagramSpec graph node ${index + 1}`)))
  if (!Array.isArray(record.edges)) {
    throw new DiagramSpecError('DiagramSpec graph edges must be an array.')
  }
  const edges = Object.freeze(record.edges.map((edge, index) => parseGraphEdge(edge, nodeIds, index)))
  return Object.freeze({ intent, nodes, edges })
}

function parseGraphNode(value: unknown, nodeIds: Set<string>, label: string): DiagramGraphNode {
  const record = requiredRecord(value, `${label} must be an object.`)
  assertKnownKeys(record, ['id', 'label', 'kind', 'children'], label)
  const id = requiredText(record.id, `${label} id`)
  if (nodeIds.has(id)) {
    throw new DiagramSpecError(`DiagramSpec graph node id is duplicated: ${id}`)
  }
  nodeIds.add(id)
  const kind = optionalText(record.kind, `${label} kind`)
  const children = record.children === undefined
    ? undefined
    : parseNodeChildren(record.children, nodeIds, label)
  return Object.freeze({
    id,
    label: requiredText(record.label, `${label} label`),
    ...(kind === undefined ? {} : { kind }),
    ...(children === undefined ? {} : { children }),
  })
}

function parseNodeChildren(value: unknown, nodeIds: Set<string>, parentLabel: string): readonly DiagramGraphNode[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DiagramSpecError(`${parentLabel} children must be a non-empty array when present.`)
  }
  return Object.freeze(value.map((child, index) => parseGraphNode(child, nodeIds, `${parentLabel} child ${index + 1}`)))
}

function parseGraphEdge(value: unknown, nodeIds: ReadonlySet<string>, index: number): DiagramGraphEdge {
  const record = requiredRecord(value, `DiagramSpec graph edge ${index + 1} must be an object.`)
  assertKnownKeys(record, ['from', 'to', 'label', 'relation'], `DiagramSpec graph edge ${index + 1}`)
  const from = requiredText(record.from, `DiagramSpec graph edge ${index + 1} from`)
  const to = requiredText(record.to, `DiagramSpec graph edge ${index + 1} to`)
  if (!nodeIds.has(from) || !nodeIds.has(to)) {
    throw new DiagramSpecError(`DiagramSpec graph edge ${index + 1} references an unknown node.`)
  }
  const label = optionalText(record.label, `DiagramSpec graph edge ${index + 1} label`)
  const relation = optionalText(record.relation, `DiagramSpec graph edge ${index + 1} relation`)
  return Object.freeze({
    from,
    to,
    ...(label === undefined ? {} : { label }),
    ...(relation === undefined ? {} : { relation }),
  })
}

function parseChart(value: unknown): DiagramChartInput {
  const record = requiredRecord(value, 'DiagramSpec requires a chart payload.')
  assertKnownKeys(record, ['chartType', 'series'], 'DiagramSpec chart')
  const chartType = requiredChartType(record.chartType)
  if (!Array.isArray(record.series) || record.series.length === 0) {
    throw new DiagramSpecError('DiagramSpec chart requires at least one series.')
  }
  const seriesIds = new Set<string>()
  const series = Object.freeze(record.series.map((item, index) => parseChartSeries(item, seriesIds, index)))
  if (chartType === 'pie' && series.length !== 1) {
    throw new DiagramSpecError('DiagramSpec pie charts require exactly one series.')
  }
  return Object.freeze({ chartType, series })
}

function parseChartSeries(value: unknown, seriesIds: Set<string>, index: number): DiagramChartSeries {
  const record = requiredRecord(value, `DiagramSpec chart series ${index + 1} must be an object.`)
  assertKnownKeys(record, ['id', 'label', 'points'], `DiagramSpec chart series ${index + 1}`)
  const id = requiredText(record.id, `DiagramSpec chart series ${index + 1} id`)
  if (seriesIds.has(id)) {
    throw new DiagramSpecError(`DiagramSpec chart series id is duplicated: ${id}`)
  }
  seriesIds.add(id)
  if (!Array.isArray(record.points) || record.points.length === 0) {
    throw new DiagramSpecError(`DiagramSpec chart series ${id} requires points.`)
  }
  return Object.freeze({
    id,
    label: requiredText(record.label, `DiagramSpec chart series ${index + 1} label`),
    points: Object.freeze(record.points.map((point, pointIndex) => parseChartPoint(point, id, pointIndex))),
  })
}

function parseChartPoint(value: unknown, seriesId: string, index: number): DiagramChartPoint {
  const record = requiredRecord(value, `DiagramSpec chart point ${seriesId}:${index + 1} must be an object.`)
  assertKnownKeys(record, ['x', 'y'], `DiagramSpec chart point ${seriesId}:${index + 1}`)
  const x = record.x
  if ((typeof x !== 'string' || x.trim().length === 0) && (typeof x !== 'number' || !Number.isFinite(x))) {
    throw new DiagramSpecError(`DiagramSpec chart point ${seriesId}:${index + 1} requires a string or finite numeric x value.`)
  }
  if (typeof record.y !== 'number' || !Number.isFinite(record.y)) {
    throw new DiagramSpecError(`DiagramSpec chart point ${seriesId}:${index + 1} requires a finite numeric y value.`)
  }
  return Object.freeze({ x, y: record.y })
}

function parseCircuit(value: unknown): CircuitDiagramInput {
  const record = requiredRecord(value, 'DiagramSpec requires a circuit payload.')
  assertKnownKeys(record, ['components', 'connections'], 'DiagramSpec circuit')
  if (!Array.isArray(record.components) || record.components.length === 0) {
    throw new DiagramSpecError('DiagramSpec circuit requires at least one component.')
  }
  const componentIds = new Set<string>()
  const components = Object.freeze(record.components.map((component, index) => {
    const item = requiredRecord(component, `DiagramSpec circuit component ${index + 1} must be an object.`)
    assertKnownKeys(item, ['id', 'kind', 'label'], `DiagramSpec circuit component ${index + 1}`)
    const id = requiredText(item.id, `DiagramSpec circuit component ${index + 1} id`)
    if (componentIds.has(id)) {
      throw new DiagramSpecError(`DiagramSpec circuit component id is duplicated: ${id}`)
    }
    componentIds.add(id)
    return Object.freeze({
      id,
      kind: requiredText(item.kind, `DiagramSpec circuit component ${index + 1} kind`),
      label: requiredText(item.label, `DiagramSpec circuit component ${index + 1} label`),
    })
  }))
  if (!Array.isArray(record.connections)) {
    throw new DiagramSpecError('DiagramSpec circuit connections must be an array.')
  }
  const connections = Object.freeze(record.connections.map((connection, index) => {
    const item = requiredRecord(connection, `DiagramSpec circuit connection ${index + 1} must be an object.`)
    assertKnownKeys(item, ['from', 'to', 'net'], `DiagramSpec circuit connection ${index + 1}`)
    const from = requiredText(item.from, `DiagramSpec circuit connection ${index + 1} from`)
    const to = requiredText(item.to, `DiagramSpec circuit connection ${index + 1} to`)
    if (!componentIds.has(from) || !componentIds.has(to)) {
      throw new DiagramSpecError(`DiagramSpec circuit connection ${index + 1} references an unknown component.`)
    }
    const net = optionalText(item.net, `DiagramSpec circuit connection ${index + 1} net`)
    return Object.freeze({ from, to, ...(net === undefined ? {} : { net }) })
  }))
  return Object.freeze({ components, connections })
}

function requiredTarget(value: unknown): DiagramCanonicalTarget {
  if (typeof value !== 'string' || !(diagramCanonicalTargets as readonly string[]).includes(value)) {
    throw new DiagramSpecError(`DiagramSpec requires a supported canonical target: ${diagramCanonicalTargets.join(', ')}.`)
  }
  return value as DiagramCanonicalTarget
}

function requiredGraphIntent(value: unknown): GraphDiagramIntent {
  if (typeof value !== 'string' || !(graphDiagramIntents as readonly string[]).includes(value)) {
    throw new DiagramSpecError(`DiagramSpec graph intent must be one of: ${graphDiagramIntents.join(', ')}.`)
  }
  return value as GraphDiagramIntent
}

function requiredChartType(value: unknown): ChartType {
  if (typeof value !== 'string' || !(chartTypes as readonly string[]).includes(value)) {
    throw new DiagramSpecError(`DiagramSpec chart type must be one of: ${chartTypes.join(', ')}.`)
  }
  return value as ChartType
}

function parseTextList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim().length === 0)) {
    throw new DiagramSpecError(`${label} must be an array of non-empty strings.`)
  }
  const normalized = value.map((item) => item.trim())
  if (new Set(normalized).size !== normalized.length) {
    throw new DiagramSpecError(`${label} must not contain duplicates.`)
  }
  return Object.freeze(normalized)
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new DiagramSpecError(`${label} must be a non-empty string.`)
  }
  return value.trim()
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined
  }
  return requiredText(value, label)
}

function requiredRecord(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DiagramSpecError(message)
  }
  return value as Record<string, unknown>
}

function assertKnownKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const known = new Set(keys)
  const unknown = Object.keys(record).filter((key) => !known.has(key))
  if (unknown.length > 0) {
    throw new DiagramSpecError(`${label} contains unsupported fields: ${unknown.sort().join(', ')}.`)
  }
}

function isWorkspacePath(path: string): boolean {
  return !path.startsWith('/')
    && !path.includes('\\')
    && path.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}
