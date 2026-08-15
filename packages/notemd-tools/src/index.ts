import type { NotemdToolContext } from './notemd-services.js'
import type { ToolDefinitionFactory } from './tool-contract.js'

import { registerArtifactTools } from './artifact-tools.js'
import { registerJobTools } from './job-tools.js'
import { registerPlanTools } from './plan-tools.js'
import { registerProviderTools } from './provider-tools.js'
import { registerReadTools } from './read-tools.js'
import { registerResearchTools } from './research-tools.js'
import { registerWriteTools } from './write-tools.js'

export * from './approval-ledger.js'
export * from './notemd-services.js'
export * from './tool-contract.js'
export * from './mutation-plan.js'

export function registerNotemdTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  registerReadTools(context, defineTool)
  registerPlanTools(context, defineTool)
  registerResearchTools(context, defineTool)
  registerProviderTools(context, defineTool)
  registerWriteTools(context, defineTool)
  registerArtifactTools(context, defineTool)
  registerJobTools(context, defineTool)
}
