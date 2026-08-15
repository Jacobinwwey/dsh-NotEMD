import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'

import type { ApprovalDecision, NotemdApprovalGate } from '@notemd-harness/tools'
import type { ToolExecutionContext } from '@notemd-harness/tools'

export interface DshApprovalRequest {
  readonly agent: unknown
  readonly toolName: string
  readonly callId?: unknown
  readonly reason?: string
  readonly signal?: AbortSignal
}

export interface DshApprovalService {
  request(request: DshApprovalRequest): Promise<unknown>
}

export interface DshApprovalContext {
  readonly approval?: DshApprovalService
}

export class DshApprovalGate implements NotemdApprovalGate {
  constructor(private readonly context: DshApprovalContext) {}

  async request(plan: WorkspaceMutationPlan, execution?: ToolExecutionContext): Promise<ApprovalDecision> {
    if (execution?.signal?.aborted) {
      return 'cancelled'
    }
    const agent = execution?.agent
    const approval = this.context.approval
    if (agent === undefined || approval === undefined) {
      return 'unavailable'
    }

    const request: DshApprovalRequest = {
      agent,
      toolName: 'notemd_request_plan_approval',
      reason: approvalReason(plan),
      ...(execution?.callId !== undefined ? { callId: execution.callId } : {}),
      ...(execution?.signal !== undefined ? { signal: execution.signal } : {}),
    }

    try {
      if (await approval.request(request) === 'allowed-once') {
        return execution?.signal?.aborted ? 'cancelled' : 'approved'
      }
      return 'rejected'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' || execution?.signal?.aborted
        ? 'cancelled'
        : 'unavailable'
    }
  }
}

function approvalReason(plan: WorkspaceMutationPlan): string {
  return `Approve NoteMD mutation proposal ${plan.id} with digest ${plan.digest} affecting ${plan.mutations.length} destination(s).`
}
