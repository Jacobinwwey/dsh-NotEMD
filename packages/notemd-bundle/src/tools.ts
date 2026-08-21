import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerNotemdTools, type NotemdToolContext, type ToolDefinitionFactory } from '@notemd-harness/tools'

export const name = 'notemd-tools'
export const inject = [
  'tools',
  'notemdVault',
  'notemdJobs',
  'notemdWorkspaceChanges',
  'notemdKnowledge',
  'notemdTextTransformer',
  'notemdWorkflows',
  'notemdCompositeWorkflows',
  'notemdResearch',
  'notemdArtifacts',
  'notemdApprovalLedger',
  'notemdApprovalGate',
] as const

export function apply(ctx: Context): void {
  registerNotemdTools(
    ctx as unknown as NotemdToolContext,
    defineTool as unknown as ToolDefinitionFactory,
  )
}
