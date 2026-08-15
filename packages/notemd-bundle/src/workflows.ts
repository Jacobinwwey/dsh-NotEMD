import { Service, type Context } from '@deepseek-ai/cordis'
import { NotemdWorkflowPlanner, type WorkflowPlanner } from '@notemd-harness/workflows'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { ResearchEvidence } from '@notemd-harness/research'

export class NotemdWorkflowsService extends Service implements WorkflowPlanner {
  static inject = ['notemdVault', 'notemdTextTransformer'] as const

  private planner: NotemdWorkflowPlanner | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdWorkflows')
  }

  protected async [Service.init](): Promise<void> {
    this.planner = new NotemdWorkflowPlanner(this.ctx.notemdVault, this.ctx.notemdTextTransformer)
  }

  planWikiLinks(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planWikiLinks(path, signal)
  }

  planTranslation(path: string, language: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planTranslation(path, language, signal)
  }

  planTitleGeneration(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planTitleGeneration(path, signal)
  }

  planResearchSynthesis(path: string, evidence: readonly ResearchEvidence[], signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planResearchSynthesis(path, evidence, signal)
  }

  planConceptExtraction(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planConceptExtraction(path, signal)
  }

  planMermaidRepair(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planMermaidRepair(path, signal)
  }

  planFormulaRepair(path: string): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planFormulaRepair(path)
  }

  private requirePlanner(): NotemdWorkflowPlanner {
    if (this.planner === undefined) {
      throw new Error('NoteMD workflow service is not initialized.')
    }
    return this.planner
  }
}

export default NotemdWorkflowsService
