import {
  validateDiagramSpec,
  type DiagramSpec,
  type DiagramSpecFor,
  type SvgCanonicalTarget,
} from '@notemd-harness/artifacts'

import type { NotemdToolContext } from './notemd-services.js'
import {
  arraySchema,
  artifactCapabilitySchema,
  executeTool,
  outcomeOutput,
  requiredObject,
  requiredString,
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

  context.tools.register(defineTool({
    name: 'notemd_artifact_export_status',
    description: 'Report whether a portable document export provider is available to this NoteMD bundle.',
    parameters: {},
    output: capabilityOutput,
    async execute() {
      return executeTool(async () => ({ capability: context.notemdArtifacts.documentExportCapability() }))
    },
  }))

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

function renderStatusTool(
  name: string,
  description: string,
  capability: () => ReturnType<NotemdToolContext['notemdArtifacts']['mermaidRenderingCapability']>,
  defineTool: ToolDefinitionFactory,
) {
  return defineTool({
    name,
    description,
    parameters: {},
    output: capabilityOutput,
    async execute() {
      return executeTool(async () => ({ capability: capability() }))
    },
  })
}

const planOutput = outcomeOutput({ plan: workspaceMutationPlanSchema }, ['plan'])
const capabilityOutput = outcomeOutput({ capability: artifactCapabilitySchema }, ['capability'])

function graphDiagramSpecParameter(target: 'mermaid' | 'json-canvas' | 'html' | 'editable-svg') {
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

function diagramSpecBaseProperties(target: SvgCanonicalTarget) {
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
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          label: { type: 'string', required: true },
          kind: { type: 'string' },
        },
      },
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

function diagramSpecFrom<Target extends SvgCanonicalTarget>(
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
