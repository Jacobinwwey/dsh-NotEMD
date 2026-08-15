import { Service, type Context } from '@deepseek-ai/cordis'
import {
  OpenAiCompatibleAdapter,
  type ModelDiscoveryResult,
  type ProviderDiagnosticResult,
  type TextCompletion,
} from '@notemd-harness/llm-openai-compatible'
import type { TextTransformer } from '@notemd-harness/workflows'

import { ConfiguredTextTransformer, type ConfiguredTextTransformerConfig, type ProviderObservabilityAdapter } from './runtime-adapter.js'

export type NotemdLlmConfig = ConfiguredTextTransformerConfig

export interface NotemdProviderDiagnostics {
  diagnoseProvider(signal?: AbortSignal): Promise<ProviderDiagnosticResult>
  discoverModels(signal?: AbortSignal): Promise<ModelDiscoveryResult>
}

export class NotemdTextTransformerService extends Service implements TextTransformer, NotemdProviderDiagnostics {
  private readonly adapter: OpenAiCompatibleAdapter
  private readonly transformer: ConfiguredTextTransformer

  constructor(ctx: Context, config: NotemdLlmConfig) {
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

export default NotemdTextTransformerService
