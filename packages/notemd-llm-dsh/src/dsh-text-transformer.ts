import type { TextCompletion, TextTransformer } from '@notemd-harness/workflows'

export interface NotemdLlmRoute {
  readonly provider: string
  readonly model: string
  readonly maxTokens?: number
  readonly promptPolicyId?: string
}

export interface DshTextBlock {
  readonly type: 'text'
  readonly text: string
}

export interface DshUserMessage {
  readonly role: 'user'
  readonly content: readonly DshTextBlock[]
  readonly source: {
    readonly kind: 'plugin'
    readonly plugin: string
  }
}

/** The subset of DSH GenerateOptions required for a provider-neutral NoteMD completion. */
export interface DshGenerateOptions {
  readonly provider: string
  readonly model: string
  readonly messages: readonly DshUserMessage[]
  readonly system?: string
  readonly maxTokens?: number
  readonly signal?: AbortSignal
}

/** DSH streams are merge-extensible; the consumer validates only the chunk shapes it owns. */
export interface DshStreamChunk {
  readonly type: string
  readonly [key: string]: unknown
}

export interface DshLlmRuntime {
  stream(options: DshGenerateOptions): AsyncIterable<DshStreamChunk>
}

export type NotemdLlmErrorCode =
  | 'LLM_CANCELLED'
  | 'LLM_OUTPUT_TRUNCATED'
  | 'LLM_ROUTE_INVALID'
  | 'LLM_STREAM_MALFORMED'
  | 'LLM_STREAM_TRANSPORT'
  | 'LLM_TERMINAL_FAILURE'

export class NotemdLlmError extends Error {
  constructor(readonly code: NotemdLlmErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'NotemdLlmError'
  }
}

interface TextBlockState {
  readonly index: number
  readonly kind: string
  text: string
}

type TerminalFinish = 'stop' | 'max-tokens' | 'error' | 'aborted'

interface CombinedSignal {
  readonly signal: AbortSignal
  dispose(): void
}

const routePolicyFields: ReadonlySet<string> = new Set([
  'provider',
  'model',
  'maxTokens',
  'promptPolicyId',
])

/**
 * Converts a DSH LLM stream into NoteMD's deliberately narrow text-completion contract.
 * It owns no provider transport and can be disposed by its Cordis service during HMR.
 */
export class DshTextTransformer implements TextTransformer {
  private readonly route: NotemdLlmRoute
  private readonly activeCalls = new Set<AbortController>()
  private disposed = false

  constructor(
    private readonly llm: DshLlmRuntime,
    route: NotemdLlmRoute,
  ) {
    this.route = normalizeRoute(route)
  }

  async complete(request: { system: string; prompt: string; signal?: AbortSignal }): Promise<TextCompletion> {
    if (this.disposed) {
      throw cancelled('The NoteMD DSH LLM consumer is disposed.')
    }
    if (typeof request.system !== 'string' || typeof request.prompt !== 'string') {
      throw new TypeError('NoteMD LLM completion requires string system and prompt fields.')
    }

    const callController = new AbortController()
    this.activeCalls.add(callController)
    const combined = combineSignals(request.signal, callController.signal)

    try {
      throwIfCancelled(combined.signal)
      const completion = await this.consume(this.createRequest(request, combined.signal), combined.signal)
      throwIfCancelled(combined.signal)
      return completion
    } finally {
      combined.dispose()
      this.activeCalls.delete(callController)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const call of this.activeCalls) {
      call.abort()
    }
    this.activeCalls.clear()
  }

  private createRequest(
    request: { readonly system: string; readonly prompt: string },
    signal: AbortSignal,
  ): DshGenerateOptions {
    const content: readonly DshTextBlock[] = Object.freeze([{ type: 'text' as const, text: request.prompt }])
    const message: DshUserMessage = Object.freeze({
      role: 'user',
      content,
      source: Object.freeze({ kind: 'plugin', plugin: 'notemd-llm-dsh' }),
    })
    return Object.freeze({
      provider: this.route.provider,
      model: this.route.model,
      messages: Object.freeze([message]),
      system: request.system,
      ...(this.route.maxTokens === undefined ? {} : { maxTokens: this.route.maxTokens }),
      signal,
    })
  }

  private async consume(options: DshGenerateOptions, signal: AbortSignal): Promise<TextCompletion> {
    const blocks = new Map<number, TextBlockState>()
    let usage: TextCompletion['usage']
    let finish: TerminalFinish | undefined

    try {
      for await (const chunk of this.llm.stream(options)) {
        throwIfCancelled(signal)
        if (finish !== undefined) {
          throw malformed('The DSH LLM stream emitted data after its terminal finish.')
        }

        switch (chunkType(chunk)) {
          case 'block-start':
            recordBlockStart(blocks, chunk)
            break
          case 'text-delta':
            recordTextDelta(blocks, chunk)
            break
          case 'block-end':
            recordBlockEnd(blocks, chunk)
            break
          case 'usage':
            if (usage !== undefined) {
              throw malformed('The DSH LLM stream emitted usage more than once.')
            }
            usage = recordUsage(chunk)
            break
          case 'finish':
            finish = recordFinish(chunk)
            break
          default:
            break
        }
      }
    } catch (error) {
      if (error instanceof NotemdLlmError) throw error
      if (signal.aborted) throw cancelled('The NoteMD DSH LLM completion was cancelled.')
      throw new NotemdLlmError('LLM_STREAM_TRANSPORT', 'The DSH LLM stream could not be completed.', { cause: error })
    }

    throwIfCancelled(signal)
    if (finish === undefined) {
      throw malformed('The DSH LLM stream ended without a terminal finish.')
    }
    if (finish === 'aborted') {
      throw cancelled('The DSH LLM stream was cancelled.')
    }
    if (finish === 'error') {
      throw new NotemdLlmError('LLM_TERMINAL_FAILURE', 'The DSH LLM stream ended with a provider-neutral failure.')
    }
    if (finish === 'max-tokens') {
      throw new NotemdLlmError('LLM_OUTPUT_TRUNCATED', 'The DSH LLM stream exceeded the configured output limit.')
    }

    const text = [...blocks.values()]
      .filter((block) => block.kind === 'text')
      .map((block) => block.text)
      .join('')
    return Object.freeze({
      text,
      model: this.route.model,
      ...(usage === undefined ? {} : { usage }),
    })
  }
}

function normalizeRoute(route: NotemdLlmRoute): NotemdLlmRoute {
  if (!isRecord(route)) {
    throw new NotemdLlmError('LLM_ROUTE_INVALID', 'NoteMD LLM route policy must be an object.')
  }
  for (const field of Object.keys(route)) {
    if (!routePolicyFields.has(field)) {
      throw new NotemdLlmError('LLM_ROUTE_INVALID', `NoteMD LLM route policy does not permit ${field}.`)
    }
  }
  if (typeof route.provider !== 'string' || route.provider.trim().length === 0) {
    throw new NotemdLlmError('LLM_ROUTE_INVALID', 'NoteMD LLM route provider must be a non-empty string.')
  }
  if (typeof route.model !== 'string' || route.model.trim().length === 0) {
    throw new NotemdLlmError('LLM_ROUTE_INVALID', 'NoteMD LLM route model must be a non-empty string.')
  }
  if (route.maxTokens !== undefined && (!Number.isSafeInteger(route.maxTokens) || route.maxTokens < 1)) {
    throw new NotemdLlmError('LLM_ROUTE_INVALID', 'NoteMD LLM route maxTokens must be a positive safe integer.')
  }
  if (route.promptPolicyId !== undefined && route.promptPolicyId.trim().length === 0) {
    throw new NotemdLlmError('LLM_ROUTE_INVALID', 'NoteMD LLM route promptPolicyId must be a non-empty string when supplied.')
  }
  return Object.freeze({
    provider: route.provider.trim(),
    model: route.model.trim(),
    ...(route.maxTokens === undefined ? {} : { maxTokens: route.maxTokens }),
    ...(route.promptPolicyId === undefined ? {} : { promptPolicyId: route.promptPolicyId.trim() }),
  })
}

function combineSignals(...signals: readonly (AbortSignal | undefined)[]): CombinedSignal {
  const controller = new AbortController()
  const removals: Array<() => void> = []
  const abort = (): void => controller.abort()

  for (const signal of signals) {
    if (signal === undefined) continue
    if (signal.aborted) {
      controller.abort()
      break
    }
    signal.addEventListener('abort', abort, { once: true })
    removals.push(() => signal.removeEventListener('abort', abort))
  }

  return {
    signal: controller.signal,
    dispose() {
      for (const remove of removals) remove()
    },
  }
}

function chunkType(chunk: DshStreamChunk): string {
  if (!isRecord(chunk) || typeof chunk.type !== 'string') {
    throw malformed('The DSH LLM stream emitted a non-object chunk.')
  }
  return chunk.type
}

function recordBlockStart(blocks: Map<number, TextBlockState>, chunk: DshStreamChunk): void {
  const index = chunkIndex(chunk)
  const blockType = stringField(chunk, 'blockType')
  const existing = blocks.get(index)
  if (existing === undefined) {
    blocks.set(index, { index, kind: blockType, text: '' })
    return
  }
  if (existing.kind !== blockType) {
    throw malformed('The DSH LLM stream reused a block index with another block type.')
  }
}

function recordTextDelta(blocks: Map<number, TextBlockState>, chunk: DshStreamChunk): void {
  const index = chunkIndex(chunk)
  const text = stringField(chunk, 'text')
  const block = blocks.get(index)
  if (block === undefined) {
    blocks.set(index, { index, kind: 'text', text })
    return
  }
  if (block.kind !== 'text') {
    throw malformed('The DSH LLM stream emitted text for a non-text block.')
  }
  block.text += text
}

function recordBlockEnd(blocks: Map<number, TextBlockState>, chunk: DshStreamChunk): void {
  const index = chunkIndex(chunk)
  const value = recordField(chunk, 'block')
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw malformed('The DSH LLM stream emitted an invalid block-end payload.')
  }
  if (value.type !== 'text') return
  if (typeof value.text !== 'string') {
    throw malformed('The DSH LLM stream emitted a text block without text.')
  }
  const block = blocks.get(index)
  if (block === undefined) {
    blocks.set(index, { index, kind: 'text', text: value.text })
    return
  }
  if (block.kind !== 'text') {
    throw malformed('The DSH LLM stream ended a non-text block as text.')
  }
  block.text = value.text
}

function recordUsage(chunk: DshStreamChunk): TextCompletion['usage'] {
  const usage = recordField(chunk, 'usage')
  if (!isRecord(usage)) {
    throw malformed('The DSH LLM stream emitted an invalid usage payload.')
  }
  const inputTokens = nonNegativeSafeInteger(usage, 'inputTokens')
  const outputTokens = nonNegativeSafeInteger(usage, 'outputTokens')
  return Object.freeze({ inputTokens, outputTokens })
}

function recordFinish(chunk: DshStreamChunk): TerminalFinish {
  const reason = recordField(chunk, 'reason')
  if (!isRecord(reason) || typeof reason.kind !== 'string') {
    throw malformed('The DSH LLM stream emitted an invalid terminal finish.')
  }
  switch (reason.kind) {
    case 'stop':
    case 'max-tokens':
      return reason.kind
    case 'error':
    case 'aborted':
      if (!isRecord(reason.failure) || typeof reason.failure.code !== 'string' || typeof reason.failure.message !== 'string') {
        throw malformed('The DSH LLM stream emitted a terminal failure without provider-neutral failure facts.')
      }
      return reason.kind
    default:
      throw malformed('The DSH LLM stream emitted an unsupported terminal finish.')
  }
}

function chunkIndex(chunk: DshStreamChunk): number {
  const index = recordField(chunk, 'index')
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || index < 0) {
    throw malformed('The DSH LLM stream block index must be a non-negative safe integer.')
  }
  return index
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = recordField(record, field)
  if (typeof value !== 'string') {
    throw malformed(`The DSH LLM stream field ${field} must be a string.`)
  }
  return value
}

function nonNegativeSafeInteger(record: Record<string, unknown>, field: string): number {
  const value = recordField(record, field)
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw malformed(`The DSH LLM stream field ${field} must be a non-negative safe integer.`)
  }
  return value
}

function recordField(record: Record<string, unknown>, field: string): unknown {
  if (!(field in record)) {
    throw malformed(`The DSH LLM stream is missing required field ${field}.`)
  }
  return record[field]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw cancelled('The NoteMD DSH LLM completion was cancelled.')
  }
}

function cancelled(message: string): NotemdLlmError {
  return new NotemdLlmError('LLM_CANCELLED', message)
}

function malformed(message: string): NotemdLlmError {
  return new NotemdLlmError('LLM_STREAM_MALFORMED', message)
}
