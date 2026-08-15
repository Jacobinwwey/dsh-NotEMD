import { Service, type Context } from '@deepseek-ai/cordis'
import {
  WorkspaceChangeCoordinator,
  type WorkspaceChangeEvent,
  type WorkspaceChangeSource,
} from '@notemd-harness/workspace-events'

import type { NotemdWorkspaceChanges } from '@notemd-harness/tools'
import type { WorkspaceMutationPlan, WorkspaceMutationReceipt } from '@notemd-harness/mutation'

export interface NotemdWorkspaceChangeConfig {
  readonly scanIntervalMs?: number
}

export class NotemdWorkspaceChangeService extends Service implements NotemdWorkspaceChanges, WorkspaceChangeSource {
  static inject = ['notemdVault'] as const

  private coordinator: WorkspaceChangeCoordinator | undefined
  private scanTimer: ReturnType<typeof setInterval> | undefined
  private readonly scanIntervalMs: number

  constructor(ctx: Context, config: NotemdWorkspaceChangeConfig) {
    super(ctx, 'notemdWorkspaceChanges')
    this.scanIntervalMs = scanIntervalFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    const coordinator = new WorkspaceChangeCoordinator(this.ctx.notemdVault)
    await coordinator.captureSnapshot()
    this.coordinator = coordinator
  }

  subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void {
    return this.requireCoordinator().subscribe(listener)
  }

  recordMutationReceipt(
    plan: WorkspaceMutationPlan,
    receipt: WorkspaceMutationReceipt,
  ): Promise<WorkspaceChangeEvent | undefined> {
    return this.requireCoordinator().recordMutationReceipt(plan, receipt)
  }

  async scanNow(): Promise<WorkspaceChangeEvent | undefined> {
    return this.requireCoordinator().scan()
  }

  startWatching(): void {
    if (this.scanTimer !== undefined) {
      return
    }

    const timer = setInterval(() => {
      void this.scanNow().catch((error: unknown) => {
        this.ctx.logger.warn(`notemd workspace change scan failed: ${diagnostic(error)}`)
      })
    }, this.scanIntervalMs)
    timer.unref?.()
    this.scanTimer = timer
    this.ctx.effect(() => () => {
      clearInterval(timer)
      if (this.scanTimer === timer) {
        this.scanTimer = undefined
      }
    }, 'notemdWorkspaceChanges.scan')
  }

  private requireCoordinator(): WorkspaceChangeCoordinator {
    if (this.coordinator === undefined) {
      throw new Error('NoteMD workspace change service is not initialized.')
    }
    return this.coordinator
  }
}

function scanIntervalFrom(config: NotemdWorkspaceChangeConfig): number {
  const interval = config.scanIntervalMs ?? 5_000
  if (!Number.isSafeInteger(interval) || interval < 250 || interval > 60_000) {
    throw new RangeError('NoteMD workspace change scanIntervalMs must be an integer from 250 through 60000.')
  }
  return interval
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default NotemdWorkspaceChangeService
