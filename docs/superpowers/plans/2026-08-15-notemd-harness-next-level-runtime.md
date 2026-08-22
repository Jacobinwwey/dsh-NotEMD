# NoteMD Harness Next-Level Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make the NoteMD DeepSeek Harness bundle operationally reliable without weakening its approval-gated write boundary.

**Architecture:** A dedicated workspace-events package owns ordered, metadata-only changes and Vault snapshot reconciliation. Durable jobs own checkpoints and explicit recovery; the bundle maps persisted workflow names to plan-only workflow executors. The OpenAI-compatible adapter exposes diagnostics and advisory model discovery behind the existing configured provider service.

**Tech Stack:** Node.js 22.19.0+, pnpm 10.7.1, TypeScript strict mode, Vitest, DeepSeek Harness 0.1.0-rc.5 source contracts, Cordis, and `@deepseek-ai/dsh-tools`.

## Global Constraints

- Work only in this repository; `E:/convert/undo/obsidian-NoteMD_new` and `ref/deepseek-harness` remain read-only references.
- Keep the approval-gated `WritePlan` as the sole mutation path. Durable jobs plan only.
- Do not add `notemd_run`, an unsafe write Tool, Obsidian imports, browser/native renderer dependencies, or a provider-specific transport registry.
- Event payloads contain paths, revisions, origin, causation id, and timestamps only; never include note content, API keys, headers, prompts, response bodies, or approval secrets.
- The workspace scanner is polling-based and ordered; it is not a distributed filesystem watcher.
- Use red-green-refactor for every behavior and retain an explicit focused test for each failure mode.
- Maintain English and Chinese design, plan, and validation documents under `docs/`.

---

### Task 1: Add Workspace Change Contracts and Incremental Index Synchronization

**Files:**
- Create: `packages/notemd-workspace-events/src/index.ts`
- Create: `packages/notemd-workspace-events/src/workspace-change-coordinator.ts`
- Create: `packages/notemd-workspace-events/package.json`
- Create: `packages/notemd-workspace-events/tsconfig.json`
- Create: `packages/notemd-workspace-events/test/workspace-change-coordinator.test.ts`
- Create: `packages/notemd-knowledge/src/incremental-knowledge-synchronizer.ts`
- Modify: `packages/notemd-knowledge/src/index.ts`
- Modify: `packages/notemd-knowledge/test/knowledge-index.test.ts`
- Modify: `packages/notemd-vault/src/workspace-package-names.ts`
- Modify: workspace manifests and lockfile as required by pnpm

**Interfaces:**

```ts
export type WorkspaceChangeOrigin = 'notemd-approved-plan' | 'external-scan'
export interface WorkspaceChange { path: string; kind: 'created' | 'updated' | 'deleted'; revision?: Revision }
export interface WorkspaceChangeEvent {
  id: string
  occurredAt: string
  origin: WorkspaceChangeOrigin
  causationId: string
  changes: readonly WorkspaceChange[]
}
export interface WorkspaceChangeSource { subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void }
export class WorkspaceChangeCoordinator implements WorkspaceChangeSource {
  async captureSnapshot(signal?: AbortSignal): Promise<void>
  async recordApprovedPlan(plan: WritePlan, results: readonly WriteResult[]): Promise<WorkspaceChangeEvent | undefined>
  async scan(signal?: AbortSignal): Promise<WorkspaceChangeEvent | undefined>
}
```

- [x] **Step 1: Write the failing event and index synchronization tests**

```ts
test('publishes only successful approved writes with plan causation', async () => {
  await coordinator.captureSnapshot()
  const events: WorkspaceChangeEvent[] = []
  coordinator.subscribe((event) => events.push(event))
  await coordinator.recordApprovedPlan(plan, [{ path: 'notes/a.md', status: 'updated', revision: 'rev-b' }])
  expect(events).toMatchObject([{ origin: 'notemd-approved-plan', causationId: plan.id }])
})

test('incrementally replaces an indexed document after a workspace change', async () => {
  synchronizer.start()
  source.emit(updatedEvent)
  await synchronizer.whenIdle()
  await expect(index.search('replacement token')).resolves.toMatchObject([{ path: 'notes/a.md' }])
})
```

- [x] **Step 2: Run focused tests and observe missing-module failures**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/workspace-events test -- workspace-change-coordinator.test.ts`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/knowledge test -- knowledge-index.test.ts`

Expected: tests fail because event and synchronizer modules do not exist.

- [x] **Step 3: Implement the coordinator and in-memory subscription boundary**

```ts
async recordApprovedPlan(plan: WritePlan, results: readonly WriteResult[]) {
  const changes = results
    .filter((result) => (result.status === 'created' || result.status === 'updated') && result.revision !== undefined)
    .map((result) => ({ path: result.path, kind: result.status, revision: result.revision! }))
  return changes.length === 0 ? undefined : this.publish('notemd-approved-plan', plan.id, changes)
}
```

Serialize `captureSnapshot`, `recordApprovedPlan`, and `scan` behind one promise tail. `scan` compares fresh `{ path, revision }` values with the last snapshot and emits created, updated, and deleted changes under one generated scan id.

- [x] **Step 4: Implement the knowledge subscription**

```ts
source.subscribe((event) => this.enqueue(async () => {
  for (const change of event.changes) {
    if (change.kind === 'deleted') await index.remove(change.path)
    else await upsertOrRemoveAfterFreshRead(index, vault, change.path)
  }
}))
```

The synchronizer catches only `VAULT_NOT_FOUND` as a remove condition. It exposes `dispose()` and `whenIdle()` for service lifecycle and tests.

- [x] **Step 5: Run focused package tests and typecheck**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/workspace-events test`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/knowledge test`

Run: `rtk tsc`

Expected: events are ordered, no-op applies publish nothing, external create/update/delete reconcile, and index reads fresh Vault content.

### Task 2: Make Jobs Checkpointed, Recoverable, and Explicitly Resumable

**Files:**
- Modify: `packages/notemd-jobs/src/file-job-store.ts`
- Modify: `packages/notemd-jobs/src/bounded-runner.ts`
- Create: `packages/notemd-jobs/src/durable-workflow-runner.ts`
- Modify: `packages/notemd-jobs/src/index.ts`
- Modify: `packages/notemd-jobs/test/bounded-runner.test.ts`
- Create: `packages/notemd-jobs/test/durable-workflow-runner.test.ts`

**Interfaces:**

```ts
export interface JobTargetResult { target: string; status: 'completed' | 'cancelled' | 'failed'; detail?: string; checkpoint?: JsonValue }
export type JobState = 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
export interface JobRecord<I extends JsonValue> { workflow: string; attempt: number; /* existing immutable fields */ }
export interface WorkflowJobExecutor<I extends JsonValue> {
  readonly workflow: string
  execute(input: Readonly<I>, target: string, signal: AbortSignal): Promise<JobTargetResult>
}
export class DurableWorkflowRunner<I extends JsonValue> {
  async resume(id: string, signal?: AbortSignal): Promise<JobRecord<I>>
}
```

- [x] **Step 1: Write failing recovery and checkpoint tests**

```ts
test('recovers interrupted work and executes only targets without checkpoints', async () => {
  const first = await store.start({ workflow: 'formula-repair', idempotencyKey: 'f1', input: {}, targets: ['a.md', 'b.md'] })
  await store.markRunning(first.id)
  await store.recordTargetCheckpoint(first.id, { target: 'a.md', status: 'completed' })
  await store.recoverInterrupted()
  await runner.resume(first.id)
  expect(executed).toEqual(['b.md'])
})

test('turns a cancellation request into a terminal cancelled record after active targets settle', async () => {
  const running = runner.resume(job.id, controller.signal)
  await store.cancel(job.id)
  controller.abort()
  await running
  await expect(store.get(job.id)).resolves.toMatchObject({ state: 'cancelled' })
})
```

- [x] **Step 2: Run the new focused test and observe the missing-method failure**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/jobs test -- durable-workflow-runner.test.ts`

Expected: FAIL because checkpoint, recovery, and durable runner APIs do not exist.

- [x] **Step 3: Extend the persisted state machine without generic updates**

Add named operations `recordTargetCheckpoint`, `recoverInterrupted`, `beginExecution`, and `finishExecution`. Validate `workflow` once at `start`, clone checkpoints as JSON at the edge, and write every checkpoint atomically. A `running` record recovers to `queued`; a `cancelling` record recovers to `cancelled`; terminal records remain immutable.

- [x] **Step 4: Implement durable execution with bounded result observation**

```ts
await runner.runWithObserver(pendingTargets, execute, async (result) => {
  await store.recordTargetCheckpoint(id, result)
}, signal)
return store.finishExecution(id)
```

`BoundedJobRunner.run()` remains available and delegates to `runWithObserver()`. The observer is awaited before a worker acquires another target, making persistence a completion checkpoint rather than a trailing summary.

- [x] **Step 5: Run jobs tests and typecheck**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/jobs test`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/jobs typecheck`

Expected: idempotency, bounded concurrency, checkpoint persistence, interruption recovery, cancellation, failed targets, and terminal immutability pass.

### Task 3: Bind Named Planning Jobs and Workspace Events into the Bundle

**Files:**
- Create: `packages/notemd-bundle/src/workspace-changes.ts`
- Modify: `packages/notemd-bundle/src/jobs.ts`
- Modify: `packages/notemd-bundle/src/knowledge.ts`
- Modify: `packages/notemd-bundle/src/tools.ts`
- Modify: `packages/notemd-bundle/cordis.patch.yml`
- Modify: `packages/notemd-bundle/package.json`
- Modify: `packages/notemd-tools/src/notemd-services.ts`
- Modify: `packages/notemd-tools/src/job-tools.ts`
- Modify: `packages/notemd-tools/src/write-tools.ts`
- Modify: `packages/notemd-tools/src/index.ts`
- Modify: `packages/notemd-tools/test/tools.contract.test.ts`
- Modify: `packages/notemd-bundle/test/runtime-adapter.test.ts`
- Modify: `packages/notemd-bundle/test/patch.contract.test.ts`

**Interfaces:**

```ts
export interface NotemdJobs {
  startFormulaRepairs(request: FormulaRepairJobRequest): Promise<unknown>
  startMermaidRepairs(request: MermaidRepairJobRequest): Promise<unknown>
  startTranslations(request: TranslationJobRequest): Promise<unknown>
  startWikiLinkPlans(request: WikiLinkJobRequest): Promise<unknown>
  startTitlePlans(request: TitleJobRequest): Promise<unknown>
  startResearchSyntheses(request: ResearchJobRequest): Promise<unknown>
  startConceptExtractions(request: ConceptJobRequest): Promise<unknown>
  resume(id: string): Promise<unknown>
  get(id: string): Promise<unknown | undefined>
  cancel(id: string): Promise<unknown>
}
```

- [x] **Step 1: Write failing bundle Tool tests**

```ts
expect(toolNames).toContain('notemd_job_start_formula_repair')
expect(toolNames).toContain('notemd_job_resume')
expect(toolNames).not.toContain('notemd_run')

await expect(applyTool.execute({ approvalId, plan })).resolves.toMatchObject({
  change: { origin: 'notemd-approved-plan', causationId: plan.id },
})
```

- [x] **Step 2: Run focused Tool and bundle tests red**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/tools test -- tools.contract.test.ts`

Run: `rtk proxy pnpm.cmd --filter dsh-notemd test -- patch.contract.test.ts`

Expected: FAIL because named jobs and workspace changes are not injected or registered.

- [x] **Step 3: Implement plan-only executor strategies and explicit Tools**

Each bundle method constructs its own validated input and invokes one matching `WorkflowPlanner` method. The background result checkpoint contains `{ plan }` only on successful planning. `resume(id)` resolves a persisted workflow name through a private executor map; unrecognized names return a stable job-store error. Start Tools return promptly with a durable record; resume starts only on explicit request.

- [x] **Step 4: Implement lifecycle-aware change services**

The workspace change service captures its baseline snapshot during init. Knowledge rebuilds, subscribes, and then starts the periodic scan. The write Tool calls `recordApprovedPlan()` only after Vault results are returned and includes only returned metadata in its response.

- [x] **Step 5: Run service and Tool verification**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/tools test`

Run: `rtk proxy pnpm.cmd --filter dsh-notemd test`

Run: `rtk tsc`

Expected: Cordis patch injects workspace changes before knowledge/tools, named job Tools never apply plans, and plan application publishes an indexable change.

### Task 4: Add Provider Diagnostics, Model Discovery, and Explicit Optional Capabilities

**Files:**
- Modify: `packages/notemd-llm-openai-compatible/src/error.ts`
- Modify: `packages/notemd-llm-openai-compatible/src/index.ts`
- Create: `packages/notemd-llm-openai-compatible/test/provider-observability.test.ts`
- Modify: `packages/notemd-bundle/src/runtime-adapter.ts`
- Modify: `packages/notemd-bundle/src/llm.ts`
- Modify: `packages/notemd-tools/src/notemd-services.ts`
- Create: `packages/notemd-tools/src/provider-tools.ts`
- Modify: `packages/notemd-tools/src/artifact-tools.ts`
- Modify: `packages/notemd-artifacts/src/artifact-manifest.ts`
- Modify: `packages/notemd-artifacts/test/artifact-manifest.test.ts`
- Modify: `packages/notemd-tools/test/tools.contract.test.ts`
- Modify: `packages/notemd-bundle/cordis.patch.yml`

**Interfaces:**

```ts
export type ProviderDiagnosticResult =
  | { status: 'available'; endpoint: string; model: string; elapsedMs: number; usage?: TextCompletion['usage'] }
  | { status: 'unavailable'; endpoint: string; model: string; elapsedMs: number; error: { code: LlmErrorCode; retryable: boolean; message: string } }
export type ModelDiscoveryResult =
  | { status: 'available'; endpoint: string; models: readonly { id: string; ownedBy?: string }[] }
  | { status: 'unavailable'; endpoint: string; reason: string }
export interface ArtifactCapability { capability: 'diagram-rendering' | 'document-export'; status: 'unavailable'; reason: string }
```

- [x] **Step 1: Write failing observability and capability tests**

```ts
await expect(adapter.diagnoseProvider(diagnosticRequest)).resolves.toMatchObject({
  status: 'available', endpoint: 'https://example.test/v1/chat/completions', model: 'test-model',
})
await expect(adapter.discoverModels(discoveryRequest)).resolves.toMatchObject({
  status: 'available', models: [{ id: 'test-model' }],
})
expect(JSON.stringify(unavailableDiagnostic)).not.toContain('secret-token')
expect(artifacts.diagramRenderingCapability()).toMatchObject({ status: 'unavailable' })
```

- [x] **Step 2: Run focused tests red**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/llm-openai-compatible test -- provider-observability.test.ts`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/artifacts test -- artifact-manifest.test.ts`

Expected: FAIL because diagnostics, discovery, and capability methods do not exist.

- [x] **Step 3: Implement redacted provider operations**

Use the existing timeout/cancellation path. Sanitize reported endpoints by stripping credentials, query, and fragment. Do not include HTTP response bodies in `LlmError`; report status code only. Derive `/models` only from a completion path ending in `/chat/completions`, or honor an explicit `modelsEndpoint`. Parse only string model ids and optional string `owned_by` values.

- [x] **Step 4: Expose separate provider and capability Tools**

Register `notemd_provider_diagnostic`, `notemd_provider_models`, `notemd_artifact_render_status`, and `notemd_artifact_export_status`. They have no behavior-selecting transport or renderer parameters and return structured data only.

- [x] **Step 5: Run package suites**

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/llm-openai-compatible test`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/artifacts test`

Run: `rtk proxy pnpm.cmd --filter @notemd-harness/tools test`

Expected: errors are redacted, discovery failures are truthful `unavailable` results, and no renderer dependency appears in the package graph.

### Task 5: Validate the Published Bundle, Document Operations, and Push Main

**Files:**
- Modify: `docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.md`
- Modify: `docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.zh-CN.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `scripts/accept-dsh-profile.ts`

- [x] **Step 1: Extend clean-profile acceptance coverage**

```ts
expect(resolvedConfig).toContain('notemd-workspace-changes')
expect(resolvedConfig).toContain('notemd_provider_diagnostic')
expect(resolvedConfig).toContain('notemd_job_start_formula_repair')
```

- [x] **Step 2: Run acceptance focused test**

Run: `rtk proxy pnpm.cmd accept:dsh`

Expected: the packed tarball resolves the workspace-change, jobs, knowledge, LLM, and Tool services in an isolated DSH profile.

- [x] **Step 3: Record operations and known exclusions in both walkthroughs**

Document the explicit-resume workflow, scan interval cost, model-discovery advisory semantics, approval boundary, single-process workspace limitation, and structured unavailable renderer/export results. Do not document unsupported renderer installation as available behavior.

- [x] **Step 4: Run full release gates**

Run: `rtk tsc`

Run: `rtk lint`

Run: `rtk proxy pnpm.cmd test`

Run: `rtk proxy pnpm.cmd test:coverage`

Run: `rtk proxy pnpm.cmd build`

Run: `rtk proxy pnpm.cmd pack:bundle`

Run: `rtk proxy pnpm.cmd verify:bundle`

Run: `rtk proxy pnpm.cmd accept:dsh`

Run: `rtk proxy git diff --check`

Expected: each command exits zero, bundle contents remain self-contained, and the clean profile accepts the packed bundle.

- [x] **Step 5: Commit and push the verified main branch**

Run: `rtk proxy git add packages docs README.md README.zh-CN.md scripts pnpm-lock.yaml`

Run: `rtk proxy git commit -m "feat: add reliable harness runtime services"`

Run: `rtk proxy git -c "core.sshCommand=ssh -o ControlMaster=no -o ControlPath=none" fetch origin main`

Run: `rtk proxy git -c "core.sshCommand=ssh -o ControlMaster=no -o ControlPath=none" push origin main`

Expected: a non-force push fast-forwards remote `main` after all verification gates pass.

## Plan Review

- Coverage: Tasks 1-3 implement the reliability and incremental synchronization boundary; Task 4 implements provider/capability transparency; Task 5 validates the packed DSH artifact and documents operating limits.
- Authority: all automation is plan-only until the existing approval-gated write Tool runs. No job or event service can mutate workspace content.
- Reliability tradeoff: the scanner favors dependable reconciliation over low-latency platform-specific watcher behavior; it is bounded by configuration and never emits content.
- Compatibility: provider discovery is optional and advisory, matching OpenAI-compatible deployments that omit `/models`.
- Explicit risk: shared-workspace multi-process job execution is intentionally unsupported pending a real cross-process lease backend.

## Measured Closure (2026-08-22)

- Tasks 1-4 are implemented in commit `6672f54`: workspace change coordination and incremental knowledge synchronization, durable checkpointed jobs, bundle lifecycle wiring, and redacted provider observability/optional capability boundaries.
- Focused re-verification passed 8 files / 48 tests across workspace-events, knowledge, jobs, provider observability, artifacts, tools, and bundle patch/runtime boundaries.
- Parallel full-suite attempts exposed only test-resource contention: `migration-conformance` and composite approval tests can exceed the default 10s timeout when all package suites run concurrently, and one run left a temporary `.notemd/mutations` directory busy. The same focused contracts pass serially; release verification must use the repository's root command with the configured timeout and no parallel package fan-out.
- The next parity phase is deterministic Mermaid normalization plus a versioned semantic/render/export diagram catalog; Drawnix, provider cache policy, and Obsidian host gallery remain excluded.
