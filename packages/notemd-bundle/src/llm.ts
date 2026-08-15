import { Service, type Context } from '@deepseek-ai/cordis'
import { DshTextTransformer, type NotemdLlmRoute } from '@notemd-harness/llm-dsh'
import type { TextCompletion, TextTransformer } from '@notemd-harness/workflows'

/** DSH owns provider credentials and transport; NoteMD owns only this route policy. */
export type NotemdLlmConfig = NotemdLlmRoute

export class NotemdTextTransformerService extends Service implements TextTransformer {
  static inject = ['llm'] as const

  private readonly transformer: DshTextTransformer

  constructor(ctx: Context, config: NotemdLlmConfig) {
    super(ctx, 'notemdTextTransformer')
    this.transformer = new DshTextTransformer(ctx.llm, config)
  }

  protected async [Service.init](): Promise<void> {
    this.ctx.effect(() => () => this.transformer.dispose(), 'notemdTextTransformer.dshConsumer')
  }

  complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion> {
    return this.transformer.complete(request)
  }
}

export default NotemdTextTransformerService
