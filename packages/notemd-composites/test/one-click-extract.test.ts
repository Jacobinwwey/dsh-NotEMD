import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'
import {
  NotemdWorkflowPlanner,
  type TextTransformer,
} from '@notemd-harness/workflows'

import {
  createOneClickExtractDefinition,
  planOneClickExtract,
} from '../src/index.js'

class ScriptedTransformer implements TextTransformer {
  constructor(private readonly responses: string[]) {}

  async complete() {
    const response = this.responses.shift()
    if (response === undefined) {
      throw new Error('The test did not configure a completion response.')
    }
    return { text: response, model: 'one-click-fixture-model' }
  }
}

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-one-click-'))
  await mkdir(join(workspaceRoot, 'notes'), { recursive: true })
  await mkdir(join(workspaceRoot, 'concepts'), { recursive: true })
  await mkdir(join(workspaceRoot, 'completed'), { recursive: true })
  await writeFile(join(workspaceRoot, 'notes', 'source.md'), '# Source\n\nOriginal context')
  await writeFile(join(workspaceRoot, 'concepts', 'alpha.md'), '# Alpha\n\nTitle')
  await writeFile(join(workspaceRoot, 'concepts', 'beta.md'), '# Beta\n\nTitle')
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('has a stable ordered definition and fixed fail-fast policy', () => {
  const definition = createOneClickExtractDefinition()

  expect(definition.id).toBe('one-click-extract')
  expect(definition.version).toBe(1)
  expect(definition.failurePolicy).toBe('fail-fast')
  expect(definition.steps.map((step) => step.id)).toEqual([
    'add-links',
    'generate-complete',
    'repair-mermaid',
  ])
  expect(definition.definitionDigest).toBe('66f0e111d94d98cec3bab1b00f7c8f72ab096c0a0a69d94061e2ac88c6e7ac4c')
})

test('plans all three steps through one virtual workspace and one aggregate plan', async () => {
  const transformer = new ScriptedTransformer([
    '# Source\n\n[[Atomic Writes]]',
    '# Alpha Complete\n\n~~~mermaid\nflowchart TD\n  Plan -- Approval\n~~~',
    '# Beta Complete\n\nGenerated beta.',
    'flowchart TD\n  Plan --> Approval',
  ])
  const vault = await LocalVault.open(workspaceRoot)

  const plan = await planOneClickExtract(
    {
      sourcePath: 'notes/source.md',
      conceptFolderPath: 'concepts',
      completedFolderPath: 'completed',
      mermaidFolderPath: 'completed',
      mermaidErrorFolderPath: 'mermaid-errors',
    },
    {
      vault,
      createPlanner: (scopedVault) => new NotemdWorkflowPlanner(scopedVault, transformer),
    },
  )

  expect(plan.version).toBe(1)
  expect(plan.provenance.operationId).toBe('workflow.one-click-extract')
  expect(plan.mutations.map((mutation) => mutation.destination)).toEqual([
    'completed/alpha.md',
    'completed/beta.md',
    'concepts/alpha.md',
    'concepts/beta.md',
    'notes/source.md',
  ])
  expect(plan.mutations.every((mutation) => mutation.provenance.composite?.workflowId === 'one-click-extract')).toBe(true)
  expect(plan.mutations.find((mutation) => mutation.destination === 'completed/alpha.md')?.provenance.composite).toMatchObject({
    stepId: 'repair-mermaid',
    ordinal: 2,
  })
})

test('passes the completion budget guard to every LLM request in the composite', async () => {
  const transformer = new ScriptedTransformer([
    '# Source\n\n[[Atomic Writes]]',
    '# Alpha Complete\n\nGenerated alpha.',
    '# Beta Complete\n\nGenerated beta.',
  ])
  const vault = await LocalVault.open(workspaceRoot)
  let guardChecks = 0

  await planOneClickExtract(
    {
      sourcePath: 'notes/source.md',
      conceptFolderPath: 'concepts',
      completedFolderPath: 'completed',
      mermaidFolderPath: 'completed',
    },
    {
      vault,
      createPlanner: (scopedVault, beforeCompletion) => new NotemdWorkflowPlanner(
        scopedVault,
        transformer,
        (request) => {
          guardChecks += 1
          beforeCompletion?.(request)
        },
      ),
    },
  )

  expect(guardChecks).toBe(3)
})

test('fails closed before planning when the caller signal is already aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const vault = await LocalVault.open(workspaceRoot)

  await expect(planOneClickExtract(
    {
      sourcePath: 'notes/source.md',
      conceptFolderPath: 'concepts',
      completedFolderPath: 'completed',
      mermaidFolderPath: 'completed',
    },
    {
      vault,
      createPlanner: (scopedVault) => new NotemdWorkflowPlanner(scopedVault, new ScriptedTransformer([])),
    },
    controller.signal,
  )).rejects.toMatchObject({ code: 'composite-cancelled' })
})
