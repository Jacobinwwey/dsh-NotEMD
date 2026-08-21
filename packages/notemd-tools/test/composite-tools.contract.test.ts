import { expect, test } from 'vitest'

import {
  createContentSha256,
  createWorkspaceMutationPlan,
} from '@notemd-harness/mutation'
import {
  registerNotemdTools,
  type NotemdToolContext,
} from '../src/index.js'
import type { ToolRegistrationSpec } from '../src/tool-contract.js'
import { mutationPlanFrom } from '../src/mutation-plan.js'

const plan = createWorkspaceMutationPlan({
  provenance: {
    operationId: 'workflow.one-click-extract',
    sourceRefs: ['notes/source.md'],
    evidenceRefs: [],
  },
  mutations: [{
    kind: 'write-text',
    destination: 'notes/source.md',
    expectedRevision: createContentSha256('before'),
    provenance: {
      operationId: 'workflow.one-click-extract',
      sourceRefs: ['notes/source.md'],
      evidenceRefs: [],
    },
    conflictPolicy: 'reject',
    mediaType: 'text/markdown',
    content: '# Source\n',
    contentSha256: createContentSha256('# Source\n'),
  }],
})

function registerFixture() {
  const registered: ToolRegistrationSpec[] = []
  const jobRequests: unknown[] = []
  const context = {
    tools: {
      register(tool: ToolRegistrationSpec) {
        registered.push(tool)
      },
    },
    notemdVault: {},
    notemdJobs: {
      startOneClickExtract: async (request: unknown) => {
        jobRequests.push(request)
        return {
          id: 'job-composite',
          workflow: 'one-click-extract-v1',
          state: 'queued',
          targets: ['notes/source.md'],
          attempt: 0,
          results: [],
          createdAt: '2026-08-21T00:00:00.000Z',
          updatedAt: '2026-08-21T00:00:00.000Z',
        }
      },
    },
    notemdWorkspaceChanges: {},
    notemdKnowledge: {},
    notemdTextTransformer: {},
    notemdWorkflows: {},
    notemdCompositeWorkflows: {
      definition: () => ({
        id: 'one-click-extract',
        version: 1,
        failurePolicy: 'fail-fast',
        definitionDigest: createContentSha256('one-click-extract@1'),
        steps: [],
      }),
      planOneClickExtract: async () => plan,
    },
    notemdResearch: {},
    notemdArtifacts: {},
    notemdApprovalLedger: {},
    notemdApprovalGate: {},
  } as unknown as NotemdToolContext

  registerNotemdTools(context, (tool) => tool)
  return { registered, jobRequests }
}

function toolByName(registered: readonly ToolRegistrationSpec[], name: string): ToolRegistrationSpec {
  const tool = registered.find((candidate) => candidate.name === name)
  if (tool === undefined) {
    throw new Error('Missing tool: ' + name)
  }
  return tool
}

test('registers named plan and durable job tools with closed entry points', () => {
  const { registered } = registerFixture()
  const names = registered.map((tool) => tool.name)

  expect(names).toContain('notemd_plan_one_click_extract')
  expect(names).toContain('notemd_job_start_one_click_extract')
  expect(names).not.toContain('notemd_run')
  expect(toolByName(registered, 'notemd_plan_one_click_extract').parameters).toMatchObject({
    sourcePath: { required: true },
    completedFolderPath: { required: true },
  })
})

test('rejects unknown composite request fields at the Tool edge', async () => {
  const { registered } = registerFixture()
  const tool = toolByName(registered, 'notemd_plan_one_click_extract')

  await expect(tool.execute({
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    unexpected: true,
  })).resolves.toMatchObject({ status: 'rejected', code: 'invalid-input' })
})

test('plans through the named composite service and starts a job without raw prompt fields', async () => {
  const { registered, jobRequests } = registerFixture()
  const planTool = toolByName(registered, 'notemd_plan_one_click_extract')
  const jobTool = toolByName(registered, 'notemd_job_start_one_click_extract')
  const request = {
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    mermaidErrorFolderPath: 'mermaid-errors',
  }

  await expect(planTool.execute(request)).resolves.toMatchObject({ status: 'success', plan })
  await expect(jobTool.execute({
    ...request,
    idempotencyKey: 'composite-job-1',
  })).resolves.toMatchObject({
    status: 'success',
    job: { id: 'job-composite', workflow: 'one-click-extract-v1' },
  })
  expect(jobRequests).toEqual([{ ...request, idempotencyKey: 'composite-job-1' }])
  expect(JSON.stringify(jobRequests)).not.toContain('prompt')
})

test('round-trips composite provenance through the Tool mutation boundary without changing its digest', () => {
  const compositePlan = createWorkspaceMutationPlan({
    provenance: {
      operationId: 'workflow.one-click-extract',
      sourceRefs: ['notes/source.md'],
      evidenceRefs: [],
      composite: {
        workflowId: 'one-click-extract',
        workflowVersion: 1,
        definitionDigest: createContentSha256('one-click-extract@1'),
        stepId: 'add-links',
        ordinal: 0,
      },
    },
    mutations: [{
      kind: 'write-text',
      destination: 'notes/source.md',
      expectedRevision: createContentSha256('before'),
      provenance: {
        operationId: 'file.process-add-links',
        sourceRefs: ['notes/source.md'],
        evidenceRefs: [],
        composite: {
          workflowId: 'one-click-extract',
          workflowVersion: 1,
          definitionDigest: createContentSha256('one-click-extract@1'),
          stepId: 'add-links',
          ordinal: 0,
        },
      },
      conflictPolicy: 'reject',
      mediaType: 'text/markdown',
      content: '# Source\n',
      contentSha256: createContentSha256('# Source\n'),
    }],
  })

  const roundTripped = mutationPlanFrom({ plan: compositePlan })
  expect(roundTripped).toEqual(compositePlan)
  expect(roundTripped.digest).toBe(compositePlan.digest)
})
