import type { NotemdArtifacts } from '@notemd-harness/artifacts'
import type { NotemdVault, WritePlan } from '@notemd-harness/vault'
import type { WorkflowPlanner } from '@notemd-harness/workflows'

import type { ApprovalLedger } from './approval-ledger.js'
import type { ToolExecutionContext, ToolRegistrationSpec } from './tool-contract.js'

export interface NotemdToolRegistry {
  register(tool: ToolRegistrationSpec): unknown
}

export interface NotemdJobs {
  get(id: string): Promise<unknown | undefined>
  cancel(id: string): Promise<unknown>
}

export interface NotemdKnowledge {
  search(query: string): Promise<unknown>
}

export interface NotemdApprovalGate {
  request(plan: WritePlan, execution?: ToolExecutionContext): Promise<boolean>
}

export interface NotemdToolContext {
  readonly tools: NotemdToolRegistry
  readonly notemdVault: NotemdVault
  readonly notemdJobs: NotemdJobs
  readonly notemdKnowledge?: NotemdKnowledge
  readonly notemdWorkflows: WorkflowPlanner
  readonly notemdArtifacts: NotemdArtifacts
  readonly notemdApprovalLedger: ApprovalLedger
  readonly notemdApprovalGate: NotemdApprovalGate
}
