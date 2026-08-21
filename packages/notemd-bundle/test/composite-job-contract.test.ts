import { readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, expect, test } from 'vitest'

import { FileJobStore } from '@notemd-harness/jobs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
let workspaceRoot = ''

afterEach(async () => {
  if (workspaceRoot.length > 0) {
    await rm(workspaceRoot, { recursive: true, force: true })
    workspaceRoot = ''
  }
})

test('persists a versioned composite workflow identity in the existing job store contract', async () => {
  workspaceRoot = await mkdtemp(join(process.env.TEMP ?? 'E:/temp', 'notemd-composite-job-'))
  await mkdir(workspaceRoot, { recursive: true })
  const store = await FileJobStore.open(workspaceRoot)
  const job = await store.start({
    workflow: 'one-click-extract-v1',
    idempotencyKey: 'one-click-extract:fixture',
    input: {
      workflowId: 'one-click-extract',
      workflowVersion: 1,
      definitionDigest: '66f0e111d94d98cec3bab1b00f7c8f72ab096c0a0a69d94061e2ac88c6e7ac4c',
      sourcePath: 'notes/source.md',
      conceptFolderPath: 'concepts',
      completedFolderPath: 'completed',
      mermaidFolderPath: 'completed',
    },
    targets: ['notes/source.md'],
  })

  expect(job.workflow).toBe('one-click-extract-v1')
  expect(job.targets).toEqual(['notes/source.md'])
  expect(job.input).toMatchObject({
    workflowId: 'one-click-extract',
    workflowVersion: 1,
    definitionDigest: '66f0e111d94d98cec3bab1b00f7c8f72ab096c0a0a69d94061e2ac88c6e7ac4c',
  })
  expect(job.input).not.toHaveProperty('prompt')
  expect(job.input).not.toHaveProperty('endpoint')
})

test('keeps the durable executor keyed to the valid kebab-case workflow identity', () => {
  const source = readFileSync(join(packageDirectory, 'src', 'jobs.ts'), 'utf8')

  expect(source).toContain("export const ONE_CLICK_EXTRACT_JOB_WORKFLOW = 'one-click-extract-v1'")
  expect(source).toContain('JOB_WORKFLOW_MISMATCH')
  expect(source).toContain('definitionDigest')
})
