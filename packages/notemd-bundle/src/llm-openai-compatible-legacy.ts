import { Service, type Context } from '@deepseek-ai/cordis'
import { OpenAiCompatibleAdapter, type ModelDiscoveryResult, type ProviderDiagnosticResult, type TextCompletion } from '@notemd-harness/llm-openai-compatible'
import type { TextTransformer } from '@notemd-harness/workflows'

import {
  ConfiguredTextTransformer,
  type ConfiguredTextTransformerConfig,
  type ProviderObservabilityAdapter,
} from './legacy-text-transformer.js'

export {
  ConfiguredTextTransformer,
  type ConfiguredTextTransformerConfig,
  type ProviderObservabilityAdapter,
} from './legacy-text-transformer.js'

export type NotemdLegacyLlmConfig = ConfiguredTextTransformerConfig

export interface NotemdProviderDiagnostics {
  diagnoseProvider(signal?: AbortSignal): Promise<ProviderDiagnosticResult>
  discoverModels(signal?: AbortSignal): Promise<ModelDiscoveryResult>
}

/** Explicit opt-in compatibility entry for deployments that cannot yet use DSH LLM routing. */
export class NotemdLegacyTextTransformerService extends Service implements TextTransformer, NotemdProviderDiagnostics {
  private readonly adapter: OpenAiCompatibleAdapter
  private readonly transformer: ConfiguredTextTransformer

  constructor(ctx: Context, config: NotemdLegacyLlmConfig) {
    super(ctx, 'notemdTextTransformer')
    this.adapter = new OpenAiCompatibleAdapter()
    this.transformer = new ConfiguredTextTransformer(config, this.adapter)
  }

  complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion> {
    return this.transformer.complete(request)
  }

  diagnoseProvider(signal?: AbortSignal): Promise<ProviderDiagnosticResult> {
    return this.transformer.diagnoseProvider(this.adapter as ProviderObservabilityAdapter, signal)
  }

  discoverModels(signal?: AbortSignal): Promise<ModelDiscoveryResult> {
    return this.transformer.discoverModels(this.adapter as ProviderObservabilityAdapter, signal)
  }
}

export const name = 'notemd-llm-openai-compatible-legacy'

export function apply(ctx: Context, config: NotemdLegacyLlmConfig): void {
  ctx.plugin(NotemdLegacyTextTransformerService, config)
}
