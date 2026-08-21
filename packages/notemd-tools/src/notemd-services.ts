import type { NotemdArtifacts } from '@notemd-harness/artifacts'
import type { JobRecord } from '@notemd-harness/jobs'
import type { KnowledgeMatch, KnowledgeRetrievalRequest, KnowledgeRetrievalResult } from '@notemd-harness/knowledge'
import type { ModelDiscoveryResult, ProviderDiagnosticResult } from '@notemd-harness/llm-openai-compatible'
import type {
  RecoveredMutation,
  WorkspaceMutationPlan,
  WorkspaceMutationReceipt,
} from '@notemd-harness/mutation'
import type { NotemdResearch } from '@notemd-harness/research'
import type { NotemdVault } from '@notemd-harness/vault'
import type { WorkspaceChangeEvent } from '@notemd-harness/workspace-events'
import type {
  CompositeWorkflowDefinition,
  OneClickExtractRequest,
} from '@notemd-harness/composites'
import type { TextTransformer, WorkflowPlanner } from '@notemd-harness/workflows'

import type { ApprovalLedger } from './approval-ledger.js'
import type { ToolExecutionContext, ToolRegistrationSpec } from './tool-contract.js'

export interface NotemdToolRegistry {
  register(tool: ToolRegistrationSpec): unknown
}

export interface NotemdJobs {
  startFormulaRepairs(request: FormulaRepairJobRequest): Promise<JobRecord>
  startMermaidRepairs(request: MermaidRepairJobRequest): Promise<JobRecord>
  startTranslations(request: TranslationJobRequest): Promise<JobRecord>
  startWikiLinkPlans(request: WikiLinkJobRequest): Promise<JobRecord>
  startTitlePlans(request: TitleJobRequest): Promise<JobRecord>
  startResearchSyntheses(request: ResearchJobRequest): Promise<JobRecord>
  startConceptExtractions(request: ConceptJobRequest): Promise<JobRecord>
  startOneClickExtract(request: OneClickExtractJobRequest): Promise<JobRecord>
  resume(id: string): Promise<JobRecord>
  get(id: string): Promise<JobRecord | undefined>
  cancel(id: string): Promise<JobRecord>
}

export type FormulaRepairJobRequest = PlanningJobRequest
export type MermaidRepairJobRequest = PlanningJobRequest
export type WikiLinkJobRequest = PlanningJobRequest
export type TitleJobRequest = PlanningJobRequest
export type ConceptJobRequest = PlanningJobRequest

export interface TranslationJobRequest extends PlanningJobRequest {
  readonly language: string
}

export interface ResearchJobRequest extends PlanningJobRequest {
  readonly evidenceIds: readonly string[]
}

export interface OneClickExtractJobRequest extends OneClickExtractRequest {
  readonly idempotencyKey: string
}

export interface NotemdCompositeWorkflows {
  definition(): CompositeWorkflowDefinition
  planOneClickExtract(request: OneClickExtractRequest, signal?: AbortSignal): Promise<WorkspaceMutationPlan>
}

interface PlanningJobRequest {
  readonly idempotencyKey: string
  readonly targets: readonly string[]
}

export interface NotemdKnowledge {
  search(query: string): Promise<readonly KnowledgeMatch[]>
  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult>
}

export interface NotemdMutationVault extends NotemdVault {
  applyMutationPlan(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt>
  recoverIncompleteMutationPlans(signal?: AbortSignal): Promise<readonly RecoveredMutation[]>
}

export interface NotemdWorkspaceChanges {
  recordMutationReceipt(
    plan: WorkspaceMutationPlan,
    receipt: WorkspaceMutationReceipt,
  ): Promise<WorkspaceChangeEvent | undefined>
}

export interface NotemdProviderDiagnostics {
  diagnoseProvider(signal?: AbortSignal): Promise<ProviderDiagnosticResult>
  discoverModels(signal?: AbortSignal): Promise<ModelDiscoveryResult>
}

export type ApprovalDecision = 'approved' | 'rejected' | 'unavailable' | 'cancelled'

export interface NotemdApprovalGate {
  request(plan: WorkspaceMutationPlan, execution?: ToolExecutionContext): Promise<ApprovalDecision>
}

export interface NotemdToolContext {
  readonly tools: NotemdToolRegistry
  readonly notemdVault: NotemdMutationVault
  readonly notemdJobs: NotemdJobs
  readonly notemdWorkspaceChanges: NotemdWorkspaceChanges
  readonly notemdKnowledge?: NotemdKnowledge
  readonly notemdTextTransformer: TextTransformer
  readonly notemdWorkflows: WorkflowPlanner
  readonly notemdCompositeWorkflows: NotemdCompositeWorkflows
  readonly notemdResearch: NotemdResearch
  readonly notemdArtifacts: NotemdArtifacts
  readonly notemdApprovalLedger: ApprovalLedger
  readonly notemdApprovalGate: NotemdApprovalGate
}
