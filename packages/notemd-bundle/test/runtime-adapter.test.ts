import { expect, test } from 'vitest'

import { createWritePlan } from '@notemd-harness/vault'

import { ConfiguredTextTransformer, DshApprovalGate } from '../src/runtime-adapter.js'

const plan = createWritePlan([
  { path: 'notes/a.md', content: 'approved content must remain out of approval reasons', expectedRevision: 'absent' },
])

test('fails closed when DSH approval cannot be routed to an agent', async () => {
  const gate = new DshApprovalGate({})

  await expect(gate.request(plan)).resolves.toBe(false)
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

  await expect(gate.request(plan, { agent: { id: 'agent' }, callId: 'call-1' })).resolves.toBe(true)
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
