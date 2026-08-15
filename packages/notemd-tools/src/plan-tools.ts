import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import { sourceSiblingOriginalTextOutput } from '@notemd-harness/workflows'

import type { NotemdToolContext } from './notemd-services.js'
import {
  executeTool,
  arraySchema,
  closedObjectSchema,
  integerSchema,
  outcomeOutput,
  requiredString,
  requiredStringList,
  type ToolDefinitionFactory,
  type ToolExecutionContext,
  workspaceMutationPlanSchema,
} from './tool-contract.js'

type PlanOperation = (args: unknown, execution?: ToolExecutionContext) => Promise<WorkspaceMutationPlan>
type FolderPlanOperation = (args: unknown, execution?: ToolExecutionContext) => Promise<readonly WorkspaceMutationPlan[]>

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
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_chapter_split',
    description: 'Create one reviewable proposal that owns a note chapter split, table of contents, manifest, and stale generated-file cleanup.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planChapterSplit(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_original_text_extraction',
    description: 'Create a source-compatible original-text extraction proposal with one model call per reviewed question.',
    parameters: originalTextParameters,
    execute: (args, execution) => context.notemdWorkflows.planOriginalTextExtraction(
      requiredString(args, 'path'),
      requiredStringList(args, 'questions'),
      sourceSiblingOriginalTextOutput(),
      execution?.signal,
    ),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_merged_original_text_extraction',
    description: 'Create a source-compatible original-text extraction proposal using one numbered, merged model request.',
    parameters: originalTextParameters,
    execute: (args, execution) => context.notemdWorkflows.planMergedOriginalTextExtraction(
      requiredString(args, 'path'),
      requiredStringList(args, 'questions'),
      sourceSiblingOriginalTextOutput(),
      execution?.signal,
    ),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_extract_and_generate',
    description: 'Create one reviewable proposal that extracts concepts and generates the corresponding focused note.',
    parameters: pathParameters,
    execute: (args, execution) => context.notemdWorkflows.planExtractAndGenerate(requiredString(args, 'path'), execution?.signal),
  })
  registerPlanTool(context, defineTool, {
    name: 'notemd_plan_concept_dedupe',
    description: 'Create a reviewable deletion proposal for explicitly reviewed duplicate concept paths.',
    parameters: {
      candidatePaths: { type: 'array', items: { type: 'string' }, required: true, description: 'Reviewed duplicate concept paths to delete.' },
    },
    execute: (args, execution) => context.notemdWorkflows.planConceptDedupe(requiredStringList(args, 'candidatePaths'), execution?.signal),
  })

  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_wiki_links_in_folder',
    description: 'Create deterministic per-note wiki-link proposals for one folder.',
    parameters: folderParameters,
    execute: (args, execution) => context.notemdWorkflows.planWikiLinksInFolder(requiredString(args, 'folderPath'), execution?.signal),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_titles_in_folder',
    description: 'Create deterministic per-note title-generation proposals for one folder.',
    parameters: folderParameters,
    execute: (args, execution) => context.notemdWorkflows.planTitlesInFolder(requiredString(args, 'folderPath'), execution?.signal),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_translations_in_folder',
    description: 'Create deterministic per-note translation proposals for one folder.',
    parameters: {
      ...folderParameters,
      language: { type: 'string', required: true, description: 'Target language.' },
    },
    execute: (args, execution) => context.notemdWorkflows.planTranslationsInFolder(
      requiredString(args, 'folderPath'),
      requiredString(args, 'language'),
      execution?.signal,
    ),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_concepts_in_folder',
    description: 'Create deterministic per-note concept-extraction proposals for one folder.',
    parameters: folderParameters,
    execute: (args, execution) => context.notemdWorkflows.planConceptsInFolder(requiredString(args, 'folderPath'), execution?.signal),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_mermaid_repairs_in_folder',
    description: 'Create deterministic per-note Mermaid-repair proposals for one folder.',
    parameters: folderParameters,
    execute: (args, execution) => context.notemdWorkflows.planMermaidRepairsInFolder(requiredString(args, 'folderPath'), execution?.signal),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_formula_repairs_in_folder',
    description: 'Create deterministic per-note formula-repair proposals for one folder.',
    parameters: folderParameters,
    execute: (args) => context.notemdWorkflows.planFormulaRepairsInFolder(requiredString(args, 'folderPath')),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_chapter_splits_in_folder',
    description: 'Create deterministic per-note chapter-split proposals for one folder.',
    parameters: folderParameters,
    execute: (args, execution) => context.notemdWorkflows.planChapterSplitsInFolder(requiredString(args, 'folderPath'), execution?.signal),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_original_text_extractions_in_folder',
    description: 'Create deterministic per-note original-text extraction proposals using one model call per question.',
    parameters: folderOriginalTextParameters,
    execute: (args, execution) => context.notemdWorkflows.planOriginalTextExtractionsInFolder(
      requiredString(args, 'folderPath'),
      requiredStringList(args, 'questions'),
      sourceSiblingOriginalTextOutput(),
      execution?.signal,
    ),
  })
  registerFolderPlanTool(context, defineTool, {
    name: 'notemd_plan_merged_original_text_extractions_in_folder',
    description: 'Create deterministic per-note original-text extraction proposals using one merged numbered request.',
    parameters: folderOriginalTextParameters,
    execute: (args, execution) => context.notemdWorkflows.planMergedOriginalTextExtractionsInFolder(
      requiredString(args, 'folderPath'),
      requiredStringList(args, 'questions'),
      sourceSiblingOriginalTextOutput(),
      execution?.signal,
    ),
  })

  context.tools.register(defineTool({
    name: 'notemd_check_file_duplicates',
    description: 'Report normalized duplicate terms from one note without proposing a mutation.',
    parameters: pathParameters,
    output: outcomeOutput({
      duplicates: arraySchema(closedObjectSchema({ term: { type: 'string' }, occurrences: integerSchema() }, ['term', 'occurrences'])),
    }, ['duplicates']),
    async execute(args, execution) {
      return executeTool(async () => ({
        duplicates: await context.notemdWorkflows.checkFileDuplicates(requiredString(args, 'path'), execution?.signal),
      }))
    },
  }))
}

const pathParameters = {
  path: { type: 'string', required: true, description: 'Workspace-relative Markdown path.' },
} as const

const folderParameters = {
  folderPath: { type: 'string', required: true, description: 'Workspace-relative folder path.' },
} as const

const originalTextParameters = {
  ...pathParameters,
  questions: { type: 'array', items: { type: 'string' }, required: true, description: 'Ordered extraction questions.' },
} as const

const folderOriginalTextParameters = {
  ...folderParameters,
  questions: { type: 'array', items: { type: 'string' }, required: true, description: 'Ordered extraction questions.' },
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

function registerFolderPlanTool(
  context: NotemdToolContext,
  defineTool: ToolDefinitionFactory,
  definition: {
    name: string
    description: string
    parameters: Record<string, unknown>
    execute: FolderPlanOperation
  },
): void {
  context.tools.register(defineTool({
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    output: outcomeOutput({ plans: arraySchema(workspaceMutationPlanSchema) }, ['plans']),
    async execute(args, execution) {
      return executeTool(async () => ({ plans: await definition.execute(args, execution) }))
    },
  }))
}
