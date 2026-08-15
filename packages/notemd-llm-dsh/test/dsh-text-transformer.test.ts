import { expect, test } from 'vitest'

import {
  DshTextTransformer,
  NotemdLlmError,
  type DshGenerateOptions,
  type DshLlmRuntime,
  type NotemdLlmRoute,
  type DshStreamChunk,
} from '../src/index.js'

function stream(chunks: readonly DshStreamChunk[]): AsyncIterable<DshStreamChunk> {
  return (async function* (): AsyncIterable<DshStreamChunk> {
    yield* chunks
  })()
}

function transformer(
  streamFactory: (options: DshGenerateOptions) => AsyncIterable<DshStreamChunk>,
): DshTextTransformer {
  const llm: DshLlmRuntime = { stream: streamFactory }
  return new DshTextTransformer(llm, {
    provider: 'fixture-provider',
    model: 'fixture-model',
    maxTokens: 320,
    promptPolicyId: 'notemd.fixture.v1',
  })
}

test('assembles DSH text blocks and returns the terminal usage accounting', async () => {
  let observed: DshGenerateOptions | undefined
  const subject = transformer((options) => {
    observed = options
    return stream([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'Hello ' },
      { type: 'text-delta', index: 0, text: 'world' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'Hello world' } },
      { type: 'usage', usage: { inputTokens: 12, outputTokens: 3 } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })

  await expect(subject.complete({ system: 'System contract', prompt: 'User prompt' })).resolves.toEqual({
    text: 'Hello world',
    model: 'fixture-model',
    usage: { inputTokens: 12, outputTokens: 3 },
  })
  expect(observed).toMatchObject({
    provider: 'fixture-provider',
    model: 'fixture-model',
    maxTokens: 320,
    system: 'System contract',
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: 'User prompt' }],
    }],
  })
  expect(JSON.stringify(observed)).not.toContain('endpoint')
  expect(JSON.stringify(observed)).not.toContain('apiKey')
})

test('rejects terminal provider failures without exposing provider failure details', async () => {
  const subject = transformer(() => stream([
    {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { code: 'UPSTREAM', message: 'provider secret must not escape' },
      },
    },
  ]))

  await expect(subject.complete({ system: 'system', prompt: 'prompt' })).rejects.toMatchObject({
    code: 'LLM_TERMINAL_FAILURE',
    name: 'NotemdLlmError',
  })
  await expect(subject.complete({ system: 'system', prompt: 'prompt' })).rejects.not.toThrow('provider secret must not escape')
})

test('rejects aborted and malformed DSH streams as closed NoteMD failures', async () => {
  const aborted = transformer(() => stream([
    {
      type: 'finish',
      reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled upstream' } },
    },
  ]))
  const malformed = transformer(() => stream([
    { type: 'text-delta', index: 0, text: 'unterminated' },
  ]))

  await expect(aborted.complete({ system: 'system', prompt: 'prompt' })).rejects.toMatchObject({ code: 'LLM_CANCELLED' })
  await expect(malformed.complete({ system: 'system', prompt: 'prompt' })).rejects.toMatchObject({ code: 'LLM_STREAM_MALFORMED' })
})

test('rejects a stream that emits data after its terminal finish', async () => {
  const subject = transformer(() => stream([
    { type: 'finish', reason: { kind: 'stop' } },
    { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } },
  ]))

  await expect(subject.complete({ system: 'system', prompt: 'prompt' })).rejects.toMatchObject({ code: 'LLM_STREAM_MALFORMED' })
})

test('forwards call cancellation to the DSH stream', async () => {
  const controller = new AbortController()
  let observedSignal: AbortSignal | undefined
  const subject = transformer((options) => {
    observedSignal = options.signal
    return (async function* (): AsyncIterable<DshStreamChunk> {
      controller.abort()
      yield { type: 'text-delta', index: 0, text: 'partial' }
      yield {
        type: 'finish',
        reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'cancelled upstream' } },
      }
    })()
  })

  await expect(subject.complete({ system: 'system', prompt: 'prompt', signal: controller.signal })).rejects.toMatchObject({
    code: 'LLM_CANCELLED',
  })
  expect(observedSignal?.aborted).toBe(true)
})

test('rejects invalid route policy before it reaches the DSH runtime', () => {
  const llm: DshLlmRuntime = { stream: () => stream([]) }

  expect(() => new DshTextTransformer(llm, { provider: ' ', model: 'fixture-model' })).toThrow(NotemdLlmError)
})

test('rejects legacy transport fields instead of silently accepting them as route policy', () => {
  const llm: DshLlmRuntime = { stream: () => stream([]) }
  const route = {
    provider: 'fixture-provider',
    model: 'fixture-model',
    endpoint: 'https://provider.example/v1',
  } as unknown as NotemdLlmRoute

  const createTransformer = (): DshTextTransformer => new DshTextTransformer(llm, route)

  expect(createTransformer).toThrow(NotemdLlmError)
  try {
    createTransformer()
  } catch (error) {
    expect(error).toMatchObject({ code: 'LLM_ROUTE_INVALID' })
  }
})

test('aborts active consumers when their owner is disposed', async () => {
  let release: (() => void) | undefined
  let observedSignal: AbortSignal | undefined
  let markStarted: (() => void) | undefined
  const started = new Promise<void>((resolve) => { markStarted = resolve })
  const subject = transformer((options) => {
    observedSignal = options.signal
    return (async function* (): AsyncIterable<DshStreamChunk> {
      markStarted?.()
      await new Promise<void>((resolve) => { release = resolve })
      yield {
        type: 'finish',
        reason: { kind: 'aborted', failure: { code: 'ABORTED', message: 'consumer was disposed' } },
      }
    })()
  })

  const completion = subject.complete({ system: 'system', prompt: 'prompt' })
  await started
  subject.dispose()
  release?.()

  await expect(completion).rejects.toMatchObject({ code: 'LLM_CANCELLED' })
  expect(observedSignal?.aborted).toBe(true)
})
