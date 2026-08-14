import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import { NotemdWorkflowPlanner, type TextTransformer } from '../src/index.js'

class UnusedTransformer implements TextTransformer {
  async complete(): Promise<{ text: string; model: string }> {
    throw new Error('Formula repair must not call the transformer.')
  }
}

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-formulas-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('plans deterministic LaTeX delimiter normalization without an LLM', async () => {
  await writeFile(
    join(workspaceRoot, 'notes', 'formula.md'),
    'Inline \\(x + y\\) and display:\n\\[a = b\\]',
  )
  const workflows = new NotemdWorkflowPlanner(await LocalVault.open(workspaceRoot), new UnusedTransformer())

  const plan = await workflows.planFormulaRepair('notes/formula.md')

  expect(plan.writes[0]?.content).toBe('Inline $x + y$ and display:\n$$\na = b\n$$')
})
