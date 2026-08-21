import { Service, type Context } from '@deepseek-ai/cordis'
import {
  createOneClickExtractDefinition,
  planOneClickExtract,
  type CompositeWorkflowDefinition,
  type OneClickExtractRequest,
} from '@notemd-harness/composites'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { ScopedWorkflowPlannerFactory } from '@notemd-harness/workflows'

export class NotemdCompositeWorkflowService extends Service {
  static inject = ['notemdVault', 'notemdWorkflows'] as const

  constructor(ctx: Context) {
    super(ctx, 'notemdCompositeWorkflows')
  }

  definition(): CompositeWorkflowDefinition {
    return createOneClickExtractDefinition()
  }

  planOneClickExtract(
    request: OneClickExtractRequest,
    signal?: AbortSignal,
  ): Promise<WorkspaceMutationPlan> {
    const workflowFactory = this.ctx.notemdWorkflows as unknown as ScopedWorkflowPlannerFactory
    return planOneClickExtract(request, {
      vault: this.ctx.notemdVault,
      createPlanner: (vault, beforeCompletion) => workflowFactory.createScopedPlanner(vault, beforeCompletion),
    }, signal)
  }
}

export default NotemdCompositeWorkflowService
