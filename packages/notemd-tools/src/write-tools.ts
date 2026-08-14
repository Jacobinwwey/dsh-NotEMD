import type { WritePlan, WriteResult } from '@notemd-harness/vault'

import type { NotemdToolContext } from './notemd-services.js'
import { diagnostic, objectOutput, requiredString, type ToolDefinitionFactory } from './tool-contract.js'
import { writePlanFrom } from './write-plan.js'

export function registerWriteTools(context: NotemdToolContext, defineTool: ToolDefinitionFactory): void {
  context.tools.register(defineTool({
    name: 'notemd_request_plan_approval',
    description: 'Ask the user to approve exactly one immutable NoteMD write plan and issue a one-time receipt on approval.',
    parameters: { plan: writePlanParameter },
    output: objectOutput,
    async execute(args, execution) {
      const plan = writePlanFrom(args)
      const approved = await context.notemdApprovalGate.request(plan, execution)
      if (!approved) {
        return { approved: false }
      }

      const receipt = await context.notemdApprovalLedger.issue(plan)
      return { approved: true, ...receipt }
    },
  }))

  context.tools.register(defineTool({
    name: 'notemd_apply_approved_plan',
    description: 'Apply one approved immutable NoteMD write plan exactly once; every file receives an explicit status.',
    parameters: {
      plan: writePlanParameter,
      approvalId: { type: 'string', required: true, description: 'One-time approval receipt identifier.' },
    },
    output: objectOutput,
    async execute(args, execution) {
      const plan = writePlanFrom(args)
      const approvalId = requiredString(args, 'approvalId')
      let authorized: boolean
      try {
        authorized = await context.notemdApprovalLedger.consume(plan, approvalId)
      } catch (error) {
        return rejectedPlan(plan, `Approval receipt could not be consumed: ${diagnostic(error)}`)
      }
      if (!authorized) {
        return rejectedPlan(plan, 'Approval receipt is unknown, expired, consumed, or does not match this plan.')
      }

      return {
        planId: plan.id,
        digest: plan.digest,
        results: await context.notemdVault.apply(plan, execution?.signal),
      }
    },
  }))
}

const writePlanParameter = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    id: { type: 'string', required: true },
    digest: { type: 'string', required: true },
    writes: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          path: { type: 'string', required: true },
          content: { type: 'string', required: true },
          expectedRevision: { type: 'string', required: true },
        },
      },
    },
  },
} as const

function rejectedPlan(plan: WritePlan, reason: string): {
  planId: string
  digest: string
  results: readonly WriteResult[]
} {
  return {
    planId: plan.id,
    digest: plan.digest,
    results: plan.writes.map((write) => ({ path: write.path, status: 'rejected', diagnostic: reason })),
  }
}
