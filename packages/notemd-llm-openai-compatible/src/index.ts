import { ExpiringValueCache, canonicalRequestDigest } from './cache.js'
import { LlmError } from './error.js'
import { SseFrameError, readSseData } from './sse.js'

export * from './cache.js'
export * from './error.js'
export * from './sse.js'

export interface OpenAiMessage {
  role: 'assistant' | 'system' | 'tool' | 'user'
  content: string
}

export interface OpenAiCompletionRequest {
  endpoint: string
  model: string
  messages: readonly OpenAiMessage[]
  apiKey?: string
  headers?: Readonly<Record<string, string>>
  temperature?: number
  timeoutMs?: number
}

export interface TextCompletion {
  text: string
  model: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export type StreamFinishReason = 'stop' | 'length' | 'tool-calls'

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: 'usage'; inputTokens: number; outputTokens: number }
  | { type: 'finish'; reason: StreamFinishReason }

export interface OpenAiAdapterOptions {
  fetch?: typeof fetch
  cacheTtlMs?: number
  now?: () => number
}

export class OpenAiCompatibleAdapter {
  private readonly fetchImplementation: typeof fetch
  private readonly cache: ExpiringValueCache<TextCompletion>
  private readonly cacheTtlMs: number
  private readonly now: () => number

  constructor(options: OpenAiAdapterOptions = {}) {
    if (typeof options.fetch === 'function') {
      this.fetchImplementation = options.fetch
    } else if (typeof globalThis.fetch === 'function') {
      this.fetchImplementation = globalThis.fetch
    } else {
      throw new LlmError('LLM_TRANSPORT', 'No fetch implementation is available.', true)
    }
    this.cache = new ExpiringValueCache<TextCompletion>()
    this.cacheTtlMs = options.cacheTtlMs ?? 0
    this.now = options.now ?? Date.now
  }

  async complete(request: OpenAiCompletionRequest, signal?: AbortSignal): Promise<TextCompletion> {
    validateRequest(request)
    const cacheKey = canonicalRequestDigest(cacheIdentity(request))
    if (this.cacheTtlMs > 0) {
      const cached = this.cache.get(cacheKey, this.now())
      if (cached !== undefined) {
        return cached
      }
    }

    const response = await this.request(request, false, signal)
    const payload = await readJson(response)
    const completion = parseCompletion(payload)
    if (this.cacheTtlMs > 0) {
      this.cache.set(cacheKey, completion, this.cacheTtlMs, this.now())
    }
    return completion
  }

  async *stream(request: OpenAiCompletionRequest, signal?: AbortSignal): AsyncGenerator<StreamChunk> {
    validateRequest(request)
    const response = await this.request(request, true, signal)
    if (response.body === null) {
      throw new LlmError('LLM_STREAM_MALFORMED', 'Streaming response has no body.', false)
    }

    const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>()
    let receivedDone = false
    let finishReason: StreamFinishReason = 'stop'

    try {
      for await (const data of readSseData(response.body)) {
        if (data === '[DONE]') {
          receivedDone = true
          break
        }

        const event = parseSseEvent(data)
        const usage = parseUsage(objectProperty(event, 'usage'))
        if (usage !== undefined) {
          yield { type: 'usage', inputTokens: usage.inputTokens, outputTokens: usage.outputTokens }
        }

        const choice = firstChoice(event)
        if (choice === undefined) {
          continue
        }
        const delta = objectProperty(choice, 'delta')
        const text = stringProperty(delta, 'content')
        if (text !== undefined && text.length > 0) {
          yield { type: 'text', text }
        }
        for (const chunk of updateToolCalls(delta, toolCalls)) {
          yield chunk
        }

        const rawReason = stringProperty(choice, 'finish_reason')
        if (rawReason !== undefined) {
          finishReason = normalizeFinishReason(rawReason)
        }
      }
    } catch (error) {
      if (error instanceof LlmError) {
        throw error
      }
      if (signal?.aborted || isAbortError(error)) {
        throw new LlmError('LLM_CANCELLED', 'LLM streaming was cancelled.', false)
      }
      if (error instanceof SseFrameError || error instanceof SyntaxError) {
        throw new LlmError('LLM_STREAM_MALFORMED', error.message, false)
      }
      throw new LlmError('LLM_STREAM_MALFORMED', diagnostic(error), false)
    }

    if (!receivedDone) {
      throw new LlmError('LLM_STREAM_MALFORMED', 'SSE stream ended without [DONE].', false)
    }
    yield { type: 'finish', reason: finishReason }
  }

  private async request(
    request: OpenAiCompletionRequest,
    stream: boolean,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const abortFromCaller = (): void => controller.abort(externalSignal?.reason)
    if (externalSignal !== undefined) {
      if (externalSignal.aborted) {
        abortFromCaller()
      } else {
        externalSignal.addEventListener('abort', abortFromCaller, { once: true })
      }
    }
    if (request.timeoutMs !== undefined) {
      timeout = setTimeout(() => controller.abort(new Error('LLM request timed out.')), request.timeoutMs)
    }

    try {
      const response = await this.fetchImplementation(request.endpoint, requestInit(request, stream, controller.signal))
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new LlmError('LLM_HTTP', `LLM request failed with HTTP ${response.status}: ${body.slice(0, 500)}`, response.status >= 500)
      }
      return response
    } catch (error) {
      if (error instanceof LlmError) {
        throw error
      }
      if (externalSignal?.aborted) {
        throw new LlmError('LLM_CANCELLED', 'LLM request was cancelled.', false)
      }
      if (controller.signal.aborted) {
        throw new LlmError('LLM_TIMEOUT', 'LLM request timed out.', true)
      }
      throw new LlmError('LLM_TRANSPORT', diagnostic(error), true)
    } finally {
      if (timeout !== undefined) {
        clearTimeout(timeout)
      }
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', abortFromCaller)
      }
    }
  }
}

function requestInit(request: OpenAiCompletionRequest, stream: boolean, signal: AbortSignal): RequestInit {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...request.headers }
  if (request.apiKey !== undefined) {
    headers.authorization = `Bearer ${request.apiKey}`
  }
  const body: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    stream,
  }
  if (request.temperature !== undefined) {
    body.temperature = request.temperature
  }
  if (stream) {
    body.stream_options = { include_usage: true }
  }
  return { method: 'POST', headers, body: JSON.stringify(body), signal }
}

function cacheIdentity(request: OpenAiCompletionRequest): Record<string, unknown> {
  const headers = Object.fromEntries(
    Object.entries(request.headers ?? {}).filter(([name]) => name.toLocaleLowerCase() !== 'authorization'),
  )
  return {
    endpoint: request.endpoint,
    headers,
    messages: request.messages,
    model: request.model,
    temperature: request.temperature ?? null,
  }
}

function validateRequest(request: OpenAiCompletionRequest): void {
  try {
    const endpoint = new URL(request.endpoint)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
  } catch {
    throw new LlmError('LLM_TRANSPORT', 'LLM endpoint must be an HTTP(S) URL.', false)
  }
  if (request.model.trim().length === 0 || request.messages.length === 0) {
    throw new LlmError('LLM_TRANSPORT', 'LLM requests require a model and at least one message.', false)
  }
  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
    throw new LlmError('LLM_TRANSPORT', 'LLM request timeout must be a positive number.', false)
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch (error) {
    throw new LlmError('LLM_STREAM_MALFORMED', `LLM JSON response is invalid: ${diagnostic(error)}`, false)
  }
}

function parseCompletion(payload: unknown): TextCompletion {
  const object = requireObject(payload, 'LLM JSON response must be an object.')
  const choice = firstChoice(object)
  const message = choice === undefined ? undefined : objectProperty(choice, 'message')
  const text = stringProperty(message, 'content')
  if (text === undefined) {
    throw new LlmError('LLM_STREAM_MALFORMED', 'LLM JSON response has no text completion.', false)
  }
  const model = stringProperty(object, 'model') ?? 'unknown'
  const usage = parseUsage(objectProperty(object, 'usage'))
  if (usage === undefined) {
    return { text, model }
  }
  return { text, model, usage }
}

function parseSseEvent(data: string): Record<string, unknown> {
  try {
    return requireObject(JSON.parse(data), 'SSE event must be a JSON object.')
  } catch (error) {
    if (error instanceof LlmError) {
      throw error
    }
    throw new LlmError('LLM_STREAM_MALFORMED', `Invalid SSE event: ${diagnostic(error)}`, false)
  }
}

function firstChoice(value: Record<string, unknown>): Record<string, unknown> | undefined {
  const choices = value.choices
  if (!Array.isArray(choices) || choices.length === 0) {
    return undefined
  }
  return isObject(choices[0]) ? choices[0] : undefined
}

function updateToolCalls(
  delta: Record<string, unknown> | undefined,
  knownCalls: Map<number, { id?: string; name?: string; arguments: string }>,
): StreamChunk[] {
  const calls = delta?.tool_calls
  if (!Array.isArray(calls)) {
    return []
  }

  const chunks: StreamChunk[] = []
  for (const rawCall of calls) {
    if (!isObject(rawCall) || typeof rawCall.index !== 'number') {
      continue
    }
    const current = knownCalls.get(rawCall.index) ?? { arguments: '' }
    const id = stringProperty(rawCall, 'id')
    if (id !== undefined) {
      current.id = id
    }
    const functionDelta = objectProperty(rawCall, 'function')
    const name = stringProperty(functionDelta, 'name')
    if (name !== undefined) {
      current.name = name
    }
    const argumentsDelta = stringProperty(functionDelta, 'arguments')
    if (argumentsDelta !== undefined) {
      current.arguments += argumentsDelta
    }
    knownCalls.set(rawCall.index, current)
    if (current.id !== undefined && current.name !== undefined) {
      chunks.push({ type: 'tool-call', id: current.id, name: current.name, arguments: current.arguments })
    }
  }
  return chunks
}

function parseUsage(value: Record<string, unknown> | undefined): { inputTokens: number; outputTokens: number } | undefined {
  if (value === undefined) {
    return undefined
  }
  const inputTokens = value.prompt_tokens
  const outputTokens = value.completion_tokens
  if (
    typeof inputTokens !== 'number' ||
    typeof outputTokens !== 'number' ||
    !Number.isInteger(inputTokens) ||
    !Number.isInteger(outputTokens) ||
    inputTokens < 0 ||
    outputTokens < 0
  ) {
    throw new LlmError('LLM_STREAM_MALFORMED', 'LLM usage fields are invalid.', false)
  }
  return { inputTokens, outputTokens }
}

function normalizeFinishReason(reason: string): StreamFinishReason {
  if (reason === 'length') {
    return 'length'
  }
  if (reason === 'tool_calls') {
    return 'tool-calls'
  }
  return 'stop'
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new LlmError('LLM_STREAM_MALFORMED', message, false)
  }
  return value
}

function objectProperty(value: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const property = value?.[key]
  return isObject(property) ? property : undefined
}

function stringProperty(value: Record<string, unknown> | undefined, key: string): string | undefined {
  const property = value?.[key]
  return typeof property === 'string' ? property : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function diagnostic(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
