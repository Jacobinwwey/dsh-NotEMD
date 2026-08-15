import { expect, test } from 'vitest'

import { createContentSha256, createWorkspaceMutationPlan } from '@notemd-harness/mutation'

import { ConfiguredTextTransformer, DshApprovalGate } from '../src/runtime-adapter.js'

const planProvenance = {
  operationId: 'notemd.test.approval-gate',
  sourceRefs: ['notes/a.md'],
  evidenceRefs: [],
}
const planContent = 'approved content must remain out of approval reasons'
const plan = createWorkspaceMutationPlan({
  provenance: planProvenance,
  mutations: [{
    kind: 'write-text',
    destination: 'notes/a.md',
    expectedRevision: 'absent',
    provenance: planProvenance,
    conflictPolicy: 'reject',
    mediaType: 'text/markdown',
    content: planContent,
    contentSha256: createContentSha256(planContent),
  }],
})

test('fails closed when DSH approval cannot be routed to an agent', async () => {
  const gate = new DshApprovalGate({})

  await expect(gate.request(plan)).resolves.toBe('unavailable')
})

test('routes one plan approval through DSH without exposing planned content', async () => {
  const requests: Array<Record<string, unknown>> = []
  const gate = new DshApprovalGate({
    approval: {
      request: async (request) => {
        requests.push(request)
        return 'allowed-once'
      },
    },
  })

  await expect(gate.request(plan, { agent: { id: 'agent' }, callId: 'call-1' })).resolves.toBe('approved')
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({ callId: 'call-1', toolName: 'notemd_request_plan_approval' })
  expect(JSON.stringify(requests[0])).not.toContain('approved content must remain out of approval reasons')
})

test('does not send an LLM request when the configured key environment variable is absent', async () => {
  let calls = 0
  const transformer = new ConfiguredTextTransformer(
    {
      endpoint: 'https://example.test/v1/chat/completions',
      model: 'test-model',
      apiKeyEnv: 'NOTEMD_TEST_API_KEY',
      timeoutMs: 1_000,
    },
    {
      complete: async () => {
        calls += 1
        return { model: 'test-model', text: 'unexpected' }
      },
    },
    () => undefined,
  )

  await expect(transformer.complete({ system: 'system', prompt: 'prompt' })).rejects.toMatchObject({ code: 'LLM_TRANSPORT' })
  expect(calls).toBe(0)
})

test('reports missing provider credentials as an unavailable diagnostic without transport work', async () => {
  let calls = 0
  const transformer = new ConfiguredTextTransformer(
    {
      endpoint: 'https://example.test/v1/chat/completions?trace=secret-query',
      model: 'test-model',
      apiKeyEnv: 'NOTEMD_TEST_API_KEY',
      timeoutMs: 1_000,
    },
    { complete: async () => ({ model: 'test-model', text: 'unused' }) },
    () => undefined,
  )
  const diagnostics = {
    diagnoseProvider: async () => {
      calls += 1
      return { status: 'available' as const, endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', elapsedMs: 1 }
    },
    discoverModels: async () => {
      calls += 1
      return { status: 'available' as const, endpoint: 'https://example.test/v1/models', models: [{ id: 'test-model' }] }
    },
  }

  const result = await transformer.diagnoseProvider(diagnostics)

  expect(result).toMatchObject({
    status: 'unavailable',
    endpoint: 'https://example.test/v1/chat/completions',
    model: 'test-model',
    error: { code: 'LLM_TRANSPORT', retryable: false },
  })
  expect(JSON.stringify(result)).not.toContain('secret-query')
  expect(calls).toBe(0)
})

test('reports missing provider credentials as unavailable model discovery without transport work', async () => {
  let calls = 0
  const transformer = new ConfiguredTextTransformer(
    {
      endpoint: 'https://example.test/v1/chat/completions?trace=secret-query',
      model: 'test-model',
      apiKeyEnv: 'NOTEMD_TEST_API_KEY',
      timeoutMs: 1_000,
    },
    { complete: async () => ({ model: 'test-model', text: 'unused' }) },
    () => undefined,
  )
  const diagnostics = {
    diagnoseProvider: async () => {
      calls += 1
      return { status: 'available' as const, endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', elapsedMs: 1 }
    },
    discoverModels: async () => {
      calls += 1
      return { status: 'available' as const, endpoint: 'https://example.test/v1/models', models: [{ id: 'test-model' }] }
    },
  }

  const result = await transformer.discoverModels(diagnostics)

  expect(result).toEqual({
    status: 'unavailable',
    endpoint: 'https://example.test/v1/chat/completions',
    reason: 'LLM_TRANSPORT',
  })
  expect(calls).toBe(0)
})

test('reuses the configured provider credentials for diagnostics and model discovery', async () => {
  const requests: Array<Record<string, unknown>> = []
  const transformer = new ConfiguredTextTransformer(
    {
      endpoint: 'https://example.test/v1/chat/completions',
      model: 'test-model',
      apiKeyEnv: 'NOTEMD_TEST_API_KEY',
      timeoutMs: 1_000,
      modelsEndpoint: 'https://example.test/v1/models',
    },
    { complete: async () => ({ model: 'test-model', text: 'unused' }) },
    () => 'secret-token',
  )
  const diagnostics = {
    diagnoseProvider: async (request: Record<string, unknown>) => {
      requests.push(request)
      return { status: 'available' as const, endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', elapsedMs: 1 }
    },
    discoverModels: async (request: Record<string, unknown>) => {
      requests.push(request)
      return { status: 'available' as const, endpoint: 'https://example.test/v1/models', models: [{ id: 'test-model' }] }
    },
  }

  await transformer.diagnoseProvider(diagnostics)
  await transformer.discoverModels(diagnostics)

  expect(requests).toEqual([
    expect.objectContaining({ apiKey: 'secret-token', endpoint: 'https://example.test/v1/chat/completions', model: 'test-model' }),
    expect.objectContaining({ apiKey: 'secret-token', endpoint: 'https://example.test/v1/chat/completions', modelsEndpoint: 'https://example.test/v1/models' }),
  ])
})
