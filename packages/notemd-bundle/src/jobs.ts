import { Service, type Context } from '@deepseek-ai/cordis'
import { FileJobStore } from '@notemd-harness/jobs'

import type { NotemdJobs } from '@notemd-harness/tools'

import { workspaceRootFrom, type WorkspaceRootConfig } from './workspace-root.js'

export class NotemdJobsService extends Service implements NotemdJobs {
  private store: FileJobStore | undefined
  private readonly workspaceRoot: string

  constructor(ctx: Context, config: WorkspaceRootConfig) {
    super(ctx, 'notemdJobs')
    this.workspaceRoot = workspaceRootFrom(config)
  }

  protected async [Service.init](): Promise<void> {
    this.store = await FileJobStore.open(this.workspaceRoot)
  }

  get(id: string): Promise<unknown | undefined> {
    return this.requireStore().get(id)
  }

  cancel(id: string): Promise<unknown> {
    return this.requireStore().cancel(id)
  }

  private requireStore(): FileJobStore {
    if (this.store === undefined) {
      throw new Error('NoteMD jobs service is not initialized.')
    }
    return this.store
  }
}

export default NotemdJobsService
