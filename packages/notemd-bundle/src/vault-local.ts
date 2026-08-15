import { Service, type Context } from '@deepseek-ai/cordis'
import { LocalVault } from '@notemd-harness/vault-local'
import type { RecoveredMutation, WorkspaceMutationPlan, WorkspaceMutationReceipt } from '@notemd-harness/mutation'
import type { NotemdVault, VaultDocument } from '@notemd-harness/vault'

import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

export class NotemdVaultLocalService extends Service implements NotemdVault {
  private vault: LocalVault | undefined
  private readonly workspaceRoot: string

  constructor(ctx: Context, config: WorkspaceRootConfig) {
    super(ctx, 'notemdVault')
    this.workspaceRoot = workspaceRootFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    this.vault = await LocalVault.open(this.workspaceRoot)
  }

  listMarkdown(signal?: AbortSignal): Promise<readonly string[]> {
    return this.requireVault().listMarkdown(signal)
  }

  read(path: string, signal?: AbortSignal): Promise<VaultDocument> {
    return this.requireVault().read(path, signal)
  }

  applyMutationPlan(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt> {
    return this.requireVault().applyMutationPlan(plan, signal)
  }

  recoverIncompleteMutationPlans(signal?: AbortSignal): Promise<readonly RecoveredMutation[]> {
    return this.requireVault().recoverIncompleteMutationPlans(signal)
  }

  private requireVault(): LocalVault {
    if (this.vault === undefined) {
      throw new Error('NoteMD vault service is not initialized.')
    }
    return this.vault
  }
}

export default NotemdVaultLocalService
