import {
  LlmError,
  OpenAiCompatibleAdapter,
  redactProviderEndpoint,
  type ModelDiscoveryResult,
  type OpenAiCompletionRequest,
  type OpenAiProviderRequest,
  type ProviderDiagnosticResult,
  type TextCompletion,
} from '@notemd-harness/llm-openai-compatible'

export interface ConfiguredTextTransformerConfig {
  readonly endpoint: string
  readonly model: string
  readonly apiKeyEnv: string
  readonly timeoutMs: number
  readonly modelsEndpoint?: string
}

export interface CompletionAdapter {
  complete(request: OpenAiCompletionRequest, signal?: AbortSignal): Promise<TextCompletion>
}

export interface ProviderObservabilityAdapter {
  diagnoseProvider(request: OpenAiProviderRequest, signal?: AbortSignal): Promise<ProviderDiagnosticResult>
  discoverModels(request: OpenAiProviderRequest, signal?: AbortSignal): Promise<ModelDiscoveryResult>
}

export type EnvironmentReader = (name: string) => string | undefined

/**
 * Explicit legacy-only transport adapter. The default NoteMD patch never loads this class.
 */
export class ConfiguredTextTransformer {
  constructor(
    private readonly config: ConfiguredTextTransformerConfig,
    private readonly adapter: CompletionAdapter = new OpenAiCompatibleAdapter(),
    private readonly readEnvironment: EnvironmentReader = (name) => process.env[name],
  ) {
    validateTextTransformerConfig(config)
  }

  async complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion> {
    return this.adapter.complete({
      ...this.providerRequest(),
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
    }, request.signal)
  }

  diagnoseProvider(adapter: ProviderObservabilityAdapter, signal?: AbortSignal): Promise<ProviderDiagnosticResult> {
    const request = this.providerRequestWithAvailableCredentials()
    return request === undefined
      ? Promise.resolve(this.unavailableProviderDiagnostic())
      : adapter.diagnoseProvider(request, signal)
  }

  discoverModels(adapter: ProviderObservabilityAdapter, signal?: AbortSignal): Promise<ModelDiscoveryResult> {
    const request = this.providerRequestWithAvailableCredentials()
    return request === undefined
      ? Promise.resolve({
        status: 'unavailable',
        endpoint: redactProviderEndpoint(this.config.modelsEndpoint ?? this.config.endpoint),
        reason: 'LLM_TRANSPORT',
      })
      : adapter.discoverModels(request, signal)
  }

  private providerRequest(): OpenAiProviderRequest {
    const request = this.providerRequestWithAvailableCredentials()
    if (request === undefined) {
      throw new LlmError(
        'LLM_TRANSPORT',
        `The configured API key environment variable is unavailable: ${this.config.apiKeyEnv}`,
        false,
      )
    }
    return request
  }

  private providerRequestWithAvailableCredentials(): OpenAiProviderRequest | undefined {
    const apiKey = this.readEnvironment(this.config.apiKeyEnv)
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return undefined
    }

    return {
      endpoint: this.config.endpoint,
      model: this.config.model,
      apiKey,
      timeoutMs: this.config.timeoutMs,
      ...(this.config.modelsEndpoint === undefined ? {} : { modelsEndpoint: this.config.modelsEndpoint }),
    }
  }

  private unavailableProviderDiagnostic(): ProviderDiagnosticResult {
    return {
      status: 'unavailable',
      endpoint: redactProviderEndpoint(this.config.endpoint),
      model: this.config.model,
      elapsedMs: 0,
      error: {
        code: 'LLM_TRANSPORT',
        retryable: false,
        message: 'Provider credentials are unavailable.',
      },
    }
  }
}

function validateTextTransformerConfig(config: ConfiguredTextTransformerConfig): void {
  if (
    config.endpoint.trim().length === 0
    || config.model.trim().length === 0
    || config.apiKeyEnv.trim().length === 0
    || (config.modelsEndpoint !== undefined && config.modelsEndpoint.trim().length === 0)
  ) {
    throw new TypeError('NoteMD text transformer configuration requires endpoint, model, and apiKeyEnv.')
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) {
    throw new RangeError('NoteMD text transformer timeoutMs must be a positive integer.')
  }
}
