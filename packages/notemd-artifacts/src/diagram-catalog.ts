export const diagramCatalogSchemaFamily = 'diagram-catalog' as const
export const diagramCatalogVersion = 1 as const
export const diagramIntentSchemaFamily = 'diagram-intent' as const
export const diagramIntentVersion = 1 as const

export type DiagramCatalogFamily = 'knowledge' | 'behavior' | 'structure' | 'quantitative' | 'engineering'
export type DiagramSemanticType =
  | 'mindmap'
  | 'flowchart'
  | 'sequence'
  | 'state'
  | 'class'
  | 'entity-relationship'
  | 'data-chart'
  | 'radar-chart'
  | 'org-chart'
  | 'timeline'
  | 'swimlane'
  | 'quadrant'
  | 'circuit'

export type DiagramCatalogRenderTarget =
  | 'mermaid'
  | 'vega-lite'
  | 'html'
  | 'editable-svg'
  | 'json-canvas'
  | 'drawio'
  | 'circuitikz'

export type DiagramExportFormat =
  | 'mermaid-source'
  | 'vega-lite-source'
  | 'json-canvas-source'
  | 'html'
  | 'svg-preview'
  | 'drawio-source'
  | 'circuitikz-source'
  | 'pdf'
  | 'png'
  | 'pptx'
  | 'mp4'

export interface DiagramCatalogEntry {
  readonly id: DiagramSemanticType
  readonly semanticType: DiagramSemanticType
  readonly family: DiagramCatalogFamily
  readonly semanticPattern: string
  readonly defaultRenderTarget: DiagramCatalogRenderTarget
  readonly renderTargets: readonly DiagramCatalogRenderTarget[]
  readonly exportFormats: readonly DiagramExportFormat[]
  readonly visualRoles: readonly string[]
}

export interface TimelineEvent {
  readonly id: string
  readonly date: string | number
  readonly label: string
  readonly details?: readonly string[]
}

export interface TimelinePayload {
  readonly events: readonly TimelineEvent[]
}

export interface SwimlaneStep {
  readonly id: string
  readonly label: string
  readonly nextStepId?: string
}

export interface SwimlaneLane {
  readonly id: string
  readonly label: string
  readonly steps: readonly SwimlaneStep[]
}

export interface SwimlanePayload {
  readonly lanes: readonly SwimlaneLane[]
}

export interface QuadrantItem {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
  readonly detail?: string
}

export interface QuadrantPayload {
  readonly xAxisLabel: readonly [string, string]
  readonly yAxisLabel: readonly [string, string]
  readonly quadrantLabels: readonly [string, string, string, string]
  readonly items: readonly QuadrantItem[]
}

export type DiagramIntentPayload =
  | TimelinePayload
  | SwimlanePayload
  | QuadrantPayload
  | Readonly<Record<string, unknown>>

export interface DiagramIntentEnvelope {
  readonly schemaFamily: typeof diagramIntentSchemaFamily
  readonly version: typeof diagramIntentVersion
  readonly semanticType: DiagramSemanticType
  readonly renderTarget: DiagramCatalogRenderTarget
  readonly exportFormat: DiagramExportFormat
  readonly payload: DiagramIntentPayload
}

const entries: readonly DiagramCatalogEntry[] = [
  entry('mindmap', 'knowledge', 'Concept hierarchy', 'mermaid', ['mermaid', 'html', 'editable-svg'], ['mermaid-source', 'svg-preview', 'html'], ['root', 'topic', 'detail']),
  entry('flowchart', 'behavior', 'Control flow and decision path', 'mermaid', ['mermaid', 'html', 'editable-svg', 'drawio'], ['mermaid-source', 'svg-preview', 'html', 'drawio-source'], ['start', 'step', 'decision', 'outcome']),
  entry('sequence', 'behavior', 'Ordered participant interaction', 'mermaid', ['mermaid', 'html', 'editable-svg', 'drawio'], ['mermaid-source', 'svg-preview', 'html', 'drawio-source'], ['participant', 'request', 'response']),
  entry('state', 'behavior', 'State transition lifecycle', 'mermaid', ['mermaid', 'html', 'editable-svg', 'drawio'], ['mermaid-source', 'svg-preview', 'html', 'drawio-source'], ['initial', 'state', 'transition', 'terminal']),
  entry('class', 'structure', 'Type relationship and ownership', 'mermaid', ['mermaid', 'html', 'editable-svg', 'drawio'], ['mermaid-source', 'svg-preview', 'html', 'drawio-source'], ['type', 'member', 'association']),
  entry('entity-relationship', 'structure', 'Entity cardinality and attributes', 'mermaid', ['mermaid', 'html', 'editable-svg', 'drawio'], ['mermaid-source', 'svg-preview', 'html', 'drawio-source'], ['entity', 'attribute', 'relationship']),
  entry('data-chart', 'quantitative', 'Measured comparison over a shared axis', 'vega-lite', ['vega-lite', 'html'], ['vega-lite-source', 'svg-preview', 'html', 'png', 'pdf'], ['series', 'measure', 'comparison']),
  entry('radar-chart', 'quantitative', 'Multi-axis profile comparison', 'vega-lite', ['vega-lite', 'html'], ['vega-lite-source', 'svg-preview', 'html', 'png', 'pdf'], ['axis', 'profile', 'value']),
  entry('org-chart', 'structure', 'Ownership hierarchy with accountable reporting paths', 'mermaid', ['mermaid', 'html'], ['mermaid-source', 'svg-preview', 'html'], ['root-owner', 'team', 'accountable-owner']),
  entry('timeline', 'behavior', 'Ordered milestones over time', 'mermaid', ['mermaid'], ['mermaid-source', 'svg-preview'], ['date', 'event', 'detail']),
  entry('swimlane', 'behavior', 'Cross-functional responsibility flow', 'mermaid', ['mermaid'], ['mermaid-source', 'svg-preview'], ['lane', 'step', 'handoff']),
  entry('quadrant', 'quantitative', 'Two-axis prioritization matrix', 'mermaid', ['mermaid'], ['mermaid-source', 'svg-preview'], ['axis', 'quadrant', 'item']),
  entry('circuit', 'engineering', 'Electrical components and nets', 'circuitikz', ['circuitikz'], ['circuitikz-source', 'svg-preview', 'pdf'], ['component', 'net', 'port']),
]

export const diagramCatalog = Object.freeze({
  schemaFamily: diagramCatalogSchemaFamily,
  version: diagramCatalogVersion,
  entries: Object.freeze(entries),
})

export function validateDiagramIntent(value: unknown): DiagramIntentEnvelope {
  const record = objectValue(value, 'Diagram intent must be an object.')
  assertKeys(record, ['schemaFamily', 'version', 'semanticType', 'renderTarget', 'exportFormat', 'payload'], 'Diagram intent')
  if (record.schemaFamily !== diagramIntentSchemaFamily || record.version !== diagramIntentVersion) {
    throw new TypeError('Diagram intent requires schemaFamily diagram-intent and version 1.')
  }

  const semanticType = textValue(record.semanticType, 'Diagram intent semanticType') as DiagramSemanticType
  const catalogEntry = diagramCatalog.entries.find((entry) => entry.semanticType === semanticType)
  if (catalogEntry === undefined) {
    throw new TypeError('Unknown diagram semantic type: ' + semanticType)
  }
  const renderTarget = textValue(record.renderTarget, 'Diagram intent renderTarget') as DiagramCatalogRenderTarget
  if (!catalogEntry.renderTargets.includes(renderTarget)) {
    throw new TypeError(`Diagram semantic type ${semanticType} does not support render target ${renderTarget}.`)
  }
  const exportFormat = textValue(record.exportFormat, 'Diagram intent exportFormat') as DiagramExportFormat
  if (!catalogEntry.exportFormats.includes(exportFormat)) {
    throw new TypeError(`Diagram semantic type ${semanticType} does not support export format ${exportFormat}.`)
  }

  return Object.freeze({
    schemaFamily: diagramIntentSchemaFamily,
    version: diagramIntentVersion,
    semanticType,
    renderTarget,
    exportFormat,
    payload: parsePayload(semanticType, record.payload),
  })
}

function parsePayload(semanticType: DiagramSemanticType, value: unknown): DiagramIntentPayload {
  const record = objectValue(value, `Diagram ${semanticType} payload must be an object.`)
  switch (semanticType) {
    case 'timeline':
      assertKeys(record, ['events'], 'Timeline payload')
      return Object.freeze({ events: Object.freeze(requiredArrayValue(record.events, 'Timeline events').map((item, index) => parseTimelineEvent(item, index))) })
    case 'swimlane':
      assertKeys(record, ['lanes'], 'Swimlane payload')
      return Object.freeze({ lanes: Object.freeze(requiredArrayValue(record.lanes, 'Swimlane lanes').map((item, index) => parseSwimlaneLane(item, index))) })
    case 'quadrant':
      assertKeys(record, ['xAxisLabel', 'yAxisLabel', 'quadrantLabels', 'items'], 'Quadrant payload')
      return parseQuadrantPayload(record)
    default:
      return Object.freeze({ ...record })
  }
}

function parseTimelineEvent(value: unknown, index: number): TimelineEvent {
  const record = objectValue(value, `Timeline event ${index + 1} must be an object.`)
  assertKeys(record, ['id', 'date', 'label', 'details'], `Timeline event ${index + 1}`)
  const details = record.details === undefined
    ? undefined
    : Object.freeze(arrayValue(record.details, `Timeline event ${index + 1} details`).map((item) => textValue(item, 'Timeline detail')))
  return Object.freeze({
    id: textValue(record.id, 'Timeline event id'),
    date: typeof record.date === 'number' ? finiteNumber(record.date, 'Timeline event date') : textValue(record.date, 'Timeline event date'),
    label: textValue(record.label, 'Timeline event label'),
    ...(details === undefined ? {} : { details }),
  })
}

function parseSwimlaneLane(value: unknown, index: number): SwimlaneLane {
  const record = objectValue(value, `Swimlane lane ${index + 1} must be an object.`)
  assertKeys(record, ['id', 'label', 'steps'], `Swimlane lane ${index + 1}`)
  return Object.freeze({
    id: textValue(record.id, 'Swimlane lane id'),
    label: textValue(record.label, 'Swimlane lane label'),
    steps: Object.freeze(arrayValue(record.steps, `Swimlane lane ${index + 1} steps`).map((item, stepIndex) => parseSwimlaneStep(item, stepIndex))),
  })
}

function parseSwimlaneStep(value: unknown, index: number): SwimlaneStep {
  const record = objectValue(value, `Swimlane step ${index + 1} must be an object.`)
  assertKeys(record, ['id', 'label', 'nextStepId'], `Swimlane step ${index + 1}`)
  const nextStepId = record.nextStepId === undefined ? undefined : textValue(record.nextStepId, 'Swimlane nextStepId')
  return Object.freeze({
    id: textValue(record.id, 'Swimlane step id'),
    label: textValue(record.label, 'Swimlane step label'),
    ...(nextStepId === undefined ? {} : { nextStepId }),
  })
}

function parseQuadrantPayload(record: Record<string, unknown>): QuadrantPayload {
  const xAxisLabel = tupleValue(record.xAxisLabel, 2, 'Quadrant xAxisLabel')
  const yAxisLabel = tupleValue(record.yAxisLabel, 2, 'Quadrant yAxisLabel')
  const quadrantLabels = tupleValue(record.quadrantLabels, 4, 'Quadrant quadrantLabels')
  return Object.freeze({
    xAxisLabel: [xAxisLabel[0]!, xAxisLabel[1]!] as const,
    yAxisLabel: [yAxisLabel[0]!, yAxisLabel[1]!] as const,
    quadrantLabels: [quadrantLabels[0]!, quadrantLabels[1]!, quadrantLabels[2]!, quadrantLabels[3]!] as const,
    items: Object.freeze(requiredArrayValue(record.items, 'Quadrant items').map((item, index) => parseQuadrantItem(item, index))),
  })
}

function parseQuadrantItem(value: unknown, index: number): QuadrantItem {
  const record = objectValue(value, `Quadrant item ${index + 1} must be an object.`)
  assertKeys(record, ['id', 'label', 'x', 'y', 'detail'], `Quadrant item ${index + 1}`)
  const detail = record.detail === undefined ? undefined : textValue(record.detail, 'Quadrant item detail')
  return Object.freeze({
    id: textValue(record.id, 'Quadrant item id'),
    label: textValue(record.label, 'Quadrant item label'),
    x: unitInterval(record.x, 'Quadrant item x'),
    y: unitInterval(record.y, 'Quadrant item y'),
    ...(detail === undefined ? {} : { detail }),
  })
}

function entry(
  id: DiagramSemanticType,
  family: DiagramCatalogFamily,
  semanticPattern: string,
  defaultRenderTarget: DiagramCatalogRenderTarget,
  renderTargets: readonly DiagramCatalogRenderTarget[],
  exportFormats: readonly DiagramExportFormat[],
  visualRoles: readonly string[],
): DiagramCatalogEntry {
  return Object.freeze({
    id,
    semanticType: id,
    family,
    semanticPattern,
    defaultRenderTarget,
    renderTargets: Object.freeze([...renderTargets]),
    exportFormats: Object.freeze([...exportFormats]),
    visualRoles: Object.freeze([...visualRoles]),
  })
}

function objectValue(value: unknown, message: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(message)
  }
  return value as Record<string, unknown>
}

function arrayValue(value: unknown, message: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new TypeError(message + ' must be an array.')
  }
  return value
}

function requiredArrayValue(value: unknown, message: string): readonly unknown[] {
  const values = arrayValue(value, message)
  if (values.length === 0) {
    throw new TypeError(message + ' must contain at least one item.')
  }
  return values
}

function textValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.includes('\u0000')) {
    throw new TypeError(field + ' must be non-empty text without NUL bytes.')
  }
  return value
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(field + ' must be a finite number.')
  }
  return value
}

function unitInterval(value: unknown, field: string): number {
  const number = finiteNumber(value, field)
  if (number < 0 || number > 1) {
    throw new TypeError(field + ' must be between 0 and 1.')
  }
  return number
}

function tupleValue(value: unknown, length: number, field: string): readonly [string, string] | readonly [string, string, string, string] {
  const values = arrayValue(value, field)
  if (values.length !== length) {
    throw new TypeError(field + ' must contain exactly ' + length + ' labels.')
  }
  const labels = values.map((item) => textValue(item, field + ' label'))
  return (length === 2 ? [labels[0]!, labels[1]!] : [labels[0]!, labels[1]!, labels[2]!, labels[3]!]) as readonly [string, string] | readonly [string, string, string, string]
}

function assertKeys(record: Record<string, unknown>, allowed: readonly string[], field: string): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key))
  if (unknown !== undefined) {
    throw new TypeError(`${field} contains unsupported field: ${unknown}`)
  }
}
