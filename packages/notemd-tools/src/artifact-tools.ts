import {
  validateDiagramSpec,
  type ArtifactCapability,
  type DiagramCanonicalTarget,
  type DiagramSpec,
  type DiagramSpecFor,
  type SlidevHtmlExportSpec,
  type SlidevMp4ExportSpec,
  type SlidevPdfExportSpec,
  type SlidevPngExportSpec,
  type SlidevPptxExportSpec,
  type SlidevSourceSpec,
} from '@notemd-harness/artifacts'

import type { NotemdToolContext } from './notemd-services.js'
import {
  arraySchema,
  artifactCapabilitySchema,
  executeTool,
  outcomeOutput,
  requiredObject,
  requiredString,
  isRecord,
  stringSchema,
  ToolInputError,
  type ToolDefinitionFactory,
  workspaceMutationPlanSchema,
} from './tool-contract.js'

export function registerArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  registerMermaidArtifactTools(context, defineTool)
  registerVegaLiteArtifactTools(context, defineTool)
  registerJsonCanvasArtifactTools(context, defineTool)
  registerHtmlArtifactTools(context, defineTool)
  registerEditableSvgArtifactTools(context, defineTool)
  registerDrawioArtifactTools(context, defineTool)
  registerDrawnixArtifactTools(context, defineTool)
  registerCircuitikzArtifactTools(context, defineTool)
  registerSlidevExportTools(context, defineTool)

  context.tools.register(defineTool({
    name: 'notemd_artifact_cleanup',
    description: 'List only manifest-owned artifact paths eligible for a separate cleanup decision.',
    parameters: {
      artifactId: { type: 'string', required: true, description: 'Artifact identifier.' },
    },
    output: outcomeOutput({ artifactId: stringSchema(), ownedPaths: arraySchema(stringSchema()) }, ['artifactId', 'ownedPaths']),
    async execute(args) {
      return executeTool(async () => {
        const artifactId = requiredArtifactId(args)
        return { artifactId, ownedPaths: await context.notemdArtifacts.planCleanup(artifactId) }
      })
    },
  }))
}

function registerSlidevExportTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_source',
    description: 'Create deterministic source-bound Slidev Markdown and its layout report as a reviewable mutation proposal.',
    parameters: { spec: slidevSourceSpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevSourceSpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevSource(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_source_status',
    'Report deterministic Slidev source-preparation availability.',
    (signal) => context.notemdArtifacts.slidevSourceCapability(signal),
    defineTool,
  ))

  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_html_export',
    description: 'Create a staged standalone HTML ZIP export through the pinned NoteMD Slidev fork.',
    parameters: { spec: slidevSourceSpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevHtmlSpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevHtmlExport(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_html_export_status',
    'Report pinned-fork standalone HTML export availability.',
    (signal) => context.notemdArtifacts.slidevHtmlExportCapability(signal),
    defineTool,
  ))

  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_pdf_export',
    description: 'Create a staged PDF export through the pinned NoteMD Slidev fork and Playwright.',
    parameters: { spec: slidevSourceSpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevPdfSpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevPdfExport(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_pdf_export_status',
    'Report pinned-fork PDF export availability.',
    (signal) => context.notemdArtifacts.slidevPdfExportCapability(signal),
    defineTool,
  ))

  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_png_export',
    description: 'Create a staged deterministic ZIP of Slidev PNG frames.',
    parameters: { spec: slidevPngSpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevPngSpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevPngExport(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_png_export_status',
    'Report pinned-fork PNG sequence export availability.',
    (signal) => context.notemdArtifacts.slidevPngExportCapability(signal),
    defineTool,
  ))

  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_pptx_export',
    description: 'Create a staged native PPTX export through the pinned NoteMD Slidev fork.',
    parameters: { spec: slidevSourceSpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevPptxSpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevPptxExport(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_pptx_export_status',
    'Report pinned-fork native PPTX export availability.',
    (signal) => context.notemdArtifacts.slidevPptxExportCapability(signal),
    defineTool,
  ))

  context.tools.register(defineTool({
    name: 'notemd_plan_slidev_mp4_export',
    description: 'Create a staged MP4 through the pinned NoteMD Slidev fork PNG sequence and FFmpeg.',
    parameters: { spec: slidevMp4SpecParameter },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = slidevMp4SpecFrom(requiredObject(args, 'spec'))
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planSlidevMp4Export(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_slidev_mp4_export_status',
    'Report pinned-fork PNG plus FFmpeg MP4 export availability.',
    (signal) => context.notemdArtifacts.slidevMp4ExportCapability(signal),
    defineTool,
  ))
}

function registerMermaidArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_mermaid_artifact',
    description: 'Create a reviewable Mermaid source, SVG preview, and SVG export plan from a source-bound diagram specification.',
    parameters: { spec: graphDiagramSpecParameter('mermaid') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'mermaid')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: context.notemdArtifacts.planMermaidArtifact(spec, source) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_mermaid_render_status',
    'Report whether the Mermaid source projection renderer is available.',
    () => context.notemdArtifacts.mermaidRenderingCapability(),
    defineTool,
  ))
}

function registerVegaLiteArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_vega_lite_artifact',
    description: 'Create a reviewable Vega-Lite source, SVG preview, and SVG export plan from a source-bound chart specification.',
    parameters: { spec: chartDiagramSpecParameter('vega-lite') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'vega-lite')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: context.notemdArtifacts.planVegaLiteArtifact(spec, source) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_vega_lite_render_status',
    'Report whether the Vega-Lite SVG projection renderer is available.',
    () => context.notemdArtifacts.vegaLiteRenderingCapability(),
    defineTool,
  ))
}

function registerJsonCanvasArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_json_canvas_artifact',
    description: 'Create a reviewable JSON Canvas source and explicitly labelled SVG projection plan from a source-bound diagram specification.',
    parameters: { spec: graphDiagramSpecParameter('json-canvas') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'json-canvas')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: context.notemdArtifacts.planJsonCanvasArtifact(spec, source) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_json_canvas_render_status',
    'Report whether the JSON Canvas SVG projection renderer is available.',
    () => context.notemdArtifacts.jsonCanvasRenderingCapability(),
    defineTool,
  ))
}

function registerHtmlArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_html_artifact',
    description: 'Create a reviewable HTML source, SVG preview, and SVG export plan from a source-bound diagram specification.',
    parameters: { spec: graphDiagramSpecParameter('html') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'html')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: context.notemdArtifacts.planHtmlArtifact(spec, source) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_html_render_status',
    'Report whether the HTML SVG projection renderer is available.',
    () => context.notemdArtifacts.htmlRenderingCapability(),
    defineTool,
  ))
}

function registerEditableSvgArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_editable_svg_artifact',
    description: 'Create a reviewable editable SVG source, preview, and SVG export plan from a source-bound diagram specification.',
    parameters: { spec: graphDiagramSpecParameter('editable-svg') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'editable-svg')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: context.notemdArtifacts.planEditableSvgArtifact(spec, source) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_editable_svg_render_status',
    'Report whether the editable SVG renderer is available.',
    () => context.notemdArtifacts.editableSvgRenderingCapability(),
    defineTool,
  ))
}

function registerDrawioArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_drawio_artifact',
    description: 'Create a reviewable Draw.io XML source, labelled SVG projection, and capability-gated native SVG export plan.',
    parameters: { spec: graphDiagramSpecParameter('drawio') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'drawio')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planDrawioArtifact(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_drawio_render_status',
    'Report whether controlled Draw.io native SVG export is available.',
    (signal) => context.notemdArtifacts.drawioRenderingCapability(signal),
    defineTool,
  ))
}

function registerDrawnixArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_drawnix_artifact',
    description: 'Create a versioned Drawnix semantic source, labelled SVG projection, and optional adapter-native SVG export plan.',
    parameters: { spec: graphDiagramSpecParameter('drawnix') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'drawnix')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planDrawnixArtifact(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_drawnix_render_status',
    'Report whether the optional controlled notemd-drawnix-render adapter is available.',
    (signal) => context.notemdArtifacts.drawnixRenderingCapability(signal),
    defineTool,
  ))
}

function registerCircuitikzArtifactTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_plan_circuitikz_artifact',
    description: 'Create a reviewable Circuitikz source, labelled SVG projection, and capability-gated staged PDF export plan.',
    parameters: { spec: circuitDiagramSpecParameter('circuitikz') },
    output: planOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const spec = diagramSpecFrom(requiredObject(args, 'spec'), 'circuitikz')
        const source = await context.notemdVault.read(spec.source.path, execution?.signal)
        return { plan: await context.notemdArtifacts.planCircuitikzArtifact(spec, source, execution?.signal) }
      })
    },
  }))
  context.tools.register(renderStatusTool(
    'notemd_circuitikz_render_status',
    'Report whether controlled Tectonic PDF export is available for Circuitikz.',
    (signal) => context.notemdArtifacts.circuitikzRenderingCapability(signal),
    defineTool,
  ))
}

function renderStatusTool(
  name: string,
  description: string,
  capability: (signal?: AbortSignal) => ArtifactCapability | Promise<ArtifactCapability>,
  defineTool: ToolDefinitionFactory,
) {
  return defineTool({
    name,
    description,
    parameters: {},
    output: capabilityOutput,
    async execute(_args, execution) {
      return executeTool(async () => ({ capability: await capability(execution?.signal) }))
    },
  })
}

const planOutput = outcomeOutput({ plan: workspaceMutationPlanSchema }, ['plan'])
const capabilityOutput = outcomeOutput({ capability: artifactCapabilitySchema }, ['capability'])

const slidevSourceProperties = {
  version: { type: 'integer', required: true, const: 1 },
  title: { type: 'string', required: true },
  source: {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      path: { type: 'string', required: true },
      revision: { type: 'string', required: true },
    },
  },
  theme: { type: 'string', required: true },
} as const

const slidevSourceSpecParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: slidevSourceProperties,
} as const

const slidevPngSpecParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    ...slidevSourceProperties,
    withClicks: { type: 'boolean', required: true },
    imageScale: { type: 'number', required: true },
  },
} as const

const slidevMp4SpecParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    ...slidevSourceProperties,
    withClicks: { type: 'boolean', required: true },
    imageScale: { type: 'number', required: true },
    fps: { type: 'number', required: true },
    crf: { type: 'integer', required: true },
  },
} as const

const slidevSourcePropertyNames = Object.freeze(['version', 'title', 'source', 'theme'])
const slidevPngPropertyNames = Object.freeze([...slidevSourcePropertyNames, 'withClicks', 'imageScale'])
const slidevMp4PropertyNames = Object.freeze([...slidevPngPropertyNames, 'fps', 'crf'])

function slidevSourceSpecFrom(specRecord: Record<string, unknown>): SlidevSourceSpec {
  assertExactProperties(specRecord, slidevSourcePropertyNames, 'Slidev source specification')
  return slidevBaseFields(specRecord)
}

function slidevHtmlSpecFrom(specRecord: Record<string, unknown>): SlidevHtmlExportSpec {
  assertExactProperties(specRecord, slidevSourcePropertyNames, 'Slidev HTML export specification')
  return slidevBaseFields(specRecord)
}

function slidevPdfSpecFrom(specRecord: Record<string, unknown>): SlidevPdfExportSpec {
  assertExactProperties(specRecord, slidevSourcePropertyNames, 'Slidev PDF export specification')
  return slidevBaseFields(specRecord)
}

function slidevPptxSpecFrom(specRecord: Record<string, unknown>): SlidevPptxExportSpec {
  assertExactProperties(specRecord, slidevSourcePropertyNames, 'Slidev PPTX export specification')
  return slidevBaseFields(specRecord)
}

function slidevPngSpecFrom(specRecord: Record<string, unknown>): SlidevPngExportSpec {
  assertExactProperties(specRecord, slidevPngPropertyNames, 'Slidev PNG export specification')
  const imageScale = requiredFiniteNumber(specRecord, 'imageScale')
  if (imageScale < 1 || imageScale > 8) {
    throw new ToolInputError('Slidev PNG imageScale must be between 1 and 8.')
  }
  return {
    ...slidevBaseFields(specRecord),
    withClicks: requiredBoolean(specRecord, 'withClicks'),
    imageScale,
  }
}

function slidevMp4SpecFrom(specRecord: Record<string, unknown>): SlidevMp4ExportSpec {
  assertExactProperties(specRecord, slidevMp4PropertyNames, 'Slidev MP4 export specification')
  const imageScale = requiredFiniteNumber(specRecord, 'imageScale')
  const fps = requiredFiniteNumber(specRecord, 'fps')
  const crf = requiredFiniteNumber(specRecord, 'crf')
  if (imageScale < 1 || imageScale > 8 || fps <= 0 || fps > 60 || !Number.isInteger(crf) || crf < 0 || crf > 51) {
    throw new ToolInputError('Slidev MP4 options require imageScale in [1, 8], fps in (0, 60], and integer crf in [0, 51].')
  }
  return {
    ...slidevBaseFields(specRecord),
    withClicks: requiredBoolean(specRecord, 'withClicks'),
    imageScale,
    fps,
    crf,
  }
}

function slidevBaseFields(specRecord: Record<string, unknown>): SlidevSourceSpec {
  if (specRecord.version !== 1) {
    throw new ToolInputError('Slidev specifications require version 1.')
  }
  const sourceRecord = specRecord.source
  if (!isRecord(sourceRecord)) {
    throw new ToolInputError('Slidev specifications require a source object.')
  }
  assertExactProperties(sourceRecord, ['path', 'revision'], 'Slidev source binding')
  return {
    version: 1,
    title: requiredRecordString(specRecord, 'title'),
    source: {
      path: requiredRecordString(sourceRecord, 'path'),
      revision: requiredRecordString(sourceRecord, 'revision'),
    },
    theme: requiredRecordString(specRecord, 'theme'),
  }
}

function assertExactProperties(record: Record<string, unknown>, allowedNames: readonly string[], label: string): void {
  const allowed = new Set(allowedNames)
  if (Object.keys(record).some((name) => !allowed.has(name)) || allowedNames.some((name) => !Object.hasOwn(record, name))) {
    throw new ToolInputError(`${label} must contain exactly its declared properties.`)
  }
}

function requiredRecordString(record: Record<string, unknown>, name: string): string {
  const field = record[name]
  if (typeof field !== 'string' || field.trim().length === 0) {
    throw new ToolInputError(`Slidev specification property "${name}" must be a non-empty string.`)
  }
  return field
}

function requiredBoolean(record: Record<string, unknown>, name: string): boolean {
  const field = record[name]
  if (typeof field !== 'boolean') {
    throw new ToolInputError(`Slidev specification property "${name}" must be boolean.`)
  }
  return field
}

function requiredFiniteNumber(record: Record<string, unknown>, name: string): number {
  const field = record[name]
  if (typeof field !== 'number' || !Number.isFinite(field)) {
    throw new ToolInputError(`Slidev specification property "${name}" must be a finite number.`)
  }
  return field
}

function graphDiagramSpecParameter(target: 'mermaid' | 'json-canvas' | 'html' | 'editable-svg' | 'drawio' | 'drawnix') {
  return {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      ...diagramSpecBaseProperties(target),
      graph: graphParameter,
    },
  } as const
}

function chartDiagramSpecParameter(target: 'vega-lite') {
  return {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      ...diagramSpecBaseProperties(target),
      chart: chartParameter,
    },
  } as const
}

function circuitDiagramSpecParameter(target: 'circuitikz') {
  return {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      ...diagramSpecBaseProperties(target),
      circuit: circuitParameter,
    },
  } as const
}

function diagramSpecBaseProperties(target: DiagramCanonicalTarget) {
  return {
    version: { type: 'integer', required: true, const: 2 },
    title: { type: 'string', required: true },
    source: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        path: { type: 'string', required: true },
        revision: { type: 'string', required: true },
      },
    },
    evidenceRefs: { type: 'array', required: true, items: { type: 'string' } },
    generation: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        promptPolicyId: { type: 'string', required: true },
        provider: { type: 'string', required: true },
        model: { type: 'string', required: true },
      },
    },
    rendererIntent: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        theme: { type: 'string', required: true },
        fontFamily: { type: 'string', required: true },
      },
    },
    canonicalTarget: { type: 'string', required: true, const: target },
  } as const
}

const graphParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    intent: {
      type: 'string',
      required: true,
      enum: ['flowchart', 'sequence', 'mindmap', 'class', 'er', 'state', 'canvas-map', 'drawnix-mindmap'],
    },
    nodes: {
      type: 'array',
      required: true,
      items: graphNodeParameter(8),
    },
    edges: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          label: { type: 'string' },
          relation: { type: 'string' },
        },
      },
    },
  },
} as const

const circuitParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    components: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          kind: { type: 'string', required: true },
          label: { type: 'string', required: true },
        },
      },
    },
    connections: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          from: { type: 'string', required: true },
          to: { type: 'string', required: true },
          net: { type: 'string' },
        },
      },
    },
  },
} as const

function graphNodeParameter(depth: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', required: true },
      label: { type: 'string', required: true },
      kind: { type: 'string' },
      ...(depth === 0 ? {} : {
        children: {
          type: 'array',
          items: graphNodeParameter(depth - 1),
        },
      }),
    },
  }
}

const chartParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    chartType: { type: 'string', required: true, enum: ['bar', 'line', 'area', 'point', 'scatter', 'pie', 'table'] },
    series: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          label: { type: 'string', required: true },
          points: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                x: { oneOf: [{ type: 'string' }, { type: 'number' }], required: true },
                y: { type: 'number', required: true },
              },
            },
          },
        },
      },
    },
  },
} as const

function diagramSpecFrom<Target extends DiagramCanonicalTarget>(
  value: Record<string, unknown>,
  expectedTarget: Target,
): DiagramSpecFor<Target> {
  let spec: DiagramSpec
  try {
    spec = validateDiagramSpec(value)
  } catch {
    throw new ToolInputError('Tool parameter "spec" is not a valid source-bound DiagramSpec.')
  }
  if (spec.canonicalTarget !== expectedTarget) {
    throw new ToolInputError(`Tool parameter "spec" must use canonicalTarget "${expectedTarget}".`)
  }
  return spec as DiagramSpecFor<Target>
}

function requiredArtifactId(args: unknown): string {
  return requiredString(args, 'artifactId')
}
