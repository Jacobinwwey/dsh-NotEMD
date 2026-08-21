import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import { createContentSha256 } from '@notemd-harness/mutation'
import { LocalVault } from '@notemd-harness/vault-local'
import {
  createOneClickExtractDefinition,
  planOneClickExtract,
} from '@notemd-harness/composites'
import type { OneClickExtractRequest } from '@notemd-harness/composites'
import {
  NotemdWorkflowPlanner,
  type TextTransformer,
} from '@notemd-harness/workflows'
import { FileApprovalLedger } from '@notemd-harness/tools'
import {
  registerNotemdTools,
  type NotemdToolContext,
} from '@notemd-harness/tools'
import type { ToolRegistrationSpec } from '@notemd-harness/tools'

let workspaceRoot = ''

class ScriptedTransformer implements TextTransformer {
  constructor(private readonly responses: string[]) {}

  async complete() {
    const response = this.responses.shift()
    if (response === undefined) {
      throw new Error('Composite approval fixture exhausted its LLM responses.')
    }
    return { text: response, model: 'composite-approval-fixture' }
  }
}

beforeEach(async () => {
  workspaceRoot = await mkdtemp(join(tmpdir(), 'notemd-composite-approval-'))
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

function request() {
  return {
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    mermaidErrorFolderPath: 'mermaid-errors',
  }
}

async function setup(responses: readonly string[]) {
  const vault = await LocalVault.open(workspaceRoot)
  const transformer = new ScriptedTransformer([...responses])
  const approvalLedger = await FileApprovalLedger.open(workspaceRoot, { ttlMs: 300_000 })
  const events: unknown[] = []
  const registered: ToolRegistrationSpec[] = []
  const composite = {
    definition: createOneClickExtractDefinition,
    planOneClickExtract: (input: OneClickExtractRequest, signal?: AbortSignal) => planOneClickExtract(
      input,
      {
        vault,
        createPlanner: (scopedVault) => new NotemdWorkflowPlanner(scopedVault, transformer),
      },
      signal,
    ),
  }
  const context = {
    tools: {
      register(tool: ToolRegistrationSpec) {
        registered.push(tool)
      },
    },
    notemdVault: vault,
    notemdJobs: {},
    notemdWorkspaceChanges: {
      recordMutationReceipt: async (plan: { readonly id: string; readonly mutations: readonly unknown[] }) => {
        events.push(plan)
        return {
          id: 'notemd-composite-change-1',
          occurredAt: '2026-08-21T00:00:00.000Z',
          origin: 'notemd-mutation-receipt',
          causationId: plan.id,
          changes: plan.mutations.map((_, index) => ({
            path: 'composite/' + index + '.md',
            kind: 'updated',
            revision: createContentSha256(String(index)),
          })),
        }
      },
    },
    notemdKnowledge: {},
    notemdTextTransformer: {},
    notemdWorkflows: {},
    notemdCompositeWorkflows: composite,
    notemdResearch: {},
    notemdArtifacts: {},
    notemdApprovalLedger: approvalLedger,
    notemdApprovalGate: {
      request: async () => 'approved',
    },
  } as unknown as NotemdToolContext

  registerNotemdTools(context, (tool) => tool)
  return { vault, registered, events }
}

function toolByName(registered: readonly ToolRegistrationSpec[], name: string): ToolRegistrationSpec {
  const tool = registered.find((candidate) => candidate.name === name)
  if (tool === undefined) {
    throw new Error('Missing Tool: ' + name)
  }
  return tool
}

async function isPresent(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

test('uses one aggregate approval receipt and one committed workspace event', async () => {
  const { registered, events } = await setup([
    '# Source\n\n[[Atomic Writes]]',
    '# Alpha Complete\n\nGenerated alpha.',
    '# Beta Complete\n\nGenerated beta.',
  ])
  const planTool = toolByName(registered, 'notemd_plan_one_click_extract')
  const approvalTool = toolByName(registered, 'notemd_request_plan_approval')
  const applyTool = toolByName(registered, 'notemd_apply_approved_plan')
  const planned = await planTool.execute(request()) as { readonly status: string; readonly plan: Record<string, unknown> }

  expect(planned.status).toBe('success')
  expect(await isPresent(join(workspaceRoot, 'completed', 'alpha.md'))).toBe(false)
  expect(await readFile(join(workspaceRoot, 'concepts', 'alpha.md'), 'utf8')).toContain('# Alpha')

  const approval = await approvalTool.execute({ plan: planned.plan }) as { readonly approvalId: string }
  const applied = await applyTool.execute({ plan: planned.plan, approvalId: approval.approvalId }) as {
    readonly status: string
    readonly receipt: { readonly status: string }
  }
  expect(applied).toMatchObject({ status: 'success', receipt: { status: 'committed' } })
  expect(events).toHaveLength(1)

  await expect(applyTool.execute({ plan: planned.plan, approvalId: approval.approvalId })).resolves.toMatchObject({
    status: 'rejected',
    code: 'approval-receipt-invalid',
  })
  expect(events).toHaveLength(1)
  expect(await readFile(join(workspaceRoot, 'completed', 'alpha.md'), 'utf8')).toContain('# Alpha Complete')
})

test('fails closed on a stale source revision without publishing a workspace event', async () => {
  const { registered, events } = await setup([
    '# Source\n\n[[Atomic Writes]]',
    '# Alpha Complete\n\nGenerated alpha.',
    '# Beta Complete\n\nGenerated beta.',
  ])
  const planTool = toolByName(registered, 'notemd_plan_one_click_extract')
  const approvalTool = toolByName(registered, 'notemd_request_plan_approval')
  const applyTool = toolByName(registered, 'notemd_apply_approved_plan')
  const planned = await planTool.execute(request()) as { readonly plan: Record<string, unknown> }

  await writeFile(join(workspaceRoot, 'notes', 'source.md'), '# Source\n\nManual update')
  const approval = await approvalTool.execute({ plan: planned.plan }) as { readonly approvalId: string }
  const applied = await applyTool.execute({ plan: planned.plan, approvalId: approval.approvalId }) as {
    readonly status: string
    readonly receipt: { readonly status: string }
  }

  expect(applied).toMatchObject({ status: 'conflict', receipt: { status: 'conflict' } })
  expect(events).toHaveLength(0)
  expect(await readFile(join(workspaceRoot, 'notes', 'source.md'), 'utf8')).toContain('Manual update')
})
