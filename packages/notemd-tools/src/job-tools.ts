import type { NotemdToolContext } from './notemd-services.js'
import { objectOutput, requiredString, type ToolDefinitionFactory } from './tool-contract.js'

export function registerJobTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_job_status',
    description: 'Read the durable status of a NoteMD background job.',
    parameters: {
      jobId: { type: 'string', required: true, description: 'Durable NoteMD job identifier.' },
    },
    output: objectOutput,
    async execute(args) {
      const jobId = requiredString(args, 'jobId')
      return { jobId, job: await context.notemdJobs.get(jobId) ?? null }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_job_cancel',
    description: 'Request cancellation for one durable NoteMD background job.',
    parameters: {
      jobId: { type: 'string', required: true, description: 'Durable NoteMD job identifier.' },
    },
    output: objectOutput,
    async execute(args) {
      const jobId = requiredString(args, 'jobId')
      return { jobId, job: await context.notemdJobs.cancel(jobId) }
    },
  }))
}
