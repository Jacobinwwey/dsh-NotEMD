import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { DurableWorkflowRunner, FileJobStore } from '../src/index.js'

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-durable-jobs-'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('recovers interrupted work and executes only targets without checkpoints', async () => {
  const store = await FileJobStore.open(workspaceRoot)
  const job = await store.start({
    workflow: 'formula-repair',
    idempotencyKey: 'formula:notes',
    input: {},
    targets: ['notes/a.md', 'notes/b.md'],
  })
  await store.markRunning(job.id)
  await store.recordTargetCheckpoint(job.id, {
    target: 'notes/a.md',
    status: 'completed',
    checkpoint: { planId: 'notemd-plan-existing' },
  })
  await store.recoverInterrupted()
  const executed: string[] = []
  const runner = new DurableWorkflowRunner(store, {
    workflow: 'formula-repair',
    async execute(_input, target) {
      executed.push(target)
      return { target, status: 'completed', checkpoint: { planId: `notemd-plan-${target}` } }
    },
  })

  const completed = await runner.resume(job.id)

  expect(executed).toEqual(['notes/b.md'])
  expect(completed).toMatchObject({ state: 'completed', attempt: 2 })
  expect(completed.results).toEqual([
    { target: 'notes/a.md', status: 'completed', checkpoint: { planId: 'notemd-plan-existing' } },
    { target: 'notes/b.md', status: 'completed', checkpoint: { planId: 'notemd-plan-notes/b.md' } },
  ])
})

test('records cancellation after active targets settle', async () => {
  const store = await FileJobStore.open(workspaceRoot)
  const job = await store.start({
    workflow: 'formula-repair',
    idempotencyKey: 'formula:cancel',
    input: {},
    targets: ['notes/a.md'],
  })
  const controller = new AbortController()
  let started!: () => void
  const startedExecution = new Promise<void>((resolve) => {
    started = resolve
  })
  const runner = new DurableWorkflowRunner(store, {
    workflow: 'formula-repair',
    async execute(_input, target, signal) {
      started()
      await new Promise<void>((resolve) => signal.addEventListener('abort', resolve, { once: true }))
      return { target, status: 'completed' }
    },
  })

  const running = runner.resume(job.id, controller.signal)
  await startedExecution
  await store.cancel(job.id)
  controller.abort()

  await expect(running).resolves.toMatchObject({
    state: 'cancelled',
    results: [{ target: 'notes/a.md', status: 'cancelled' }],
  })
})
