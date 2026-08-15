import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { BoundedJobRunner, FileJobStore } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-jobs-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('returns the original persisted record for the same idempotency key', async () => {
  const jobs = await FileJobStore.open(workspaceRoot)
  const input = { language: 'Chinese', operation: 'translate' }
  const first = await jobs.start({
    workflow: 'translation',
    idempotencyKey: 'translate:notes/a.md:de',
    input,
    targets: ['notes/a.md'],
  })
  input.language = 'mutated after submission'

  const second = await jobs.start({
    workflow: 'translation',
    idempotencyKey: 'translate:notes/a.md:de',
    input: { language: 'German', operation: 'translate' },
    targets: ['notes/a.md'],
  })
  const reloaded = await FileJobStore.open(workspaceRoot)
  const afterReload = await reloaded.start({
    workflow: 'translation',
    idempotencyKey: 'translate:notes/a.md:de',
    input: { language: 'German', operation: 'translate' },
    targets: ['notes/a.md'],
  })

  expect(second.id).toBe(first.id)
  expect(afterReload.id).toBe(first.id)
  expect(first.input).toEqual({ language: 'Chinese', operation: 'translate' })
})

test('caps active target executions at its configured concurrency', async () => {
  const runner = new BoundedJobRunner(2)
  let active = 0
  let peak = 0

  const results = await runner.run(['a.md', 'b.md', 'c.md', 'd.md'], async ({ target }) => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise<void>((resolve) => setTimeout(resolve, 10))
    active -= 1
    return { target, status: 'completed' }
  })

  expect(peak).toBe(2)
  expect(results).toEqual([
    { target: 'a.md', status: 'completed' },
    { target: 'b.md', status: 'completed' },
    { target: 'c.md', status: 'completed' },
    { target: 'd.md', status: 'completed' },
  ])
})

test('marks unstarted work as cancelled and forwards the abort signal', async () => {
  const controller = new AbortController()
  const runner = new BoundedJobRunner(1)
  const observedSignals: AbortSignal[] = []

  const results = await runner.run(
    ['a.md', 'b.md', 'c.md'],
    async ({ target, signal }) => {
      observedSignals.push(signal)
      controller.abort()
      return { target, status: 'completed' }
    },
    controller.signal,
  )

  expect(observedSignals).toEqual([controller.signal])
  expect(results).toEqual([
    { target: 'a.md', status: 'cancelled' },
    { target: 'b.md', status: 'cancelled' },
    { target: 'c.md', status: 'cancelled' },
  ])
})
