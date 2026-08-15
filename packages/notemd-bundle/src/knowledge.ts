import { Service, type Context } from '@deepseek-ai/cordis'
import {
  IncrementalKnowledgeSynchronizer,
  VaultKnowledgeIndex,
  type KnowledgeMatch,
  type KnowledgeRetrievalRequest,
  type KnowledgeRetrievalResult,
} from '@notemd-harness/knowledge'

import type { NotemdKnowledge } from '@notemd-harness/tools'

export class NotemdKnowledgeService extends Service implements NotemdKnowledge {
  static inject = ['notemdVault', 'notemdWorkspaceChanges'] as const

  private index: VaultKnowledgeIndex | undefined
  private synchronizer: IncrementalKnowledgeSynchronizer | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdKnowledge')
  }

  protected async [Service.init](): Promise<void> {
    const index = new VaultKnowledgeIndex(this.ctx.notemdVault)
    await index.rebuild()
    const synchronizer = new IncrementalKnowledgeSynchronizer(index, this.ctx.notemdVault, this.ctx.notemdWorkspaceChanges)
    synchronizer.start()
    this.index = index
    this.synchronizer = synchronizer
    this.ctx.effect(() => () => synchronizer.dispose(), 'notemdKnowledge.workspaceChanges')
    this.ctx.notemdWorkspaceChanges.startWatching()
  }

  search(query: string): Promise<readonly KnowledgeMatch[]> {
    return this.requireIndex().search(query)
  }

  retrieve(request: KnowledgeRetrievalRequest): Promise<KnowledgeRetrievalResult> {
    return this.requireIndex().retrieve(request)
  }

  async rebuild(signal?: AbortSignal): Promise<void> {
    await this.requireIndex().rebuild(signal)
  }

  private requireIndex(): VaultKnowledgeIndex {
    if (this.index === undefined) {
      throw new Error('NoteMD knowledge service is not initialized.')
    }
    return this.index
  }
}

export default NotemdKnowledgeService
