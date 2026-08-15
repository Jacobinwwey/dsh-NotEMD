import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'

import type { NotemdToolContext } from './notemd-services.js'
import {
  executeTool,
  outcomeOutput,
  requiredString,
  requiredStringList,
  type ToolDefinitionFactory,
  type ToolExecutionContext,
  workspaceMutationPlanSchema,
} from './tool-contract.js'

type PlanOperation = (args: unknown, execution?: ToolExecutionContext) => Promise<WorkspaceMutationPlan>

export function registerPlanTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_wiki_links',
    description: 'Create a reviewable plan that adds precise wiki-links to one note.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planWikiLinks(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_translation',
    description: 'Create a reviewable plan that translates one note into a separate target document.',
    parameters: {
      ...pathParameters,
      language: { type: 'string', required: true, description: 'Target language.' },
    },
    execute: (args, execution) => context.notemdWorkflows.planTranslation(
      requiredString(args, 'path'),
      requiredString(args, 'language'),
      execution?.signal,
    ),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_title_generation',
    description: 'Create a reviewable plan that gives one note an accurate leading title.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planTitleGeneration(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_research_synthesis',
    description: 'Create a reviewable plan that synthesizes explicit source text into one note.',
    parameters: {
      ...pathParameters,
      sources: {
        type: 'array',
        required: true,
        description: 'Source passages to synthesize.',
        items: { type: 'string' },
      },
    },
    execute: (args, execution) => context.notemdWorkflows.planResearchSynthesis(
      requiredString(args, 'path'),
      requiredStringList(args, 'sources'),
      execution?.signal,
    ),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_concept_extraction',
    description: 'Create a reviewable plan that writes extracted concept notes.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planConceptExtraction(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_mermaid_repair',
    description: 'Create a reviewable plan that repairs Mermaid code fences without changing surrounding prose.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planMermaidRepair(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_formula_repair',
    description: 'Create a deterministic reviewable plan that normalizes formula delimiters.',
    parameters: pathParameters,
    execute: (args) => context.notemdWorkflows.planFormulaRepair(requiredString(args, 'path')),
  })
}

const pathParameters = {
  path: { type: 'string', required: true, description: 'Workspace-relative Markdown path.' },
} as const

function registerPlanTool(
  context: NotemdToolContext,
  defineTool: ToolDefinitionFactory,
  definition: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute: PlanOperation
  },
): void {
  context.tools.register(defineTool({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    output: outcomeOutput({ plan: workspaceMutationPlanSchema }, ['plan']),
    async execute(args, execution) {
      return executeTool(async () => ({ plan: await definition.execute(args, execution) }))
    },
  }))
}
