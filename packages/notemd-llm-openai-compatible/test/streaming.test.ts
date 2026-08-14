import { expect, test } from 'vitest'

import {
  OpenAiCompatibleAdapter,
  type OpenAiCompletionRequest,
  type StreamChunk,
} from '../src/index.js'

const request: OpenAiCompletionRequest = {
  endpoint: 'https://example.test/v1/chat/completions',
  model: 'test-model',
  messages: [{ role: 'user', content: 'Say hello' }],
}

test('emits usage before a single finish for fragmented SSE completion', async () => {
  const fetcher = async () =>
    new Response(
      streamFrom([
        'data: {"choices":[{"delta":{"content":"hel',
        'lo"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ]),
      { headers: { 'content-type': 'text/event-stream' } },
    )
  const adapter = new OpenAiCompatibleAdapter({ fetch: fetcher as typeof fetch })

  await expect(collect(adapter.stream(request))).resolves.toEqual([
    { type: 'text', text: 'hello' },
    { type: 'usage', inputTokens: 3, outputTokens: 2 },
    { type: 'finish', reason: 'stop' },
  ])
})

test('caches only successful non-streaming completions by canonical request', async () => {
  let calls = 0
  const fetcher = async () => {
    calls += 1
    return Response.json({
      model: 'test-model',
      choices: [{ finish_reason: 'stop', message: { content: 'hello' } }],
      usage: { completion_tokens: 2, prompt_tokens: 3 },
    })
  }
  const adapter = new OpenAiCompatibleAdapter({ fetch: fetcher as typeof fetch, cacheTtlMs: 60_000 })

  await expect(adapter.complete(request)).resolves.toMatchObject({ text: 'hello', model: 'test-model' })
  await expect(adapter.complete({ ...request, apiKey: 'different-secret-is-not-part-of-the-cache-key' })).resolves.toMatchObject({
    text: 'hello',
  })
  expect(calls).toBe(1)
})

test('normalizes malformed SSE into a stable error code', async () => {
  const adapter = new OpenAiCompatibleAdapter({
    fetch: (async () =>
      new Response(streamFrom(['data: not-json\n\n', 'data: [DONE]\n\n']), {
        headers: { 'content-type': 'text/event-stream' },
      })) as typeof fetch,
  })

  await expect(collect(adapter.stream(request))).rejects.toMatchObject({ code: 'LLM_STREAM_MALFORMED' })
})

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

function streamFrom(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[index]
      index += 1
      if (chunk === undefined) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunk))
    },
  })
}
