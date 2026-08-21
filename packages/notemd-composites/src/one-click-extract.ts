import {
  createContentSha256,
  type ContentSha256,
  type MutationProvenanceDraft,
  type WorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import type { NotemdVault } from '@notemd-harness/vault'
import type { BeforeWorkflowCompletion, WorkflowPlanner } from '@notemd-harness/workflows'

import { CompositeWorkflowError } from './diagnostics.js'
import { normalizeCompositePath, CompositeWorkspaceView } from './workspace-overlay.js'

export type CompositeWorkflowId = 'one-click-extract'
export type CompositeStepId = 'add-links' | 'generate-complete' | 'repair-mermaid'

export interface OneClickExtractRequest {
  readonly sourcePath: string
  readonly conceptFolderPath: string
  readonly completedFolderPath: string
  readonly mermaidFolderPath: string
  readonly mermaidErrorFolderPath?: string
  readonly idempotencyKey?: string
}

export interface CompositeStepDefinition {
  readonly id: CompositeStepId
  readonly operationId:
    | 'file.process-add-links'
    | 'content.batch-generate-from-titles'
    | 'mermaid.batch-fix'
  readonly ordinal: number
}

export interface CompositeWorkflowDefinition {
  readonly id: CompositeWorkflowId
  readonly version: 1
  readonly definitionDigest: ContentSha256
  readonly failurePolicy: 'fail-fast'
  readonly steps: readonly CompositeStepDefinition[]
}

export interface CompositeMutationLineage {
  readonly workflowId: CompositeWorkflowId
  readonly workflowVersion: 1
  readonly definitionDigest: ContentSha256
  readonly stepId: CompositeStepId
  readonly ordinal: number
}

export interface OneClickExtractDependencies {
  readonly vault: NotemdVault
  readonly createPlanner: (vault: NotemdVault, beforeCompletion: BeforeWorkflowCompletion) => WorkflowPlanner
}

const DEFINITION_BODY = {
  id: 'one-click-extract' as const,
  version: 1 as const,
  failurePolicy: 'fail-fast' as const,
  steps: [
    { id: 'add-links' as const, operationId: 'file.process-add-links' as const, ordinal: 0 },
    { id: 'generate-complete' as const, operationId: 'content.batch-generate-from-titles' as const, ordinal: 1 },
    { id: 'repair-mermaid' as const, operationId: 'mermaid.batch-fix' as const, ordinal: 2 },
  ],
}

export function createOneClickExtractDefinition(): CompositeWorkflowDefinition {
  const definitionDigest = createContentSha256(JSON.stringify(DEFINITION_BODY))
  return Object.freeze({
    ...DEFINITION_BODY,
    steps: Object.freeze(DEFINITION_BODY.steps.map((step) => Object.freeze({ ...step }))),
    definitionDigest,
  })
}

export async function planOneClickExtract(
  request: OneClickExtractRequest,
  dependencies: OneClickExtractDependencies,
  signal?: AbortSignal,
): Promise<WorkspaceMutationPlan> {
  const definition = createOneClickExtractDefinition()
  const sourcePath = normalizeCompositePath(request.sourcePath)
  const conceptFolderPath = normalizeCompositePath(request.conceptFolderPath)
  const completedFolderPath = normalizeCompositePath(request.completedFolderPath)
  const mermaidFolderPath = normalizeCompositePath(request.mermaidFolderPath)
  const mermaidErrorFolderPath = request.mermaidErrorFolderPath === undefined
    ? undefined
    : normalizeCompositePath(request.mermaidErrorFolderPath)
  const provenance: MutationProvenanceDraft = {
    operationId: 'workflow.one-click-extract',
    sourceRefs: [sourcePath],
    evidenceRefs: [],
  }
  const overlay = new CompositeWorkspaceView(dependencies.vault, { provenance })
  const planner = dependencies.createPlanner(overlay, ({ system, prompt }) => {
    overlay.assertCompletionInputBudget(`${system}\n\n${prompt}`)
  })

  await runStep('add-links', 0, async () => {
    const plan = await planner.planWikiLinks(sourcePath, signal)
    await overlay.applyPlannedPlan(plan, lineage(definition, 'add-links', 0))
  }, signal)

  await runStep('generate-complete', 1, async () => {
    const plan = await planner.planBatchTitleGeneration(conceptFolderPath, completedFolderPath, signal)
    if (plan !== undefined) {
      await overlay.applyPlannedPlan(plan, lineage(definition, 'generate-complete', 1))
    }
  }, signal)

  await runStep('repair-mermaid', 2, async () => {
    const plan = await planner.planBatchMermaidRepair(mermaidFolderPath, mermaidErrorFolderPath, signal)
    if (plan !== undefined) {
      await overlay.applyPlannedPlan(plan, lineage(definition, 'repair-mermaid', 2))
    }
  }, signal)

  return overlay.finalize()
}

function lineage(
  definition: CompositeWorkflowDefinition,
  stepId: CompositeStepId,
  ordinal: number,
): CompositeMutationLineage {
  return {
    workflowId: definition.id,
    workflowVersion: definition.version,
    definitionDigest: definition.definitionDigest,
    stepId,
    ordinal,
  }
}

async function runStep(
  _stepId: CompositeStepId,
  _ordinal: number,
  action: () => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    throw new CompositeWorkflowError(
      'composite-cancelled',
      'Composite workflow was cancelled before the next step.',
    )
  }
  await action()
  if (signal?.aborted) {
    throw new CompositeWorkflowError(
      'composite-cancelled',
      'Composite workflow was cancelled after the step completed.',
    )
  }
}
