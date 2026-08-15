import type { NotemdArtifacts } from '@notemd-harness/artifacts'
import type { ModelDiscoveryResult, ProviderDiagnosticResult } from '@notemd-harness/llm-openai-compatible'
import type { NotemdVault, WritePlan, WriteResult } from '@notemd-harness/vault'
import type { WorkspaceChangeEvent } from '@notemd-harness/workspace-events'
import type { WorkflowPlanner } from '@notemd-harness/workflows'

import type { ApprovalLedger } from './approval-ledger.js'
import type { ToolExecutionContext, ToolRegistrationSpec } from './tool-contract.js'

export interface NotemdToolRegistry {
  register(tool: ToolRegistrationSpec): unknown
}

export interface NotemdJobs {
  startFormulaRepairs(request: FormulaRepairJobRequest): Promise<unknown>
  startMermaidRepairs(request: MermaidRepairJobRequest): Promise<unknown>
  startTranslations(request: TranslationJobRequest): Promise<unknown>
  startWikiLinkPlans(request: WikiLinkJobRequest): Promise<unknown>
  startTitlePlans(request: TitleJobRequest): Promise<unknown>
  startResearchSyntheses(request: ResearchJobRequest): Promise<unknown>
  startConceptExtractions(request: ConceptJobRequest): Promise<unknown>
  resume(id: string): Promise<unknown>
  get(id: string): Promise<unknown | undefined>
  cancel(id: string): Promise<unknown>
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
  readonly sources: readonly string[]
}

interface PlanningJobRequest {
  readonly idempotencyKey: string
  readonly targets: readonly string[]
}

export interface NotemdKnowledge {
  search(query: string): Promise<unknown>
}

export interface NotemdWorkspaceChanges {
  recordApprovedPlan(plan: WritePlan, results: readonly WriteResult[]): Promise<WorkspaceChangeEvent | undefined>
}

export interface NotemdProviderDiagnostics {
  diagnoseProvider(signal?: AbortSignal): Promise<ProviderDiagnosticResult>
  discoverModels(signal?: AbortSignal): Promise<ModelDiscoveryResult>
}

export interface NotemdApprovalGate {
  request(plan: WritePlan, execution?: ToolExecutionContext): Promise<boolean>
}

export interface NotemdToolContext {
  readonly tools: NotemdToolRegistry
  readonly notemdVault: NotemdVault
  readonly notemdJobs: NotemdJobs
  readonly notemdWorkspaceChanges: NotemdWorkspaceChanges
  readonly notemdKnowledge?: NotemdKnowledge
  readonly notemdTextTransformer: NotemdProviderDiagnostics
  readonly notemdWorkflows: WorkflowPlanner
  readonly notemdArtifacts: NotemdArtifacts
  readonly notemdApprovalLedger: ApprovalLedger
  readonly notemdApprovalGate: NotemdApprovalGate
}
