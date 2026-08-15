import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { LocalVault } from '@notemd-harness/vault-local'

import { NotemdWorkflowPlanner, type TextTransformer } from '../src/index.js'

class ScriptedTransformer implements TextTransformer {
  readonly requests: Array<{ system: string; prompt: string }> = []

  constructor(private readonly responses: string[]) {}

  async complete(request: { system: string; prompt: string; signal?: AbortSignal }) {
    this.requests.push({ system: request.system, prompt: request.prompt })
    const text = this.responses.shift()
    if (text === undefined) {
      throw new Error('The test did not configure a completion response.')
    }
    return { text, model: 'test-model' }
  }
}

let workspaceRoot = ''

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-workflows-'))
  await mkdir(join(workspaceRoot, 'notes'))
})

afterEach(async () => {
  await rm(workspaceRoot, { recursive: true, force: true })
})

test('plans Mermaid replacement only inside a mermaid fence', async () => {
  await writeFile(
    join(workspaceRoot, 'notes', 'diagram.md'),
    'outside prose remains unchanged\n\n~~~mermaid\nbroken diagram\n~~~\n\nclosing prose remains unchanged',
  )
  const transformer = new ScriptedTransformer(['flowchart TD\n  A --> B'])
  const workflows = new NotemdWorkflowPlanner(await LocalVault.open(workspaceRoot), transformer)

  const plan = await workflows.planMermaidRepair('notes/diagram.md')

  const mutation = plan.mutations[0]
  expect(mutation).toMatchObject({ kind: 'write-text', destination: 'notes/diagram.md' })
  expect(mutation?.kind === 'write-text' ? mutation.content : '').toContain('~~~mermaid\nflowchart TD\n  A --> B\n~~~')
  expect(mutation?.kind === 'write-text' ? mutation.content : '').toContain('outside prose remains unchanged')
  expect(mutation?.kind === 'write-text' ? mutation.content : '').toContain('closing prose remains unchanged')
  expect(transformer.requests[0]?.prompt).toBe('broken diagram')
})

test('creates a concept note with an absent precondition', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture\n\nAtomic writes are safe.')
  const transformer = new ScriptedTransformer([
    '{"concepts":[{"name":"Atomic Writes","summary":"A replacement becomes visible atomically."}]}',
  ])
  const workflows = new NotemdWorkflowPlanner(await LocalVault.open(workspaceRoot), transformer)

  const plan = await workflows.planConceptExtraction('notes/architecture.md')

  expect(plan.mutations).toContainEqual(
    expect.objectContaining({
      destination: 'concepts/Atomic Writes.md',
      expectedRevision: 'absent',
    }),
  )
  const conceptMutation = plan.mutations[0]
  expect(conceptMutation?.kind === 'write-text' ? conceptMutation.content : '').toContain('A replacement becomes visible atomically.')
})

test('rejects malformed concept extraction responses instead of guessing', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'architecture.md'), '# Architecture')
  const workflows = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer(['CONCEPT: Atomic Writes']),
  )

  await expect(workflows.planConceptExtraction('notes/architecture.md')).rejects.toMatchObject({
    code: 'WORKFLOW_RESPONSE_INVALID',
  })
})

test('uses a non-destructive target for a translation plan', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'source.md'), '# Source\n\nHello')
  const workflows = new NotemdWorkflowPlanner(
    await LocalVault.open(workspaceRoot),
    new ScriptedTransformer(['# Quelle\n\nHallo']),
  )

  const plan = await workflows.planTranslation('notes/source.md', 'de')

  expect(plan.mutations).toEqual([
    expect.objectContaining({
      kind: 'write-text',
      destination: 'translations/de/notes/source.md',
      content: '# Quelle\n\nHallo',
      expectedRevision: 'absent',
    }),
  ])
})

test('binds link, title, and research transformations to the source revision', async () => {
  await writeFile(join(workspaceRoot, 'notes', 'source.md'), '# Source\n\nOriginal text')
  const transformer = new ScriptedTransformer([
    '# Source\n\n[[Atomic Writes]]',
    '# Better Title\n\nOriginal text',
    '# Source\n\nResearch synthesis',
  ])
  const workflows = new NotemdWorkflowPlanner(await LocalVault.open(workspaceRoot), transformer)

  const [links, title, research] = await Promise.all([
    workflows.planWikiLinks('notes/source.md'),
    workflows.planTitleGeneration('notes/source.md'),
    workflows.planResearchSynthesis('notes/source.md', ['https://example.test/source']),
  ])

  expect(links.mutations[0]).toMatchObject({ kind: 'write-text', destination: 'notes/source.md' })
  expect(title.mutations[0]).toMatchObject({ kind: 'write-text', destination: 'notes/source.md' })
  expect(research.mutations[0]).toMatchObject({ kind: 'write-text', destination: 'notes/source.md' })
  expect(
    new Set([
      links.mutations[0]?.expectedRevision,
      title.mutations[0]?.expectedRevision,
      research.mutations[0]?.expectedRevision,
    ]).size,
  ).toBe(1)
})
