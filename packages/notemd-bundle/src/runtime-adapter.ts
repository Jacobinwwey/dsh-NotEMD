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
import type { WorkspaceMutationPlan } from '@notemd-harness/mutation'
import type { TextTransformer } from '@notemd-harness/workflows'

import type { ApprovalDecision, NotemdApprovalGate } from '@notemd-harness/tools'
import type { ToolExecutionContext } from '@notemd-harness/tools'

export interface DshApprovalRequest {
  readonly agent: unknown
  readonly toolName: string
  readonly callId?: unknown
  readonly reason?: string
  readonly signal?: AbortSignal
}

export interface DshApprovalService {
  request(request: DshApprovalRequest): Promise<unknown>
}

export interface DshApprovalContext {
  readonly approval?: DshApprovalService
}

export class DshApprovalGate implements NotemdApprovalGate {
  constructor(private readonly context: DshApprovalContext) {}

  async request(plan: WorkspaceMutationPlan, execution?: ToolExecutionContext): Promise<ApprovalDecision> {
    if (execution?.signal?.aborted) {
      return 'cancelled'
    }
    const agent = execution?.agent
    const approval = this.context.approval
    if (agent === undefined || approval === undefined) {
      return 'unavailable'
    }

    const request: DshApprovalRequest = {
      agent,
      toolName: 'notemd_request_plan_approval',
      reason: approvalReason(plan),
      ...(execution?.callId !== undefined ? { callId: execution.callId } : {}),
      ...(execution?.signal !== undefined ? { signal: execution.signal } : {}),
    }

    try {
      if (await approval.request(request) === 'allowed-once') {
        return execution?.signal?.aborted ? 'cancelled' : 'approved'
      }
      return 'rejected'
    } catch (error) {
      return error instanceof DOMException && error.name === 'AbortError' || execution?.signal?.aborted
        ? 'cancelled'
        : 'unavailable'
    }
  }
}

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

export class ConfiguredTextTransformer implements TextTransformer {
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

function approvalReason(plan: WorkspaceMutationPlan): string {
  return `Approve NoteMD mutation proposal ${plan.id} with digest ${plan.digest} affecting ${plan.mutations.length} destination(s).`
}

function validateTextTransformerConfig(config: ConfiguredTextTransformerConfig): void {
  if (
    config.endpoint.trim().length === 0 ||
    config.model.trim().length === 0 ||
    config.apiKeyEnv.trim().length === 0 ||
    (config.modelsEndpoint !== undefined && config.modelsEndpoint.trim().length === 0)
  ) {
    throw new TypeError('Notemd text transformer configuration requires endpoint, model, and apiKeyEnv.')
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) {
    throw new RangeError('Notemd text transformer timeoutMs must be a positive integer.')
  }
}
