import { expect, test } from 'vitest'

import { OpenAiCompatibleAdapter } from '../src/index.js'

test('reports a successful provider diagnostic without exposing credentials or completion text', async () => {
  const adapter = new OpenAiCompatibleAdapter({
    fetch: (async () => Response.json({
      model: 'test-model',
      choices: [{ message: { content: 'private completion text' } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    })) as typeof fetch,
    now: () => 100,
  })

  const result = await adapter.diagnoseProvider({
    endpoint: 'https://example.test/v1/chat/completions?trace=secret-query',
    model: 'test-model',
    apiKey: 'secret-token',
    timeoutMs: 1_000,
  })

  expect(result).toEqual({
    status: 'available',
    endpoint: 'https://example.test/v1/chat/completions',
    model: 'test-model',
    elapsedMs: 0,
    usage: { inputTokens: 3, outputTokens: 2 },
  })
  expect(JSON.stringify(result)).not.toContain('secret')
  expect(JSON.stringify(result)).not.toContain('private completion text')
})

test('derives a standard models endpoint and reports unavailable discovery without response bodies', async () => {
  const requestedUrls: string[] = []
  const adapter = new OpenAiCompatibleAdapter({
    fetch: (async (input) => {
      requestedUrls.push(String(input))
      return Response.json({ data: [{ id: 'test-model', owned_by: 'example' }, { id: 42 }] })
    }) as typeof fetch,
  })

  await expect(adapter.discoverModels({
    endpoint: 'https://example.test/v1/chat/completions?trace=secret-query',
    model: 'test-model',
    apiKey: 'secret-token',
  })).resolves.toEqual({
    status: 'available',
    endpoint: 'https://example.test/v1/models',
    models: [{ id: 'test-model', ownedBy: 'example' }],
  })
  expect(requestedUrls).toEqual(['https://example.test/v1/models'])

  const unavailable = await new OpenAiCompatibleAdapter({
    fetch: (async () => new Response('secret provider body', { status: 404 })) as typeof fetch,
  }).discoverModels({
    endpoint: 'https://example.test/v1/chat/completions',
    model: 'test-model',
    apiKey: 'secret-token',
  })

  expect(unavailable).toEqual({
    status: 'unavailable',
    endpoint: 'https://example.test/v1/models',
    reason: 'LLM_HTTP',
  })
  expect(JSON.stringify(unavailable)).not.toContain('secret')
})
