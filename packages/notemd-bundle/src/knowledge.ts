import { Service, type Context } from '@deepseek-ai/cordis'
import { VaultKnowledgeIndex, type KnowledgeMatch } from '@notemd-harness/knowledge'

import type { NotemdKnowledge } from '@notemd-harness/tools'

export class NotemdKnowledgeService extends Service implements NotemdKnowledge {
  static inject = ['notemdVault'] as const

  private index: VaultKnowledgeIndex | undefined

  constructor(ctx: Context) {
    super(ctx, 'notemdKnowledge')
  }

  protected async [Service.init](): Promise<void> {
    const index = new VaultKnowledgeIndex(this.ctx.notemdVault)
    await index.rebuild()
    this.index = index
  }

  search(query: string): Promise<readonly KnowledgeMatch[]> {
    return this.requireIndex().search(query)
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
