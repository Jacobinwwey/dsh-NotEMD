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

export interface OpenAiProviderRequest {
  endpoint: string
  model: string
  apiKey?: string
  headers?: Readonly<Record<string, string>>
  timeoutMs?: number
  modelsEndpoint?: string
}

export interface TextCompletion {
  text: string
  model: string
  usage?: {
    inputTokens: number
    outputTokens: number
  }
}

export type ProviderDiagnosticResult =
  | {
    status: 'available'
    endpoint: string
    model: string
    elapsedMs: number
    usage?: TextCompletion['usage']
  }
  | {
    status: 'unavailable'
    endpoint: string
    model: string
    elapsedMs: number
    error: { code: LlmError['code']; retryable: boolean; message: string }
  }

export interface DiscoveredModel {
  id: string
  ownedBy?: string
}

export type ModelDiscoveryResult =
  | { status: 'available'; endpoint: string; models: readonly DiscoveredModel[] }
  | { status: 'unavailable'; endpoint: string; reason: 'LLM_CANCELLED' | 'LLM_HTTP' | 'LLM_STREAM_MALFORMED' | 'LLM_TIMEOUT' | 'LLM_TRANSPORT' | 'MODEL_DISCOVERY_UNSUPPORTED' }

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

  async diagnoseProvider(request: OpenAiProviderRequest, signal?: AbortSignal): Promise<ProviderDiagnosticResult> {
    const endpoint = redactProviderEndpoint(request.endpoint)
    const startedAt = this.now()
    try {
      validateProviderRequest(request)
      const response = await this.request({
        ...providerRequestForCompletion(request),
        messages: [
          { role: 'system', content: 'Return exactly the word ok.' },
          { role: 'user', content: 'Run the configured provider diagnostic.' },
        ],
      }, false, signal)
      const completion = parseCompletion(await readJson(response))
      return {
        status: 'available',
        endpoint,
        model: request.model,
        elapsedMs: this.now() - startedAt,
        ...(completion.usage === undefined ? {} : { usage: completion.usage }),
      }
    } catch (error) {
      const normalized = normalizeDiagnosticError(error)
      return {
        status: 'unavailable',
        endpoint,
        model: request.model,
        elapsedMs: this.now() - startedAt,
        error: {
          code: normalized.code,
          retryable: normalized.retryable,
          message: publicDiagnosticMessage(normalized.code),
        },
      }
    }
  }

  async discoverModels(request: OpenAiProviderRequest, signal?: AbortSignal): Promise<ModelDiscoveryResult> {
    let modelsEndpoint: string | undefined
    try {
      validateProviderRequest(request)
      modelsEndpoint = modelsEndpointFor(request)
      if (modelsEndpoint === undefined) {
        return {
          status: 'unavailable',
          endpoint: redactProviderEndpoint(request.endpoint),
          reason: 'MODEL_DISCOVERY_UNSUPPORTED',
        }
      }
      const response = await this.requestModels(modelsEndpoint, request, signal)
      return {
        status: 'available',
        endpoint: redactProviderEndpoint(modelsEndpoint),
        models: parseModels(await readJson(response)),
      }
    } catch (error) {
      return {
        status: 'unavailable',
        endpoint: redactProviderEndpoint(modelsEndpoint ?? request.modelsEndpoint ?? request.endpoint),
        reason: normalizeDiagnosticError(error).code,
      }
    }
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
    return this.send(request.endpoint, requestInit(request, stream), request.timeoutMs, externalSignal)
  }

  private async requestModels(
    endpoint: string,
    request: OpenAiProviderRequest,
    externalSignal?: AbortSignal,
  ): Promise<Response> {
    return this.send(endpoint, { method: 'GET', headers: requestHeaders(request) }, request.timeoutMs, externalSignal)
  }

  private async send(
    endpoint: string,
    init: RequestInit,
    timeoutMs: number | undefined,
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
    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => controller.abort(new Error('LLM request timed out.')), timeoutMs)
    }

    try {
      const response = await this.fetchImplementation(endpoint, { ...init, signal: controller.signal })
      if (!response.ok) {
        throw new LlmError('LLM_HTTP', `LLM request failed with HTTP ${response.status}.`, response.status >= 500)
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

function requestInit(request: OpenAiCompletionRequest, stream: boolean): RequestInit {
  const headers = requestHeaders(request)
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
  return { method: 'POST', headers, body: JSON.stringify(body) }
}

function requestHeaders(request: Pick<OpenAiProviderRequest, 'apiKey' | 'headers'>): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...request.headers }
  if (request.apiKey !== undefined) {
    headers.authorization = `Bearer ${request.apiKey}`
  }
  return headers
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
  validateProviderRequest(request)
  if (request.messages.length === 0) {
    throw new LlmError('LLM_TRANSPORT', 'LLM requests require a model and at least one message.', false)
  }
}

function validateProviderRequest(request: OpenAiProviderRequest): void {
  validateHttpEndpoint(request.endpoint)
  if (request.modelsEndpoint !== undefined) {
    validateHttpEndpoint(request.modelsEndpoint)
  }
  if (request.model.trim().length === 0) {
    throw new LlmError('LLM_TRANSPORT', 'LLM requests require a model.', false)
  }
  if (request.timeoutMs !== undefined && (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0)) {
    throw new LlmError('LLM_TRANSPORT', 'LLM request timeout must be a positive number.', false)
  }
}

function validateHttpEndpoint(endpointValue: string): void {
  try {
    const endpoint = new URL(endpointValue)
    if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
  } catch {
    throw new LlmError('LLM_TRANSPORT', 'LLM endpoint must be an HTTP(S) URL.', false)
  }
}

function providerRequestForCompletion(request: OpenAiProviderRequest): Omit<OpenAiCompletionRequest, 'messages'> {
  return {
    endpoint: request.endpoint,
    model: request.model,
    ...(request.apiKey === undefined ? {} : { apiKey: request.apiKey }),
    ...(request.headers === undefined ? {} : { headers: request.headers }),
    ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
  }
}

function modelsEndpointFor(request: OpenAiProviderRequest): string | undefined {
  if (request.modelsEndpoint !== undefined) {
    return request.modelsEndpoint
  }

  const completionEndpoint = new URL(request.endpoint)
  const completionSuffix = '/chat/completions'
  if (!completionEndpoint.pathname.endsWith(completionSuffix)) {
    return undefined
  }
  completionEndpoint.pathname = `${completionEndpoint.pathname.slice(0, -completionSuffix.length)}/models`
  completionEndpoint.username = ''
  completionEndpoint.password = ''
  completionEndpoint.search = ''
  completionEndpoint.hash = ''
  return completionEndpoint.toString()
}

export function redactProviderEndpoint(endpointValue: string): string {
  try {
    const endpoint = new URL(endpointValue)
    endpoint.username = ''
    endpoint.password = ''
    endpoint.search = ''
    endpoint.hash = ''
    return endpoint.toString()
  } catch {
    return 'invalid-endpoint'
  }
}

function normalizeDiagnosticError(error: unknown): LlmError {
  if (error instanceof LlmError) {
    return error
  }
  if (isAbortError(error)) {
    return new LlmError('LLM_CANCELLED', 'LLM request was cancelled.', false)
  }
  return new LlmError('LLM_TRANSPORT', diagnostic(error), true)
}

function publicDiagnosticMessage(code: LlmError['code']): string {
  switch (code) {
    case 'LLM_CANCELLED':
      return 'Provider diagnostic was cancelled.'
    case 'LLM_HTTP':
      return 'Provider rejected the diagnostic request.'
    case 'LLM_STREAM_MALFORMED':
      return 'Provider returned an invalid response.'
    case 'LLM_TIMEOUT':
      return 'Provider diagnostic timed out.'
    case 'LLM_TRANSPORT':
      return 'Provider transport is unavailable.'
  }
}

function parseModels(payload: unknown): readonly DiscoveredModel[] {
  const object = requireObject(payload, 'LLM model discovery response must be an object.')
  if (!Array.isArray(object.data)) {
    throw new LlmError('LLM_STREAM_MALFORMED', 'LLM model discovery response has no model array.', false)
  }
  return object.data.flatMap((candidate) => {
    if (!isObject(candidate) || typeof candidate.id !== 'string') {
      return []
    }
    return [{
      id: candidate.id,
      ...(typeof candidate.owned_by === 'string' ? { ownedBy: candidate.owned_by } : {}),
    }]
  })
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
