import { expect, test } from 'vitest'

import { createWritePlan, type WritePlan } from '@notemd-harness/vault'

import { registerNotemdTools, type ToolRegistrationSpec } from '../src/index.js'

test('registers authority-separated read, plan, write, artifact, and job tools', async () => {
  const registered: ToolRegistrationSpec[] = []
  const plan = createWritePlan([{ path: 'notes/a.md', content: 'translated', expectedRevision: 'rev-a' }])
  let appliedPlan: WritePlan | undefined
  const approvals = new Map<string, WritePlan>()
  let approvalNumber = 0

  registerNotemdTools(
    {
      tools: { register: (tool) => registered.push(tool) },
      notemdVault: {
        listMarkdown: async () => ['notes/a.md'],
        read: async (path) => ({ path, content: '# A', revision: 'rev-a' }),
        apply: async (candidate) => {
          appliedPlan = candidate
          return [{ path: 'notes/a.md', status: 'updated', revision: 'rev-b' }]
        },
      },
      notemdWorkflows: {
        planWikiLinks: async () => plan,
        planTranslation: async () => plan,
        planTitleGeneration: async () => plan,
        planResearchSynthesis: async () => plan,
        planConceptExtraction: async () => plan,
        planMermaidRepair: async () => plan,
        planFormulaRepair: async () => plan,
      },
      notemdArtifacts: { planDiagram: () => plan, planCleanup: async () => [] },
      notemdJobs: {
        get: async () => undefined,
        cancel: async () => ({ id: 'job', state: 'cancelled' }),
      },
      notemdApprovalLedger: {
        issue: async (candidate) => {
          const approvalId = `approval-${++approvalNumber}`
          approvals.set(approvalId, candidate)
          return { approvalId, digest: candidate.digest, planId: candidate.id }
        },
        consume: async (candidate, approvalId) => approvals.get(approvalId)?.digest === candidate.digest,
      },
      notemdApprovalGate: {
        request: async () => true,
      },
    },
    (tool) => tool,
  )

  const toolNames = registered.map((tool) => tool.name)
  expect(toolNames).toContain('notemd_workspace_read')
  expect(toolNames).toContain('notemd_plan_translation')
  expect(toolNames).toContain('notemd_request_plan_approval')
  expect(toolNames).toContain('notemd_apply_approved_plan')
  expect(toolNames).toContain('notemd_artifact_cleanup')
  expect(toolNames).toContain('notemd_job_status')
  expect(toolNames).not.toContain('notemd_run')

  const planTool = registered.find((tool) => tool.name === 'notemd_plan_translation')
  const approvalTool = registered.find((tool) => tool.name === 'notemd_request_plan_approval')
  const applyTool = registered.find((tool) => tool.name === 'notemd_apply_approved_plan')
  if (planTool === undefined || approvalTool === undefined || applyTool === undefined) {
    throw new Error('Required Notemd tools were not registered.')
  }

  await expect(planTool.execute({ language: 'de', path: 'notes/a.md' })).resolves.toMatchObject({ plan })
  const approval = await approvalTool.execute({ plan })
  await expect(applyTool.execute({ approvalId: approval.approvalId, plan })).resolves.toMatchObject({
    results: [{ status: 'updated' }],
  })
  expect(appliedPlan).toEqual(plan)
})

test('rejects an unapproved plan before it reaches the vault', async () => {
  const registered: ToolRegistrationSpec[] = []
  const plan = createWritePlan([{ path: 'notes/a.md', content: 'translated', expectedRevision: 'rev-a' }])
  let applyCalls = 0
  let receiptCalls = 0

  registerNotemdTools(
    {
      tools: { register: (tool) => registered.push(tool) },
      notemdVault: {
        listMarkdown: async () => ['notes/a.md'],
        read: async (path) => ({ path, content: '# A', revision: 'rev-a' }),
        apply: async () => {
          applyCalls += 1
          return []
        },
      },
      notemdWorkflows: {
        planWikiLinks: async () => plan,
        planTranslation: async () => plan,
        planTitleGeneration: async () => plan,
        planResearchSynthesis: async () => plan,
        planConceptExtraction: async () => plan,
        planMermaidRepair: async () => plan,
        planFormulaRepair: async () => plan,
      },
      notemdArtifacts: { planDiagram: () => plan, planCleanup: async () => [] },
      notemdJobs: {
        get: async () => undefined,
        cancel: async () => ({ id: 'job', state: 'cancelled' }),
      },
      notemdApprovalLedger: {
        issue: async () => {
          receiptCalls += 1
          return { approvalId: 'unexpected', digest: plan.digest, planId: plan.id }
        },
        consume: async () => false,
      },
      notemdApprovalGate: {
        request: async () => false,
      },
    },
    (tool) => tool,
  )

  const approvalTool = registered.find((tool) => tool.name === 'notemd_request_plan_approval')
  const applyTool = registered.find((tool) => tool.name === 'notemd_apply_approved_plan')
  if (approvalTool === undefined || applyTool === undefined) {
    throw new Error('Required approval tools were not registered.')
  }

  await expect(approvalTool.execute({ plan })).resolves.toEqual({ approved: false })
  await expect(applyTool.execute({ approvalId: 'unknown', plan })).resolves.toMatchObject({
    results: [{ path: 'notes/a.md', status: 'rejected' }],
  })
  expect(receiptCalls).toBe(0)
  expect(applyCalls).toBe(0)
})
