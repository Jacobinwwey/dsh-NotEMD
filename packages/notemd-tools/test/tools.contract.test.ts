import { expect, test } from 'vitest'

import {
  createContentSha256,
  createStagedAssetRef,
  createWorkspaceMutationPlan,
  createWorkspaceMutationReceipt,
  type WorkspaceMutationPlan,
  type WorkspaceMutationReceipt,
} from '@notemd-harness/mutation'

import { registerNotemdTools, type NotemdToolContext, type ToolRegistrationSpec } from '../src/index.js'

function textPlan(content = 'translated'): WorkspaceMutationPlan {
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'translate.file',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-text',
        destination: 'notes/a.md',
        expectedRevision: 'rev-a',
        provenance: {
          operationId: 'translate.file',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        mediaType: 'text/markdown',
        content,
        contentSha256: createContentSha256(content),
      },
    ],
  })
}

function bytesPlan(): WorkspaceMutationPlan {
  const content = '<svg>approved</svg>'
  const sha256 = createContentSha256(content)
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'diagram.generate',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'write-bytes',
        destination: 'artifacts/a.svg',
        expectedRevision: 'absent',
        provenance: {
          operationId: 'diagram.generate',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        mediaType: 'image/svg+xml',
        contentSha256: sha256,
        stagedAsset: createStagedAssetRef({
          id: 'diagram-a',
          byteLength: Buffer.byteLength(content),
          mediaType: 'image/svg+xml',
          sha256,
        }),
      },
    ],
  })
}

function deletePlan(): WorkspaceMutationPlan {
  const prior = 'old note'
  return createWorkspaceMutationPlan({
    provenance: {
      operationId: 'duplicate.check-file',
      sourceRefs: ['notes/a.md'],
      evidenceRefs: [],
    },
    mutations: [
      {
        kind: 'delete',
        destination: 'notes/a.md',
        expectedRevision: 'rev-a',
        provenance: {
          operationId: 'duplicate.check-file',
          sourceRefs: ['notes/a.md'],
          evidenceRefs: [],
        },
        conflictPolicy: 'reject',
        expectedContentSha256: createContentSha256(prior),
      },
    ],
  })
}

function receiptFor(plan: WorkspaceMutationPlan, status: WorkspaceMutationReceipt['status']): WorkspaceMutationReceipt {
  return createWorkspaceMutationReceipt({
    planId: plan.id,
    planDigest: plan.digest,
    status,
    mutations: plan.mutations.map((mutation) => ({
      destination: mutation.destination,
      kind: mutation.kind,
      status,
      ...(status === 'committed' && mutation.kind !== 'delete' ? { revision: 'rev-b' } : {}),
      ...(status === 'committed' ? {} : { diagnosticCode: `mutation-${status}` }),
    })),
  })
}

interface RegisteredContext {
  readonly registered: ToolRegistrationSpec[]
  readonly appliedPlans: WorkspaceMutationPlan[]
  readonly publishedReceipts: Array<{ plan: WorkspaceMutationPlan; receipt: WorkspaceMutationReceipt }>
  readonly evidenceLookups: Array<readonly string[]>
  readonly workflowEvidence: unknown[]
  readonly researchJobRequests: Array<{ readonly evidenceIds: readonly string[] }>
}

interface FixtureOptions {
  readonly approvalDecision?: 'approved' | 'rejected' | 'unavailable' | 'cancelled'
  readonly consumeApproval?: boolean
  readonly dshOnlyTransformer?: boolean
  readonly researchFailure?: unknown
}

function registerFixture(
  plan: WorkspaceMutationPlan,
  executorReceipt = receiptFor(plan, 'committed'),
  options: FixtureOptions = {},
): RegisteredContext {
  const registered: ToolRegistrationSpec[] = []
  const appliedPlans: WorkspaceMutationPlan[] = []
  const publishedReceipts: Array<{ plan: WorkspaceMutationPlan; receipt: WorkspaceMutationReceipt }> = []
  const evidenceLookups: Array<readonly string[]> = []
  const workflowEvidence: unknown[] = []
  const researchJobRequests: Array<{ readonly evidenceIds: readonly string[] }> = []
  let approvalNumber = 0
  const researchEvidence = {
    version: 1 as const,
    id: 'evidence:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    query: 'revision-aware mutations',
    requestedUrl: 'https://example.test/requested',
    finalUrl: 'https://example.test/final',
    statusCode: 200,
    bodyKind: 'text' as const,
    content: 'Durable research evidence.',
    truncated: false,
    contentSha256: 'b'.repeat(64),
    retrievedAt: '2026-08-15T00:00:00.000Z',
    citations: [{ id: 'citation:one', url: 'https://example.test/final' }],
  }

  const context = {
    tools: { register: (tool: ToolRegistrationSpec) => registered.push(tool) },
    notemdVault: {
      listMarkdown: async () => ['notes/a.md'],
      read: async (path: string) => ({ path, content: '# A', revision: 'rev-a' }),
      applyMutationPlan: async (candidate: WorkspaceMutationPlan) => {
        appliedPlans.push(candidate)
        return executorReceipt
      },
      recoverIncompleteMutationPlans: async () => [],
    },
    notemdKnowledge: {
      search: async () => [],
      retrieve: async () => ({
        query: 'canonical locks',
        taskRoots: ['notes'],
        matches: [{
          path: 'notes/a.md',
          title: 'Canonical Lock Ordering',
          excerpt: 'Acquire locks in lexical order.',
          score: 1,
          anchor: 'canonical-lock-ordering',
          breadcrumb: ['Atomic Writes', 'Canonical Lock Ordering'],
          citationId: 'citation:notes/a.md#canonical-lock-ordering',
          context: '## Canonical Lock Ordering\nAcquire locks in lexical order.',
          explanation: {
            includedByRoot: 'notes',
            matchedTerms: ['canonical', 'locks'],
            window: { before: 0, after: 0 },
          },
        }],
      }),
    },
    notemdWorkflows: {
      planWikiLinks: async () => plan,
      planTranslation: async () => plan,
      planTitleGeneration: async () => plan,
      planResearchSynthesis: async (_path: string, evidence: unknown) => {
        workflowEvidence.push(evidence)
        return plan
      },
      planConceptExtraction: async () => plan,
      planMermaidRepair: async () => plan,
      planFormulaRepair: async () => plan,
      planChapterSplit: async () => plan,
      planOriginalTextExtraction: async () => plan,
      planMergedOriginalTextExtraction: async () => plan,
      planWikiLinksInFolder: async () => [plan],
      planTitlesInFolder: async () => [plan],
      planTranslationsInFolder: async () => [plan],
      planConceptsInFolder: async () => [plan],
      planMermaidRepairsInFolder: async () => [plan],
      planFormulaRepairsInFolder: async () => [plan],
      planChapterSplitsInFolder: async () => [plan],
      planOriginalTextExtractionsInFolder: async () => [plan],
      planMergedOriginalTextExtractionsInFolder: async () => [plan],
      checkFileDuplicates: async () => [{ term: 'atomic', occurrences: 2 }],
      findConceptDuplicates: async () => [],
      planConceptDedupe: async () => plan,
      planExtractAndGenerate: async () => plan,
    },
    notemdArtifacts: {
      planMermaidArtifact: () => plan,
      planVegaLiteArtifact: () => plan,
      planJsonCanvasArtifact: () => plan,
      planHtmlArtifact: () => plan,
      planEditableSvgArtifact: () => plan,
      planCleanup: async () => [],
      mermaidRenderingCapability: () => ({ capability: 'diagram-rendering', status: 'available', reason: 'not configured' }),
      vegaLiteRenderingCapability: () => ({ capability: 'diagram-rendering', status: 'available', reason: 'not configured' }),
      jsonCanvasRenderingCapability: () => ({ capability: 'diagram-rendering', status: 'available', reason: 'not configured' }),
      htmlRenderingCapability: () => ({ capability: 'diagram-rendering', status: 'available', reason: 'not configured' }),
      editableSvgRenderingCapability: () => ({ capability: 'diagram-rendering', status: 'available', reason: 'not configured' }),
      documentExportCapability: () => ({ capability: 'document-export', status: 'unavailable', reason: 'not configured' }),
    },
    notemdTextTransformer: options.dshOnlyTransformer
      ? { complete: async () => ({ model: 'dsh-model', text: 'unused' }) }
      : {
          complete: async () => ({ model: 'legacy-model', text: 'unused' }),
          diagnoseProvider: async () => ({ status: 'available', endpoint: 'https://example.test/v1/chat/completions', model: 'test-model', elapsedMs: 1 }),
          discoverModels: async () => ({ status: 'available', endpoint: 'https://example.test/v1/models', models: [{ id: 'test-model' }] }),
        },
    notemdResearch: {
      discover: async (request: { query: string; maxResults: number }) => {
        if (options.researchFailure !== undefined) throw options.researchFailure
        return {
          version: 1 as const,
          id: 'discovery:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          query: request.query,
          sources: [{ url: 'https://example.test/final', title: 'Evidence source' }],
          truncated: false,
          retrievedAt: '2026-08-15T00:00:00.000Z',
        }
      },
      capture: async (discoveryId: string, sourceIndex: number) => {
        if (options.researchFailure !== undefined) throw options.researchFailure
        expect(discoveryId).toContain('discovery:')
        expect(sourceIndex).toBe(0)
        return researchEvidence
      },
      readEvidence: async (ids: readonly string[]) => {
        evidenceLookups.push(ids)
        if (options.researchFailure !== undefined) throw options.researchFailure
        return [researchEvidence]
      },
    },
    notemdJobs: {
      startFormulaRepairs: async () => ({ id: 'job-formula' }),
      startMermaidRepairs: async () => ({ id: 'job-mermaid' }),
      startTranslations: async () => ({ id: 'job-translation' }),
      startWikiLinkPlans: async () => ({ id: 'job-links' }),
      startTitlePlans: async () => ({ id: 'job-title' }),
      startResearchSyntheses: async (request: { readonly evidenceIds: readonly string[] }) => {
        researchJobRequests.push(request)
        return { id: 'job-research' }
      },
      startConceptExtractions: async () => ({ id: 'job-concepts' }),
      resume: async () => ({ id: 'job', state: 'running' }),
      get: async () => undefined,
      cancel: async () => ({ id: 'job', state: 'cancelled' }),
    },
    notemdWorkspaceChanges: {
      recordMutationReceipt: async (candidate: WorkspaceMutationPlan, receipt: WorkspaceMutationReceipt) => {
        publishedReceipts.push({ plan: candidate, receipt })
        return {
          id: 'notemd-change-1',
          occurredAt: '2026-08-15T00:00:00.000Z',
          origin: 'notemd-mutation-receipt',
          causationId: candidate.id,
          changes: [{ path: 'notes/a.md', kind: 'updated', revision: 'rev-b' }],
        }
      },
    },
    notemdApprovalLedger: {
      issue: async (candidate: WorkspaceMutationPlan) => ({
        approvalId: `approval-${++approvalNumber}`,
        digest: candidate.digest,
        planId: candidate.id,
        assetDigests: candidate.mutations.flatMap((mutation) => mutation.kind === 'write-bytes' ? [mutation.stagedAsset.sha256] : []),
        expiresAt: 1,
      }),
      consume: async () => options.consumeApproval ?? true,
    },
    notemdApprovalGate: {
      request: async () => options.approvalDecision ?? 'approved',
    },
  } as unknown as NotemdToolContext

  registerNotemdTools(context, (tool) => tool)
  return { registered, appliedPlans, publishedReceipts, evidenceLookups, workflowEvidence, researchJobRequests }
}

function registeredTool(context: RegisteredContext, name: string): ToolRegistrationSpec {
  const tool = context.registered.find((candidate) => candidate.name === name)
  if (tool === undefined) {
    throw new Error(`Tool ${name} was not registered.`)
  }
  return tool
}

test('routes an approved proposal through the mutation executor and receipt event boundary', async () => {
  const plan = textPlan()
  const context = registerFixture(plan)
  const planTool = registeredTool(context, 'notemd_plan_translation')
  const approvalTool = registeredTool(context, 'notemd_request_plan_approval')
  const applyTool = registeredTool(context, 'notemd_apply_approved_plan')

  await expect(planTool.execute({ language: 'de', path: 'notes/a.md' })).resolves.toMatchObject({ status: 'success', plan })
  const approval = await approvalTool.execute({ plan }) as { approvalId: string }
  await expect(applyTool.execute({ approvalId: approval.approvalId, plan })).resolves.toMatchObject({
    status: 'success',
    receipt: { status: 'committed', planId: plan.id },
    change: { origin: 'notemd-mutation-receipt', causationId: plan.id },
  })
  expect(context.appliedPlans).toEqual([plan])
  expect(context.publishedReceipts).toEqual([{ plan, receipt: receiptFor(plan, 'committed') }])
})

test.each([
  ['rejected', 'rejected', 'approval-rejected'],
  ['unavailable', 'unavailable', 'approval-unavailable'],
  ['cancelled', 'cancelled', 'approval-cancelled'],
] as const)('reports a %s approval decision without issuing executable authority', async (decision, status, code) => {
  const plan = textPlan()
  const context = registerFixture(plan, receiptFor(plan, 'committed'), { approvalDecision: decision })
  const approvalTool = registeredTool(context, 'notemd_request_plan_approval')

  await expect(approvalTool.execute({ plan })).resolves.toMatchObject({
    status,
    code,
    planId: plan.id,
    digest: plan.digest,
  })
  expect(context.appliedPlans).toEqual([])
  expect(context.publishedReceipts).toEqual([])
})

test('rejects a missing or mismatched approval before invoking the mutation executor', async () => {
  const plan = textPlan()
  const context = registerFixture(plan, receiptFor(plan, 'committed'), { consumeApproval: false })
  const applyTool = registeredTool(context, 'notemd_apply_approved_plan')

  await expect(applyTool.execute({ approvalId: 'approval-missing', plan })).resolves.toMatchObject({
    status: 'rejected',
    code: 'approval-receipt-invalid',
    planId: plan.id,
    digest: plan.digest,
  })
  expect(context.appliedPlans).toEqual([])
  expect(context.publishedReceipts).toEqual([])
})

test.each([
  ['stale proposal', textPlan(), 'conflict' as const],
  ['staged asset substitution', bytesPlan(), 'rejected' as const],
  ['rejected delete', deletePlan(), 'rejected' as const],
])('does not publish a workspace event for a %s receipt', async (_label, plan, status) => {
  const context = registerFixture(plan, receiptFor(plan, status))
  const approvalTool = registeredTool(context, 'notemd_request_plan_approval')
  const applyTool = registeredTool(context, 'notemd_apply_approved_plan')
  const approval = await approvalTool.execute({ plan }) as { approvalId: string }

  await expect(applyTool.execute({ approvalId: approval.approvalId, plan })).resolves.toMatchObject({
    status,
    receipt: { status },
  })
  expect(context.appliedPlans).toEqual([plan])
  expect(context.publishedReceipts).toEqual([])
})

test('registers named tools with closed canonical result schemas', () => {
  const context = registerFixture(textPlan())
  const names = context.registered.map((tool) => tool.name)

  expect(names).toContain('notemd_workspace_read')
  expect(names).toContain('notemd_knowledge_retrieve')
  expect(names).toContain('notemd_plan_translation')
  expect(names).toContain('notemd_plan_chapter_split')
  expect(names).toContain('notemd_plan_original_text_extraction')
  expect(names).toContain('notemd_plan_merged_original_text_extraction')
  expect(names).toContain('notemd_check_file_duplicates')
  expect(names).toContain('notemd_plan_formula_repairs_in_folder')
  expect(names).toContain('notemd_plan_original_text_extractions_in_folder')
  expect(names).toContain('notemd_plan_merged_original_text_extractions_in_folder')
  expect(names).toContain('notemd_request_plan_approval')
  expect(names).toContain('notemd_apply_approved_plan')
  expect(names).toContain('notemd_artifact_cleanup')
  expect(names).toContain('notemd_plan_drawio_artifact')
  expect(names).toContain('notemd_drawio_render_status')
  expect(names).toContain('notemd_plan_drawnix_artifact')
  expect(names).toContain('notemd_drawnix_render_status')
  expect(names).toContain('notemd_plan_circuitikz_artifact')
  expect(names).toContain('notemd_circuitikz_render_status')
  expect(names).toContain('notemd_job_status')
  expect(names).not.toContain('notemd_run')
  expect(context.registered.every((tool) => schemaIsClosed(tool.output.schema))).toBe(true)
  expect(context.registered.every((tool) => schemaUsesDshValueDsl(tool.output.schema))).toBe(true)
})

test('returns citation-bearing scoped knowledge retrieval through its named tool', async () => {
  const context = registerFixture(textPlan())
  const retrievalTool = registeredTool(context, 'notemd_knowledge_retrieve')

  await expect(retrievalTool.execute({
    query: 'canonical locks',
    taskRoots: ['notes'],
    topK: 2,
    windowSections: 1,
  })).resolves.toMatchObject({
    status: 'success',
    result: {
      matches: [{ citationId: 'citation:notes/a.md#canonical-lock-ordering' }],
    },
  })
})

test('executes document-semantic tools through named planner operations', async () => {
  const plan = textPlan()
  const context = registerFixture(plan)
  const chapterTool = registeredTool(context, 'notemd_plan_chapter_split')
  const originalTextTool = registeredTool(context, 'notemd_plan_original_text_extraction')
  const duplicateTool = registeredTool(context, 'notemd_check_file_duplicates')

  await expect(chapterTool.execute({ path: 'notes/a.md' })).resolves.toMatchObject({ status: 'success', plan })
  await expect(originalTextTool.execute({
    path: 'notes/a.md',
    questions: ['What is retained?'],
  })).resolves.toMatchObject({ status: 'success', plan })
  await expect(duplicateTool.execute({ path: 'notes/a.md' })).resolves.toMatchObject({
    status: 'success',
    duplicates: [{ term: 'atomic', occurrences: 2 }],
  })
})

test('does not register legacy provider tools for a DSH-only transformer', () => {
  const context = registerFixture(textPlan(), receiptFor(textPlan(), 'committed'), { dshOnlyTransformer: true })
  const names = context.registered.map((tool) => tool.name)

  expect(names).not.toContain('notemd_provider_diagnostic')
  expect(names).not.toContain('notemd_provider_models')
})

test('uses named discovery, capture, and evidence-id synthesis operations', async () => {
  const context = registerFixture(textPlan())
  const discoveryTool = registeredTool(context, 'notemd_research_discover')
  const captureTool = registeredTool(context, 'notemd_research_capture_evidence')
  const synthesisTool = registeredTool(context, 'notemd_plan_research_synthesis')

  const discovery = await discoveryTool.execute({ query: 'revision-aware mutations', maxResults: 2 })
  const discoveryId = (discovery as { discovery: { id: string } }).discovery.id
  const evidence = await captureTool.execute({ discoveryId, sourceIndex: 0 })
  const evidenceId = (evidence as { evidence: { id: string } }).evidence.id
  await expect(synthesisTool.execute({ path: 'notes/a.md', evidenceIds: [evidenceId] })).resolves.toMatchObject({
    status: 'success',
    plan: { id: textPlan().id },
  })

  expect(context.evidenceLookups).toEqual([[evidenceId]])
  expect(context.workflowEvidence).toHaveLength(1)
})

test('reports missing or ambiguous DSH web capability as unavailable', async () => {
  const context = registerFixture(textPlan(), receiptFor(textPlan(), 'committed'), {
    researchFailure: Object.assign(new Error('no provider'), { code: 'RESEARCH_CAPABILITY_UNAVAILABLE' }),
  })
  const discoveryTool = registeredTool(context, 'notemd_research_discover')

  await expect(discoveryTool.execute({ query: 'revision-aware mutations', maxResults: 1 })).resolves.toEqual({
    status: 'unavailable',
    code: 'capability-unavailable',
  })
})

test('keeps research unavailable output in one closed schema branch', () => {
  const context = registerFixture(textPlan())
  const discoveryTool = registeredTool(context, 'notemd_research_discover')
  const schema = discoveryTool.output.schema as { oneOf?: unknown[] }

  expect(schema.oneOf).toHaveLength(6)
})

test('starts research jobs from durable evidence ids without accepting raw passages', async () => {
  const context = registerFixture(textPlan())
  const jobTool = registeredTool(context, 'notemd_job_start_research_synthesis')
  const evidenceId = 'evidence:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

  await expect(jobTool.execute({
    idempotencyKey: 'research-durable-evidence',
    targets: ['notes/a.md'],
    evidenceIds: [evidenceId],
  })).resolves.toMatchObject({ status: 'success', job: { id: 'job-research' } })

  expect(context.researchJobRequests).toMatchObject([{ evidenceIds: [evidenceId] }])
})

function schemaIsClosed(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return false
  }
  const record = schema as Record<string, unknown>
  if (Array.isArray(record.oneOf)) {
    return record.oneOf.every(schemaIsClosed)
  }
  if (record.type === 'object') {
    if (record.additionalProperties !== false || typeof record.properties !== 'object' || record.properties === null) {
      return false
    }
    return Object.values(record.properties as Record<string, unknown>).every(schemaIsClosed)
  }
  if (record.type === 'array') {
    return schemaIsClosed(record.items)
  }
  return typeof record.type === 'string'
}

function schemaUsesDshValueDsl(schema: unknown): boolean {
  if (typeof schema !== 'object' || schema === null || Array.isArray(schema)) {
    return false
  }
  const record = schema as Record<string, unknown>
  if (record.required !== undefined && record.required !== true) {
    return false
  }
  if (Array.isArray(record.oneOf)) {
    return record.oneOf.length >= 2 && record.oneOf.every(schemaUsesDshValueDsl)
  }
  if (record.type === 'object') {
    return (
      typeof record.additionalProperties === 'boolean' &&
      (record.properties === undefined || (
        typeof record.properties === 'object' &&
        record.properties !== null &&
        !Array.isArray(record.properties) &&
        Object.values(record.properties as Record<string, unknown>).every(schemaUsesDshValueDsl)
      ))
    )
  }
  if (record.type === 'array') {
    return record.items === undefined || schemaUsesDshValueDsl(record.items)
  }
  return typeof record.type === 'string'
}
