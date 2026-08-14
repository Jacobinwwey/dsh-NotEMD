import { Service, type Context } from '@deepseek-ai/cordis'
import { OpenAiCompatibleAdapter, type TextCompletion } from '@notemd-harness/llm-openai-compatible'
import type { TextTransformer } from '@notemd-harness/workflows'

import { ConfiguredTextTransformer, type ConfiguredTextTransformerConfig } from './runtime-adapter.js'

export type NotemdLlmConfig = ConfiguredTextTransformerConfig

export class NotemdTextTransformerService extends Service implements TextTransformer {
  private readonly transformer: ConfiguredTextTransformer

  constructor(ctx: Context, config: NotemdLlmConfig) {
    super(ctx, 'notemdTextTransformer')
    this.transformer = new ConfiguredTextTransformer(config, new OpenAiCompatibleAdapter())
  }

  complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion> {
    return this.transformer.complete(request)
  }
}

export default NotemdTextTransformerService
