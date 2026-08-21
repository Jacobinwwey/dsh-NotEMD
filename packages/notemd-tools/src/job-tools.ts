import type { JobRecord } from '@notemd-harness/jobs'

import type { NotemdToolContext, OneClickExtractJobRequest } from './notemd-services.js'
import {
  executeTool,
  isRecord,
  jobRecordSchema,
  nullSchema,
  outcomeOutput,
  requiredString,
  requiredStringList,
  ToolInputError,
  type ToolDefinitionFactory,
} from './tool-contract.js'

export function registerJobTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_job_start_formula_repair',
    description: 'Start a durable, plan-only batch that prepares formula repair plans for explicit targets.',
    parameters: planningJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({ job: jobView(await context.notemdJobs.startFormulaRepairs(planningJobRequest(args))) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_mermaid_repair',
    description: 'Start a durable, plan-only batch that prepares Mermaid repair plans for explicit targets.',
    parameters: planningJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({ job: jobView(await context.notemdJobs.startMermaidRepairs(planningJobRequest(args))) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_translation',
    description: 'Start a durable, plan-only batch that prepares translations for explicit targets and one language.',
    parameters: { ...planningJobParameters, language: { type: 'string', required: true, description: 'Target language.' } },
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({
        job: jobView(await context.notemdJobs.startTranslations({
          ...planningJobRequest(args),
          language: requiredString(args, 'language'),
        })),
      }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_wiki_links',
    description: 'Start a durable, plan-only batch that prepares wiki-link plans for explicit targets.',
    parameters: planningJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({ job: jobView(await context.notemdJobs.startWikiLinkPlans(planningJobRequest(args))) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_title_generation',
    description: 'Start a durable, plan-only batch that prepares title-generation plans for explicit targets.',
    parameters: planningJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({ job: jobView(await context.notemdJobs.startTitlePlans(planningJobRequest(args))) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_research_synthesis',
    description: 'Start a durable, plan-only batch that prepares research synthesis plans from durable evidence identifiers.',
    parameters: {
      ...planningJobParameters,
      evidenceIds: { type: 'array', required: true, description: 'Durable research evidence identifiers to synthesize.', items: { type: 'string' } },
    },
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({
        job: jobView(await context.notemdJobs.startResearchSyntheses({
          ...planningJobRequest(args),
          evidenceIds: requiredStringList(args, 'evidenceIds'),
        })),
      }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_concept_extraction',
    description: 'Start a durable, plan-only batch that prepares concept extraction plans for explicit targets.',
    parameters: planningJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({ job: jobView(await context.notemdJobs.startConceptExtractions(planningJobRequest(args))) }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_start_one_click_extract',
    description: 'Start one durable, fail-fast planning job for the named One-Click Extract workflow.',
    parameters: oneClickExtractJobParameters,
    output: jobOutput,
    async execute(args) {
      return executeTool(async () => ({
        job: jobView(await context.notemdJobs.startOneClickExtract(parseOneClickExtractJobRequest(args))),
      }))
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_resume',
    description: 'Explicitly resume one interrupted, durable NoteMD planning job.',
    parameters: jobIdParameters,
    output: outcomeOutput({ jobId: { type: 'string' }, job: jobRecordSchema }, ['jobId', 'job']),
    async execute(args) {
      return executeTool(async () => {
        const jobId = requiredString(args, 'jobId')
        return { jobId, job: jobView(await context.notemdJobs.resume(jobId)) }
      })
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_status',
    description: 'Read the durable status of a NoteMD background job.',
    parameters: jobIdParameters,
    output: outcomeOutput({ jobId: { type: 'string' }, job: { oneOf: [jobRecordSchema, nullSchema()] } }, ['jobId', 'job']),
    async execute(args) {
      return executeTool(async () => {
        const jobId = requiredString(args, 'jobId')
        const job = await context.notemdJobs.get(jobId)
        return { jobId, job: job === undefined ? null : jobView(job) }
      })
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_cancel',
    description: 'Request cancellation for one durable NoteMD background job.',
    parameters: jobIdParameters,
    output: outcomeOutput({ jobId: { type: 'string' }, job: jobRecordSchema }, ['jobId', 'job']),
    async execute(args) {
      return executeTool(async () => {
        const jobId = requiredString(args, 'jobId')
        return { jobId, job: jobView(await context.notemdJobs.cancel(jobId)) }
      })
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

const jobOutput = outcomeOutput({ job: jobRecordSchema }, ['job'])

const oneClickExtractJobParameters = {
  idempotencyKey: { type: 'string', required: true, description: 'Stable durable job idempotency key.' },
  sourcePath: { type: 'string', required: true, description: 'Workspace-relative source Markdown path.' },
  conceptFolderPath: { type: 'string', required: true, description: 'Workspace-relative title-source folder.' },
  completedFolderPath: { type: 'string', required: true, description: 'Workspace-relative generated-note folder.' },
  mermaidFolderPath: { type: 'string', required: true, description: 'Workspace-relative Mermaid repair folder.' },
  mermaidErrorFolderPath: { type: 'string', description: 'Optional unresolved-Mermaid output folder.' },
} as const

function planningJobRequest(args: unknown): { idempotencyKey: string; targets: readonly string[] } {
  const targets = requiredStringList(args, 'targets')
  if (targets.length === 0 || targets.some((target) => target.trim().length === 0)) {
    throw new RangeError('Planning jobs require at least one non-empty target.')
  }
  return { idempotencyKey: requiredString(args, 'idempotencyKey'), targets }
}

function parseOneClickExtractJobRequest(args: unknown): OneClickExtractJobRequest {
  if (!isRecord(args)) {
    throw new ToolInputError('Composite job arguments must be an object.')
  }
  const allowed = new Set([
    'idempotencyKey',
    'sourcePath',
    'conceptFolderPath',
    'completedFolderPath',
    'mermaidFolderPath',
    'mermaidErrorFolderPath',
  ])
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      throw new ToolInputError('Unknown One-Click Extract job parameter: ' + key)
    }
  }
  const errorFolder = args.mermaidErrorFolderPath
  if (errorFolder !== undefined && (typeof errorFolder !== 'string' || errorFolder.trim().length === 0)) {
    throw new ToolInputError('mermaidErrorFolderPath must be non-empty text when provided.')
  }
  return {
    idempotencyKey: requiredString(args, 'idempotencyKey'),
    sourcePath: requiredString(args, 'sourcePath'),
    conceptFolderPath: requiredString(args, 'conceptFolderPath'),
    completedFolderPath: requiredString(args, 'completedFolderPath'),
    mermaidFolderPath: requiredString(args, 'mermaidFolderPath'),
    ...(errorFolder === undefined ? {} : { mermaidErrorFolderPath: errorFolder }),
  }
}

function jobView(job: JobRecord) {
  return {
    id: job.id,
    workflow: job.workflow,
    state: job.state,
    targets: job.targets,
    attempt: job.attempt,
    results: job.results,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  }
}
