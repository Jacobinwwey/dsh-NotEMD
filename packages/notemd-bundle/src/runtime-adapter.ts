import { LlmError, OpenAiCompatibleAdapter, type OpenAiCompletionRequest, type TextCompletion } from '@notemd-harness/llm-openai-compatible'
import type { WritePlan } from '@notemd-harness/vault'
import type { TextTransformer } from '@notemd-harness/workflows'

import type { NotemdApprovalGate } from '@notemd-harness/tools'
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

  async request(plan: WritePlan, execution?: ToolExecutionContext): Promise<boolean> {
    const agent = execution?.agent
    const approval = this.context.approval
    if (agent === undefined || approval === undefined) {
      return false
    }

    const request: DshApprovalRequest = {
      agent,
      toolName: 'notemd_request_plan_approval',
      reason: approvalReason(plan),
      ...(execution?.callId !== undefined ? { callId: execution.callId } : {}),
      ...(execution?.signal !== undefined ? { signal: execution.signal } : {}),
    }

    try {
      return await approval.request(request) === 'allowed-once'
    } catch {
      return false
    }
  }
}

export interface ConfiguredTextTransformerConfig {
  readonly endpoint: string
  readonly model: string
  readonly apiKeyEnv: string
  readonly timeoutMs: number
}

export interface CompletionAdapter {
  complete(request: OpenAiCompletionRequest, signal?: AbortSignal): Promise<TextCompletion>
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
    const apiKey = this.readEnvironment(this.config.apiKeyEnv)
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      throw new LlmError(
        'LLM_TRANSPORT',
        `The configured API key environment variable is unavailable: ${this.config.apiKeyEnv}`,
        false,
      )
    }

    return this.adapter.complete({
      endpoint: this.config.endpoint,
      model: this.config.model,
      apiKey,
      timeoutMs: this.config.timeoutMs,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.prompt },
      ],
    }, request.signal)
  }
}

function approvalReason(plan: WritePlan): string {
  return `Approve NoteMD plan ${plan.id} with digest ${plan.digest} affecting ${plan.writes.length} file(s).`
}

function validateTextTransformerConfig(config: ConfiguredTextTransformerConfig): void {
  if (config.endpoint.trim().length === 0 || config.model.trim().length === 0 || config.apiKeyEnv.trim().length === 0) {
    throw new TypeError('Notemd text transformer configuration requires endpoint, model, and apiKeyEnv.')
  }
  if (!Number.isSafeInteger(config.timeoutMs) || config.timeoutMs < 1) {
    throw new RangeError('Notemd text transformer timeoutMs must be a positive integer.')
  }
}
