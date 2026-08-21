import { Service, type Context } from '@deepseek-ai/cordis'
import {
  NotemdWorkflowPlanner,
  type BeforeWorkflowCompletion,
  type ScopedWorkflowPlannerFactory,
  type WorkflowPlanner,
} from '@notemd-harness/workflows'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { ResearchEvidence } from '@notemd-harness/research'
import type { NotemdVault } from '@notemd-harness/vault'

export class NotemdWorkflowsService extends Service implements WorkflowPlanner, ScopedWorkflowPlannerFactory {
  static inject = ['notemdVault', 'notemdTextTransformer'] as const

  private planner: NotemdWorkflowPlanner | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdWorkflows')
  }

  protected async [Service.init](): Promise<void> {
    this.planner = new NotemdWorkflowPlanner(this.ctx.notemdVault, this.ctx.notemdTextTransformer)
  }

  createScopedPlanner(vault: NotemdVault, beforeCompletion?: BeforeWorkflowCompletion): WorkflowPlanner {
    return new NotemdWorkflowPlanner(vault, this.ctx.notemdTextTransformer, beforeCompletion)
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

  planChapterSplit(path: string, signal?: AbortSignal): Promise<WorkspaceMutationPlan> {
    return this.requirePlanner().planChapterSplit(path, signal)
  }

  planOriginalTextExtraction(
    ...args: Parameters<WorkflowPlanner['planOriginalTextExtraction']>
  ): ReturnType<WorkflowPlanner['planOriginalTextExtraction']> {
    return this.requirePlanner().planOriginalTextExtraction(...args)
  }

  planMergedOriginalTextExtraction(
    ...args: Parameters<WorkflowPlanner['planMergedOriginalTextExtraction']>
  ): ReturnType<WorkflowPlanner['planMergedOriginalTextExtraction']> {
    return this.requirePlanner().planMergedOriginalTextExtraction(...args)
  }

  planWikiLinksInFolder(folderPath: string, signal?: AbortSignal): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planWikiLinksInFolder(folderPath, signal)
  }

  planTitlesInFolder(folderPath: string, signal?: AbortSignal): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planTitlesInFolder(folderPath, signal)
  }

  planBatchTitleGeneration(
    sourceFolderPath: string,
    completedFolderPath: string,
    signal?: AbortSignal,
  ): ReturnType<WorkflowPlanner['planBatchTitleGeneration']> {
    return this.requirePlanner().planBatchTitleGeneration(sourceFolderPath, completedFolderPath, signal)
  }

  planTranslationsInFolder(
    folderPath: string,
    language: string,
    signal?: AbortSignal,
  ): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planTranslationsInFolder(folderPath, language, signal)
  }

  planConceptsInFolder(folderPath: string, signal?: AbortSignal): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planConceptsInFolder(folderPath, signal)
  }

  planMermaidRepairsInFolder(folderPath: string, signal?: AbortSignal): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planMermaidRepairsInFolder(folderPath, signal)
  }

  planBatchMermaidRepair(
    folderPath: string,
    errorFolderPath?: string,
    signal?: AbortSignal,
  ): ReturnType<WorkflowPlanner['planBatchMermaidRepair']> {
    return this.requirePlanner().planBatchMermaidRepair(folderPath, errorFolderPath, signal)
  }

  planFormulaRepairsInFolder(folderPath: string): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planFormulaRepairsInFolder(folderPath)
  }

  planChapterSplitsInFolder(folderPath: string, signal?: AbortSignal): Promise<readonly WorkspaceMutationPlan[]> {
    return this.requirePlanner().planChapterSplitsInFolder(folderPath, signal)
  }

  planOriginalTextExtractionsInFolder(
    ...args: Parameters<WorkflowPlanner['planOriginalTextExtractionsInFolder']>
  ): ReturnType<WorkflowPlanner['planOriginalTextExtractionsInFolder']> {
    return this.requirePlanner().planOriginalTextExtractionsInFolder(...args)
  }

  planMergedOriginalTextExtractionsInFolder(
    ...args: Parameters<WorkflowPlanner['planMergedOriginalTextExtractionsInFolder']>
  ): ReturnType<WorkflowPlanner['planMergedOriginalTextExtractionsInFolder']> {
    return this.requirePlanner().planMergedOriginalTextExtractionsInFolder(...args)
  }

  checkFileDuplicates(
    ...args: Parameters<WorkflowPlanner['checkFileDuplicates']>
  ): ReturnType<WorkflowPlanner['checkFileDuplicates']> {
    return this.requirePlanner().checkFileDuplicates(...args)
  }

  findConceptDuplicates(
    ...args: Parameters<WorkflowPlanner['findConceptDuplicates']>
  ): ReturnType<WorkflowPlanner['findConceptDuplicates']> {
    return this.requirePlanner().findConceptDuplicates(...args)
  }

  planConceptDedupe(
    ...args: Parameters<WorkflowPlanner['planConceptDedupe']>
  ): ReturnType<WorkflowPlanner['planConceptDedupe']> {
    return this.requirePlanner().planConceptDedupe(...args)
  }

  planExtractAndGenerate(
    ...args: Parameters<WorkflowPlanner['planExtractAndGenerate']>
  ): ReturnType<WorkflowPlanner['planExtractAndGenerate']> {
    return this.requirePlanner().planExtractAndGenerate(...args)
  }

  private requirePlanner(): NotemdWorkflowPlanner {
    if (this.planner === undefined) {
      throw new Error('NoteMD workflow service is not initialized.')
    }
    return this.planner
  }
}

export default NotemdWorkflowsService
