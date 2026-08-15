import { Service, type Context } from '@deepseek-ai/cordis'
import { FileApprovalLedger, type ApprovalLedger } from '@notemd-harness/tools'
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'

import { DshApprovalGate } from './runtime-adapter.js'
import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

export interface NotemdApprovalConfig extends WorkspaceRootConfig {
  readonly approvalTtlMs: number
}

export class NotemdApprovalLedgerService extends Service implements ApprovalLedger {
  private ledger: FileApprovalLedger | undefined
  private readonly workspaceRoot: string
  private readonly approvalTtlMs: number

  constructor(ctx: Context, config: NotemdApprovalConfig) {
    super(ctx, 'notemdApprovalLedger')
    this.workspaceRoot = workspaceRootFrom(config)
    if (!Number.isSafeInteger(config.approvalTtlMs) || config.approvalTtlMs < 1) {
      throw new RangeError('NoteMD approvalTtlMs must be a positive integer.')
    }
    this.approvalTtlMs = config.approvalTtlMs
  }

  protected async [Service.init](): Promise<void> {
    this.ledger = await FileApprovalLedger.open(this.workspaceRoot, { ttlMs: this.approvalTtlMs })
  }

  issue(plan: WorkspaceMutationPlan) {
    return this.requireLedger().issue(plan)
  }

  consume(plan: WorkspaceMutationPlan, approvalId: string) {
    return this.requireLedger().consume(plan, approvalId)
  }

  private requireLedger(): FileApprovalLedger {
    if (this.ledger === undefined) {
      throw new Error('NoteMD approval ledger service is not initialized.')
    }
    return this.ledger
  }
}

export class NotemdApprovalGateService extends Service {
  static inject = ['approval'] as const

  private readonly gate: DshApprovalGate

  constructor(ctx: Context) {
    super(ctx, 'notemdApprovalGate')
    this.gate = new DshApprovalGate(
      ctx.approval === undefined ? {} : { approval: ctx.approval },
    )
  }

  request(...args: Parameters<DshApprovalGate['request']>): ReturnType<DshApprovalGate['request']> {
    return this.gate.request(...args)
  }
}

export const name = 'notemd-approval'

export function apply(ctx: Context, config: NotemdApprovalConfig): void {
  ctx.plugin(NotemdApprovalLedgerService, config)
  ctx.plugin(NotemdApprovalGateService)
}
