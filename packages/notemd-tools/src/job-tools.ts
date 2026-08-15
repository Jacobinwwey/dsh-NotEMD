import type { NotemdToolContext } from './notemd-services.js'
import { objectOutput, requiredString, requiredStringList, type ToolDefinitionFactory } from './tool-contract.js'

export function registerJobTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_job_start_formula_repair',
    description: 'Start a durable, plan-only batch that prepares formula repair plans for explicit targets.',
    parameters: planningJobParameters,
    output: objectOutput,
    async execute(args) {
      return { job: await context.notemdJobs.startFormulaRepairs(planningJobRequest(args)) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_mermaid_repair',
    description: 'Start a durable, plan-only batch that prepares Mermaid repair plans for explicit targets.',
    parameters: planningJobParameters,
    output: objectOutput,
    async execute(args) {
      return { job: await context.notemdJobs.startMermaidRepairs(planningJobRequest(args)) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_translation',
    description: 'Start a durable, plan-only batch that prepares translations for explicit targets and one language.',
    parameters: { ...planningJobParameters, language: { type: 'string', required: true, description: 'Target language.' } },
    output: objectOutput,
    async execute(args) {
      return {
        job: await context.notemdJobs.startTranslations({
          ...planningJobRequest(args),
          language: requiredString(args, 'language'),
        }),
      }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_wiki_links',
    description: 'Start a durable, plan-only batch that prepares wiki-link plans for explicit targets.',
    parameters: planningJobParameters,
    output: objectOutput,
    async execute(args) {
      return { job: await context.notemdJobs.startWikiLinkPlans(planningJobRequest(args)) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_title_generation',
    description: 'Start a durable, plan-only batch that prepares title-generation plans for explicit targets.',
    parameters: planningJobParameters,
    output: objectOutput,
    async execute(args) {
      return { job: await context.notemdJobs.startTitlePlans(planningJobRequest(args)) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_research_synthesis',
    description: 'Start a durable, plan-only batch that prepares research synthesis plans for explicit targets.',
    parameters: {
      ...planningJobParameters,
      sources: { type: 'array', required: true, description: 'Source passages to synthesize.', items: { type: 'string' } },
    },
    output: objectOutput,
    async execute(args) {
      return {
        job: await context.notemdJobs.startResearchSyntheses({
          ...planningJobRequest(args),
          sources: requiredStringList(args, 'sources'),
        }),
      }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_concept_extraction',
    description: 'Start a durable, plan-only batch that prepares concept extraction plans for explicit targets.',
    parameters: planningJobParameters,
    output: objectOutput,
    async execute(args) {
      return { job: await context.notemdJobs.startConceptExtractions(planningJobRequest(args)) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_resume',
    description: 'Explicitly resume one interrupted, durable NoteMD planning job.',
    parameters: jobIdParameters,
    output: objectOutput,
    async execute(args) {
      const jobId = requiredString(args, 'jobId')
      return { jobId, job: await context.notemdJobs.resume(jobId) }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_status',
    description: 'Read the durable status of a NoteMD background job.',
    parameters: jobIdParameters,
    output: objectOutput,
    async execute(args) {
      const jobId = requiredString(args, 'jobId')
      return { jobId, job: await context.notemdJobs.get(jobId) ?? null }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_cancel',
    description: 'Request cancellation for one durable NoteMD background job.',
    parameters: jobIdParameters,
    output: objectOutput,
    async execute(args) {
      const jobId = requiredString(args, 'jobId')
      return { jobId, job: await context.notemdJobs.cancel(jobId) }
    },
  }))
}

const planningJobParameters = {
  idempotencyKey: { type: 'string', required: true, description: 'Stable key for one durable planning request.' },
  targets: {
    type: 'array',
    required: true,
    description: 'Explicit workspace-relative Markdown paths to plan.',
    items: { type: 'string' },
  },
} as const

const jobIdParameters = {
  jobId: { type: 'string', required: true, description: 'Durable NoteMD job identifier.' },
} as const

function planningJobRequest(args: unknown): { idempotencyKey: string; targets: readonly string[] } {
  const targets = requiredStringList(args, 'targets')
  if (targets.length === 0 || targets.some((target) => target.trim().length === 0)) {
    throw new RangeError('Planning jobs require at least one non-empty target.')
  }
  return { idempotencyKey: requiredString(args, 'idempotencyKey'), targets }
}
