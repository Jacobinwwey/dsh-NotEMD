import type { DiagramSpec } from '@notemd-harness/artifacts'

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
  context.tools.register(defineTool({
    name: 'notemd_artifact_render_status',
    description: 'Report whether a portable diagram renderer is available to this NoteMD bundle.',
    parameters: {},
    output: capabilityOutput,
    async execute() {
      return capabilityOutcome(context.notemdArtifacts.diagramRenderingCapability())
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_artifact_export_status',
    description: 'Report whether a portable document export provider is available to this NoteMD bundle.',
    parameters: {},
    output: capabilityOutput,
    async execute() {
      return capabilityOutcome(context.notemdArtifacts.documentExportCapability())
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_plan_source_artifact',
    description: 'Create a reviewable source-artifact plan from a diagram specification and one source note.',
    parameters: {
      sourcePath: { type: 'string', required: true, description: 'Workspace-relative source Markdown path.' },
      spec: diagramSpecParameter,
    },
    output: outcomeOutput({ plan: workspaceMutationPlanSchema }, ['plan']),
    async execute(args, execution) {
      return executeTool(async () => {
        const source = await context.notemdVault.read(requiredString(args, 'sourcePath'), execution?.signal)
        return { plan: context.notemdArtifacts.planDiagram(diagramSpecFrom(requiredObject(args, 'spec')), source) }
      })
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_artifact_cleanup',
    description: 'List only manifest-owned source artifact paths eligible for a separate cleanup decision.',
    parameters: {
      artifactId: { type: 'string', required: true, description: 'Source artifact identifier.' },
    },
    output: outcomeOutput({ artifactId: stringSchema(), ownedPaths: arraySchema(stringSchema()) }, ['artifactId', 'ownedPaths']),
    async execute(args) {
      return executeTool(async () => {
        const artifactId = requiredString(args, 'artifactId')
        return { artifactId, ownedPaths: await context.notemdArtifacts.planCleanup(artifactId) }
      })
    },
  }))
}

const diagramSpecParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    version: { type: 'integer', required: true, const: 1 },
    title: { type: 'string', required: true },
    intent: {
      type: 'string',
      required: true,
      enum: ['flowchart', 'sequence', 'mindmap', 'class', 'er', 'state'],
    },
    source: { type: 'string', required: true },
  },
} as const

const capabilityOutput = outcomeOutput(
  { capability: artifactCapabilitySchema },
  ['capability'],
  [{ status: 'unavailable', properties: { code: stringSchema(), capability: artifactCapabilitySchema }, required: ['code', 'capability'] }],
)

function capabilityOutcome(capability: ReturnType<NotemdToolContext['notemdArtifacts']['diagramRenderingCapability']>) {
  return { status: 'unavailable' as const, code: `${capability.capability}-unavailable`, capability }
}

function diagramSpecFrom(value: Record<string, unknown>): DiagramSpec {
  if (
    value.version !== 1 ||
    typeof value.title !== 'string' ||
    typeof value.source !== 'string' ||
    typeof value.intent !== 'string' ||
    !['flowchart', 'sequence', 'mindmap', 'class', 'er', 'state'].includes(value.intent)
  ) {
    throw new ToolInputError('Tool parameter "spec" is not a valid DiagramSpec.')
  }

  return {
    version: 1,
    title: value.title,
    intent: value.intent as DiagramSpec['intent'],
    source: value.source,
  }
}
