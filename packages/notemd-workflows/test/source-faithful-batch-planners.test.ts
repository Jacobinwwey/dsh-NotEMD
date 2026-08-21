import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import {
  NotemdWorkflowPlanner,
  type TextTransformer,
} from '../src/index.js'

class ScriptedTransformer implements TextTransformer {
  constructor(private readonly responses: string[]) {}

  async complete() {
    const response = this.responses.shift()
    if (response === undefined) {
      throw new Error('The test did not configure a completion response.')
    }
    return { text: response, model: 'composite-fixture-model' }
  }
}

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(process.env.TEMP ?? 'E:/temp', 'notemd-composite-planner-'))
  await mkdir(join(workspaceRoot, 'concepts'), { recursive: true })
  await mkdir(join(workspaceRoot, 'completed'), { recursive: true })
  await mkdir(join(workspaceRoot, 'mermaid'), { recursive: true })
  await writeFile(join(workspaceRoot, 'concepts', 'alpha.md'), '# Alpha\n\nTitle note')
  await writeFile(join(workspaceRoot, 'concepts', 'beta.md'), '# Beta\n\nTitle note')
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('writes generated title output to completedFolderPath and removes the source copy', async () => {
  const planner = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer([
      '# Alpha Complete\n\nGenerated alpha.',
      '# Beta Complete\n\nGenerated beta.',
    ]),
  )

  const plan = await planner.planBatchTitleGeneration('concepts', 'completed')

  expect(plan?.mutations.map((mutation) => mutation.destination)).toEqual([
    'completed/alpha.md',
    'completed/beta.md',
    'concepts/alpha.md',
    'concepts/beta.md',
  ])
  expect(plan?.mutations.filter((mutation) => mutation.kind === 'delete')).toHaveLength(2)
  expect(plan?.mutations.filter((mutation) => mutation.kind === 'write-text')).toHaveLength(2)
})

test('rejects a pre-existing completed destination before proposing writes', async () => {
  await writeFile(join(workspaceRoot, 'completed', 'alpha.md'), '# Existing')
  const planner = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer(['# Should not be called']),
  )

  await expect(planner.planBatchTitleGeneration('concepts', 'completed')).rejects.toMatchObject({
    code: 'WORKFLOW_DESTINATION_COLLISION',
  })
})

test('rejects malformed generated Markdown instead of guessing a destination', async () => {
  const planner = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer(['not Markdown']),
  )

  await expect(planner.planBatchTitleGeneration('concepts', 'completed')).rejects.toMatchObject({
    code: 'WORKFLOW_RESPONSE_INVALID',
  })
})

test('reports unresolved Mermaid files and emits an error-folder move', async () => {
  await writeFile(join(workspaceRoot, 'completed', 'alpha.md'), [
    '# Alpha',
    '',
    '~~~mermaid',
    'flowchart TD',
    '  Plan -- Approval',
    '~~~',
  ].join('\n'))
  const planner = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer(['flowchart TD\n  Plan -- Approval']),
  )

  const plan = await planner.planBatchMermaidRepair('completed', 'mermaid-errors')

  expect(plan?.mutations.map((mutation) => mutation.destination)).toEqual([
    'completed/alpha.md',
    'mermaid-errors/alpha.md',
    'mermaid-errors/report.md',
  ])
  expect(plan?.mutations.find((mutation) => mutation.destination === 'mermaid-errors/report.md')).toMatchObject({
    kind: 'write-text',
  })
})

test('rejects duplicate Mermaid error destinations before aggregating mutations', async () => {
  await mkdir(join(workspaceRoot, 'mermaid', 'nested'), { recursive: true })
  await writeFile(join(workspaceRoot, 'mermaid', 'alpha.md'), [
    '# Alpha',
    '',
    '~~~mermaid',
    'invalid alpha diagram',
    '~~~',
  ].join('\n'))
  await writeFile(join(workspaceRoot, 'mermaid', 'nested', 'alpha.md'), [
    '# Nested Alpha',
    '',
    '~~~mermaid',
    'invalid nested diagram',
    '~~~',
  ].join('\n'))
  const planner = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer([
      'still invalid alpha diagram',
      'still invalid nested diagram',
    ]),
  )

  await expect(planner.planBatchMermaidRepair('mermaid', 'mermaid-errors')).rejects.toMatchObject({
    code: 'WORKFLOW_DESTINATION_COLLISION',
  })
})
