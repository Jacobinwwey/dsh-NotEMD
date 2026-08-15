import type { WorkspaceMutationPlan, WorkspaceMutationReceipt } from '@notemd-harness/mutation'

import type { ApprovalDecision, NotemdToolContext } from './notemd-services.js'
import { mutationPlanFrom } from './mutation-plan.js'
import {
  arraySchema,
  executeTool,
  integerSchema,
  outcomeOutput,
  requiredString,
  stringSchema,
  type ToolDefinitionFactory,
  type ToolOutcomeStatus,
  workspaceChangeEventSchema,
  workspaceMutationPlanSchema,
  workspaceMutationReceiptSchema,
} from './tool-contract.js'

const mutationPlanParameter = {
  ...workspaceMutationPlanSchema,
  required: true,
} as const

const planIdentityProperties = {
  planId: stringSchema(),
  digest: stringSchema(),
} as const

const approvalOutput = outcomeOutput(
  {
    ...planIdentityProperties,
    approvalId: stringSchema(),
    assetDigests: arraySchema(stringSchema()),
    expiresAt: integerSchema(),
  },
  ['planId', 'digest', 'approvalId', 'assetDigests', 'expiresAt'],
  [
    approvalDecisionVariant('rejected', 'approval-rejected'),
    approvalDecisionVariant('unavailable', 'approval-unavailable'),
    approvalDecisionVariant('cancelled', 'approval-cancelled'),
  ],
)

const receiptProperties = {
  ...planIdentityProperties,
  receipt: workspaceMutationReceiptSchema,
} as const

const mutationApplicationOutput = outcomeOutput(
  {
    ...receiptProperties,
    change: workspaceChangeEventSchema,
  },
  ['planId', 'digest', 'receipt'],
  [
    receiptVariant('conflict'),
    receiptVariant('rejected'),
    receiptVariant('cancelled'),
    receiptVariant('failed'),
  ],
)

const approvalDecisionOutcomes = {
  rejected: { status: 'rejected', code: 'approval-rejected' },
  unavailable: { status: 'unavailable', code: 'approval-unavailable' },
  cancelled: { status: 'cancelled', code: 'approval-cancelled' },
} as const

const receiptOutcomeStatuses: Record<WorkspaceMutationReceipt['status'], Exclude<ToolOutcomeStatus, 'success'>> = {
  committed: 'failed',
  conflict: 'conflict',
  rejected: 'rejected',
  cancelled: 'cancelled',
  failed: 'failed',
  recovered: 'failed',
}

const receiptOutcomeCodes: Record<WorkspaceMutationReceipt['status'], string> = {
  committed: 'workspace-change-rejected',
  conflict: 'mutation-conflict',
  rejected: 'mutation-rejected',
  cancelled: 'mutation-cancelled',
  failed: 'mutation-failed',
  recovered: 'mutation-recovered',
}

export function registerWriteTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_request_plan_approval',
    description: 'Request one-time approval for exactly one immutable NoteMD workspace mutation proposal.',
    parameters: { plan: mutationPlanParameter },
    output: approvalOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const plan = mutationPlanFrom(args)
        const decision = await context.notemdApprovalGate.request(plan, execution)
        if (decision !== 'approved') {
          return approvalDecisionOutcome(plan, decision)
        }

        const receipt = await context.notemdApprovalLedger.issue(plan)
        return {
          planId: receipt.planId,
          digest: receipt.digest,
          approvalId: receipt.approvalId,
          assetDigests: receipt.assetDigests,
          expiresAt: receipt.expiresAt,
        }
      })
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_apply_approved_plan',
    description: 'Apply one approved immutable NoteMD workspace mutation proposal exactly once and publish only its verified receipt.',
    parameters: {
      plan: mutationPlanParameter,
      approvalId: { type: 'string', required: true, description: 'One-time approval receipt identifier.' },
    },
    output: mutationApplicationOutput,
    async execute(args, execution) {
      return executeTool(async () => {
        const plan = mutationPlanFrom(args)
        const approvalId = requiredString(args, 'approvalId')
        const authorized = await context.notemdApprovalLedger.consume(plan, approvalId)
        if (!authorized) {
          return {
            status: 'rejected' as const,
            code: 'approval-receipt-invalid',
            planId: plan.id,
            digest: plan.digest,
          }
        }

        const receipt = await context.notemdVault.applyMutationPlan(plan, execution?.signal)
        if (receipt.planId !== plan.id || receipt.planDigest !== plan.digest) {
          return mutationReceiptOutcome(plan, receipt, 'mutation-receipt-mismatch')
        }
        if (receipt.status !== 'committed') {
          return mutationReceiptOutcome(plan, receipt)
        }

        try {
          const change = await context.notemdWorkspaceChanges.recordMutationReceipt(plan, receipt)
          if (change === undefined) {
            return mutationReceiptOutcome(plan, receipt)
          }
          return {
            planId: plan.id,
            digest: plan.digest,
            receipt,
            change,
          }
        } catch {
          return mutationReceiptOutcome(plan, receipt, 'workspace-change-record-failed')
        }
      })
    },
  }))
}

function approvalDecisionVariant(
  status: 'rejected' | 'unavailable' | 'cancelled',
  code: string,
) {
  return {
    status,
    properties: { code: { type: 'string', const: code }, ...planIdentityProperties },
    required: ['code', 'planId', 'digest'],
  } as const
}

function receiptVariant(status: 'conflict' | 'rejected' | 'cancelled' | 'failed') {
  return {
    status,
    properties: { code: stringSchema(), ...receiptProperties },
    required: ['code', 'planId', 'digest', 'receipt'],
  } as const
}

function approvalDecisionOutcome(
  plan: WorkspaceMutationPlan,
  decision: Exclude<ApprovalDecision, 'approved'>,
) {
  return {
    ...approvalDecisionOutcomes[decision],
    planId: plan.id,
    digest: plan.digest,
  }
}

function mutationReceiptOutcome(
  plan: WorkspaceMutationPlan,
  receipt: WorkspaceMutationReceipt,
  code = receiptOutcomeCodes[receipt.status],
) {
  return {
    status: receiptOutcomeStatuses[receipt.status],
    code,
    planId: plan.id,
    digest: plan.digest,
    receipt,
  }
}
