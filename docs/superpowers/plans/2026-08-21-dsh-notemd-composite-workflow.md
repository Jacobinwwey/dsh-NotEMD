# Cordis Composite Workflow Implementation Plan

> For agentic workers: execute this plan inline in this repository. Do not dispatch subagents. Steps use checkbox syntax and every task ends with an independently testable gate.

**Goal:** Implement a source-faithful, approval-safe one-click-extract@1 composite workflow for the standalone dsh-NotEMD bundle without importing Obsidian host behavior or creating a second mutation/job authority.

**Architecture:** Add a pure @notemd-harness/composites package that plans against a virtual workspace overlay, aggregates the net transition into one existing WorkspaceMutationPlan, and exposes one fixed fail-fast definition. Add a thin Cordis service, named plan/job Tools, and an explicit durable executor entry while retaining the current vault, approval ledger, journaled executor, FileJobStore, and DSH-owned ctx.llm/ctx.web seams.

**Tech Stack:** TypeScript ESM, pnpm workspace, DeepSeek Harness Cordis Service, Vitest, existing WorkspaceMutationPlan v1, FileJobStore, deterministic migration fixtures, and the Jacobinwwey/slidev fork lock.

## Global Constraints

- Source observation is ref/obsidian-NotEMD at 07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5; the historical behavior oracle remains obsidian-NoteMD_new at 4168a51cd19ad8c3d1e05f604b50936255461a31.
- Target release is dsh-NotEMD main at 3169964 with npm package dsh-notemd@0.1.1.
- Obsidian UI, editor, command, modal, settings, and host lifecycle code are out of scope.
- DSH owns provider selection, credentials, endpoints, LLM transport, Web transport, and optional native capability selection.
- No generic notemd_run(type, options) Tool, raw custom-workflow DSL execution, or public continueOnError flag is allowed.
- WorkspaceMutationPlan.version remains 1; non-composite plans retain their current canonical digest.
- Planning never writes the physical workspace. Only the existing approval receipt and journaled local executor may apply mutations.
- Composite v1 is fail-fast and text/Markdown-readable; a future best-effort or binary-dependent definition requires a new workflow id/version and fixtures.
- Every new public Tool uses the existing closed DSH author schema and explicit outcome variants.
- Every changed Task/Plan/Walkthrough document has a separated Chinese counterpart under docs/.
- Use Node v22.19.0 and pnpm 10.7.1 for the release gate; all commands below are prefixed with rtk.

---

### Task 1: Lock source semantics and add the composite fixture

**Files:**
- Create: fixtures/migration/composite-source-lock.json
- Create: fixtures/migration/one-click-extract/notes/source.md
- Create: fixtures/migration/one-click-extract/concepts/alpha.md
- Create: fixtures/migration/one-click-extract/concepts/beta.md
- Create: fixtures/migration/one-click-extract/mermaid/alpha.md
- Create: packages/notemd-workflows/test/composite-source-contracts.test.ts
- Modify: fixtures/migration/source-operation-matrix.json only to link the composite observation; do not change included/excluded operation counts.

**Interfaces:**
- Produces CompositeSourceObservation with sourceCommit, defaultActionIds, inputPaths, expectedOutputPaths, collisionCases, and failureCases.
- The fixture must encode the source chain process-current-add-links -> batch-generate-from-titles -> batch-mermaid-fix and the folder hand-off from sourceFolderPath to completeFolderPath.

- [ ] **Step 1: Write the failing fixture assertions**

~~~ts
it('records the three source actions in order', async () => {
  const observation = await readCompositeSourceObservation()
  expect(observation.defaultActionIds).toEqual([
    'process-current-add-links',
    'batch-generate-from-titles',
    'batch-mermaid-fix',
  ])
})

it('requires explicit destination and unresolved-error paths', async () => {
  const observation = await readCompositeSourceObservation()
  expect(observation.expectedOutputPaths).toContain('completed/alpha.md')
  expect(observation.expectedOutputPaths).toContain('mermaid-errors/report.md')
})
~~~

- [ ] **Step 2: Run the focused test and verify the missing observation fails**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/composite-source-contracts.test.ts

Expected: FAIL because the composite lock and source fixture are not registered.

- [ ] **Step 3: Add the pinned observation and deterministic Markdown inputs**

Store the source commit, action order, output paths, pre-existing destination collision, unresolved Mermaid case, and exact SHA-256 hashes in composite-source-lock.json. Keep generated prose deterministic and small; do not snapshot provider responses or credentials.

- [ ] **Step 4: Run the focused test and the existing source contract gate**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/composite-source-contracts.test.ts packages/notemd-workflows/test/source-contracts.test.ts

Expected: PASS with the existing 29-operation matrix unchanged.

- [ ] **Step 5: Commit the fixture contract**

Run: rtk git add fixtures/migration packages/notemd-workflows/test/composite-source-contracts.test.ts; rtk git commit -m "test: lock one-click extract source semantics"

---

### Task 2: Add optional composite mutation lineage without breaking Plan v1

**Files:**
- Create: packages/notemd-mutation/src/composite-lineage.ts
- Modify: packages/notemd-mutation/src/mutation-plan.ts
- Modify: packages/notemd-mutation/src/index.ts
- Modify: packages/notemd-mutation/test/mutation-plan.test.ts
- Create: packages/notemd-mutation/test/composite-lineage.test.ts

**Interfaces:**
- Create CompositeMutationLineage with workflowId, workflowVersion, definitionDigest, stepId, and ordinal.
- Add optional composite to MutationProvenanceDraft and MutationProvenance.
- Canonicalize composite lineage only when present; old plans without it must hash exactly as before.

- [ ] **Step 1: Write digest-compatibility and validation tests**

~~~ts
it('keeps the legacy digest when composite lineage is absent', () => {
  expect(createWorkspaceMutationPlan(legacyDraft()).digest).toBe(knownLegacyDigest)
})

it('rejects a lineage with an empty step id or invalid ordinal', () => {
  expect(() => createWorkspaceMutationPlan(draftWithInvalidComposite())).toThrow(RangeError)
})

it('includes ordered lineage in the composite plan digest', () => {
  expect(planFor('add-links').digest).not.toBe(planFor('generate-complete').digest)
})
~~~

- [ ] **Step 2: Run the mutation tests and capture the red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts packages/notemd-mutation/test/composite-lineage.test.ts

Expected: FAIL because the optional lineage type and canonicalization do not exist.

- [ ] **Step 3: Implement the narrow optional extension**

Use a separate composite-lineage.ts validator for non-empty workflow and step identifiers, version 1, a 64-character SHA-256 definition digest, and a non-negative safe ordinal. Include the normalized record in canonicalProvenance only when draft.composite exists. Do not alter version, id format, conflict policy, or staged-asset rules.

- [ ] **Step 4: Run focused and package gates**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts packages/notemd-mutation/test/composite-lineage.test.ts; rtk pnpm --filter @notemd-harness/mutation typecheck; rtk pnpm --filter @notemd-harness/mutation build

Expected: PASS; legacy fixture digest remains unchanged.

- [ ] **Step 5: Commit the mutation contract**

Run: rtk git add packages/notemd-mutation; rtk git commit -m "feat: add optional composite mutation lineage"

---

### Task 3: Build the virtual workspace overlay and deterministic accumulator

**Files:**
- Create: packages/notemd-composites/package.json
- Create: packages/notemd-composites/tsconfig.json
- Create: packages/notemd-composites/src/diagnostics.ts
- Create: packages/notemd-composites/src/workspace-overlay.ts
- Create: packages/notemd-composites/src/mutation-accumulator.ts
- Create: packages/notemd-composites/test/workspace-overlay.test.ts
- Create: packages/notemd-composites/test/mutation-accumulator.test.ts
- Modify: pnpm-workspace.yaml and tsconfig.json to include the package.

**Interfaces:**
- CompositeWorkspaceView implements NotemdVault and adds applyPlannedPlan(plan, lineage) and finalize().
- MutationAccumulator records base state, virtual state, and step lineage, then emits one net WorkspaceMutationPlan.
- Diagnostics are a closed union: composite-path-invalid, composite-virtual-revision-conflict, composite-destination-collision, composite-binary-dependency-unsupported, composite-budget-exceeded, and composite-no-op.

- [ ] **Step 1: Write overlay tests for read-after-plan and delete visibility**

~~~ts
it('makes a planned Markdown write visible to the next step', async () => {
  const overlay = await createOverlay({ 'notes/source.md': 'old' })
  overlay.applyPlannedPlan(writePlan('notes/source.md', 'new'), lineage('add-links'))
  await expect(overlay.read('notes/source.md')).resolves.toMatchObject({ content: 'new' })
})

it('removes a planned delete from listMarkdown without touching disk', async () => {
  const overlay = await createOverlay({ 'notes/source.md': 'old' })
  overlay.applyPlannedPlan(deletePlan('notes/source.md'), lineage('repair-mermaid'))
  await expect(overlay.listMarkdown()).resolves.not.toContain('notes/source.md')
  await expect(readPhysicalFixture()).resolves.toBe('old')
})
~~~

- [ ] **Step 2: Write accumulator collision and net-transition tests**

~~~ts
it('coalesces sequential text writes into one base-revision write', () => {
  const plan = finalizeAfter(write('notes/a.md', 'one'), write('notes/a.md', 'two'))
  expect(plan.mutations).toHaveLength(1)
  expect(plan.mutations[0]).toMatchObject({
    kind: 'write-text',
    destination: 'notes/a.md',
    expectedRevision: baseRevision,
    content: 'two',
  })
})

it('fails closed for incompatible same-destination media types', () => {
  expect(() => finalizeAfter(textWrite(), bytesWrite())).toThrow('composite-destination-collision')
})
~~~

- [ ] **Step 3: Run the new tests to verify the red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/workspace-overlay.test.ts packages/notemd-composites/test/mutation-accumulator.test.ts

Expected: FAIL because the package and overlay do not exist.

- [ ] **Step 4: Implement lazy base reads, virtual revisions, bounded state, and net aggregation**

The overlay must read the base vault once per path, validate every incoming expectedRevision against virtual state, expose sorted Markdown paths, and retain physical state untouched. The accumulator must collapse final state back to one mutation per destination and invoke createWorkspaceMutationPlan. Apply file-count and UTF-8 byte budgets before accepting another step.

- [ ] **Step 5: Run focused package gates**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/workspace-overlay.test.ts packages/notemd-composites/test/mutation-accumulator.test.ts; rtk pnpm --filter @notemd-harness/composites typecheck; rtk pnpm --filter @notemd-harness/composites build

Expected: PASS with no physical workspace writes.

- [ ] **Step 6: Commit the overlay boundary**

Run: rtk git add pnpm-workspace.yaml tsconfig.json packages/notemd-composites; rtk git commit -m "feat: add composite workspace overlay"

---

### Task 4: Add source-faithful atomic batch planners and one-click definition

**Files:**
- Modify: packages/notemd-workflows/src/index.ts
- Modify: packages/notemd-workflows/src/plan-factory.ts
- Create: packages/notemd-workflows/test/source-faithful-batch-planners.test.ts
- Create: packages/notemd-composites/src/one-click-extract.ts
- Create: packages/notemd-composites/src/index.ts
- Create: packages/notemd-composites/test/one-click-extract.test.ts
- Modify: packages/notemd-composites/package.json

**Interfaces:**
- Add SourceFaithfulBatchPlanner with planBatchTitleGeneration(sourceFolderPath, completedFolderPath, signal?) and planBatchMermaidRepair(folderPath, errorFolderPath, signal?).
- Return undefined for a valid empty batch; throw a typed error for invalid paths, collisions, stale revisions, or malformed generated content.
- Export createOneClickExtractDefinition() and planOneClickExtract(request, dependencies, signal?).

- [ ] **Step 1: Write source-faithful planner tests**

~~~ts
it('writes generated title output to completedFolderPath and removes the source copy', async () => {
  const plan = await planner.planBatchTitleGeneration('concepts', 'completed')
  expect(destinations(plan)).toEqual(['completed/alpha.md', 'completed/beta.md', 'concepts/alpha.md', 'concepts/beta.md'])
})

it('reports unresolved Mermaid files and emits the configured error-folder move', async () => {
  const plan = await planner.planBatchMermaidRepair('completed', 'mermaid-errors')
  expect(destinations(plan)).toContain('mermaid-errors/report.md')
})
~~~

- [ ] **Step 2: Write the definition test before implementation**

~~~ts
it('has a stable ordered definition digest and fixed fail-fast policy', () => {
  const definition = createOneClickExtractDefinition()
  expect(definition.id).toBe('one-click-extract')
  expect(definition.version).toBe(1)
  expect(definition.failurePolicy).toBe('fail-fast')
  expect(definition.steps.map((step) => step.id)).toEqual([
    'add-links',
    'generate-complete',
    'repair-mermaid',
  ])
})
~~~

- [ ] **Step 3: Run the focused tests and verify the semantic gap**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-faithful-batch-planners.test.ts packages/notemd-composites/test/one-click-extract.test.ts

Expected: FAIL because current folder planners do not model source move/report semantics and the definition is absent.

- [ ] **Step 4: Implement the named planners and definition**

Keep existing planTitlesInFolder and planMermaidRepairsInFolder behavior unchanged for their current Tools. Add separate source-faithful operations that use deterministic lexical snapshots, explicit output folders, content-addressed generated writes, delete/write moves, report paths, and closed collision diagnostics. Implement one-click-extract as a typed three-step definition that calls only these named operations and applies each result to CompositeWorkspaceView.

- [ ] **Step 5: Run workflow and composite focused gates**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-faithful-batch-planners.test.ts packages/notemd-composites/test/one-click-extract.test.ts packages/notemd-workflows/test/composite-source-contracts.test.ts; rtk pnpm --filter @notemd-harness/workflows typecheck; rtk pnpm --filter @notemd-harness/composites typecheck

Expected: PASS with source fixture output paths and definition digest fixed.

- [ ] **Step 6: Commit atomic and definition behavior**

Run: rtk git add packages/notemd-workflows packages/notemd-composites; rtk git commit -m "feat: define one-click extract semantics"

---

### Task 5: Integrate the composite service with Cordis

**Files:**
- Modify: packages/notemd-bundle/src/workflows.ts
- Create: packages/notemd-bundle/src/composites.ts
- Modify: packages/notemd-bundle/src/index.ts
- Modify: packages/notemd-bundle/package.json
- Modify: packages/notemd-bundle/cordis.patch.yml
- Create: packages/notemd-bundle/test/composites.contract.test.ts
- Modify: packages/notemd-bundle/test/runtime-boundary.test.ts

**Interfaces:**
- NotemdWorkflowsService implements ScopedWorkflowPlannerFactory via createScopedPlanner(vault).
- NotemdCompositeWorkflowService extends Cordis Service and declares static inject = ['notemdVault', 'notemdWorkflows'] as const.
- Service method planOneClickExtract(request, signal?) delegates to @notemd-harness/composites and returns one WorkspaceMutationPlan.

- [ ] **Step 1: Write Cordis boundary tests**

~~~ts
it('declares static injection and does not own a second vault or transformer', () => {
  expect(NotemdCompositeWorkflowService.inject).toEqual(['notemdVault', 'notemdWorkflows'])
})

it('registers one service and one dependency row in the complete patch', () => {
  expect(bundlePatch()).toContain('notemdCompositeWorkflows')
})
~~~

- [ ] **Step 2: Run the boundary tests and capture the red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-bundle/test/composites.contract.test.ts packages/notemd-bundle/test/runtime-boundary.test.ts

Expected: FAIL because the service and patch row do not exist.

- [ ] **Step 3: Add the scoped factory and thin Cordis adapter**

Keep NotemdWorkflowsService as the transformer owner. The composite service only validates lifecycle state, calls the pure planner, and lets Cordis own any future effects. It must not read environment variables, create a provider, access Obsidian APIs, or write the workspace.

- [ ] **Step 4: Complete the bundle registration**

Add the composite package to dependencies and bundledDependencies. Add a complete replacement row to cordis.patch.yml so clean-profile loading either installs the named service or reports its optional DSH dependency outcome explicitly.

- [ ] **Step 5: Run bundle typecheck/build and boundary tests**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-bundle/test/composites.contract.test.ts packages/notemd-bundle/test/runtime-boundary.test.ts; rtk pnpm --filter dsh-notemd typecheck; rtk pnpm --filter dsh-notemd build

Expected: PASS with one composition root and no import cycle.

- [ ] **Step 6: Commit Cordis integration**

Run: rtk git add packages/notemd-bundle; rtk git commit -m "feat: register composite workflow service"

---

### Task 6: Expose named Tools and durable composite jobs

**Files:**
- Modify: packages/notemd-tools/src/notemd-services.ts
- Modify: packages/notemd-tools/src/plan-tools.ts
- Modify: packages/notemd-tools/src/job-tools.ts
- Modify: packages/notemd-tools/package.json
- Modify: packages/notemd-bundle/src/tools.ts
- Modify: packages/notemd-bundle/src/jobs.ts
- Modify: packages/notemd-bundle/src/index.ts
- Create: packages/notemd-tools/test/composite-tools.contract.test.ts
- Modify: packages/notemd-tools/test/tools.contract.test.ts
- Modify: packages/notemd-jobs/test/durable-workflow-runner.test.ts

**Interfaces:**
- Add NotemdCompositeWorkflows with planOneClickExtract(request, signal?) and definition().
- Add NotemdJobs.startOneClickExtract(request): Promise<JobRecord>.
- Add OneClickExtractJobRequest with idempotencyKey, sourcePath, conceptFolderPath, completedFolderPath, mermaidFolderPath, and optional mermaidErrorFolderPath.
- Register exactly notemd_plan_one_click_extract and notemd_job_start_one_click_extract; resume/status/cancel remain unchanged.

- [ ] **Step 1: Write closed Tool and job contract tests**

~~~ts
it('rejects unknown composite request fields at the Tool edge', async () => {
  const result = await invoke('notemd_plan_one_click_extract', {
    sourcePath: 'notes/source.md',
    conceptFolderPath: 'concepts',
    completedFolderPath: 'completed',
    mermaidFolderPath: 'completed',
    unexpected: true,
  })
  expect(result).toMatchObject({ status: 'invalid-input' })
})

it('persists only canonical paths and definition identity in a composite job', async () => {
  const job = await jobs.startOneClickExtract(validRequest())
  expect(job.input).not.toHaveProperty('prompt')
  expect(job.input).toMatchObject({ workflow: 'one-click-extract@1' })
})
~~~

- [ ] **Step 2: Run the focused contract tests and verify the red state**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-tools/test/composite-tools.contract.test.ts packages/notemd-tools/test/tools.contract.test.ts packages/notemd-jobs/test/durable-workflow-runner.test.ts

Expected: FAIL because the service interface, Tool registrations, and executor entry are absent.

- [ ] **Step 3: Implement edge validation and named registration**

Use the existing requiredString/path normalization helpers and closed author schema. Do not accept an actions array, raw DSL, provider fields, or a failure-policy selector. The plan Tool returns one existing workspaceMutationPlan schema; the job Tool uses the existing jobRecord schema.

- [ ] **Step 4: Extend the existing job runner without a new store**

Register one executor keyed by one-click-extract@1. Persist the request paths, idempotency key, definition digest, and step checkpoint metadata only. Resolve the composite service at execution time; preserve explicit resume, cancellation, and terminal state handling.

- [ ] **Step 5: Run Tool/job focused gates and package checks**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-tools/test/composite-tools.contract.test.ts packages/notemd-tools/test/tools.contract.test.ts packages/notemd-jobs/test/durable-workflow-runner.test.ts; rtk pnpm --filter @notemd-harness/tools typecheck; rtk pnpm --filter @notemd-harness/jobs typecheck

Expected: PASS with no second approval or mutation path.

- [ ] **Step 6: Commit named Tool and job surfaces**

Run: rtk git add packages/notemd-tools packages/notemd-bundle/src/tools.ts packages/notemd-bundle/src/jobs.ts packages/notemd-jobs; rtk git commit -m "feat: expose one-click extract tools and jobs"

---

### Task 7: Prove aggregate approval, cancellation, and clean-profile behavior

**Files:**
- Create: packages/notemd-composites/test/one-click-extract.integration.test.ts
- Create: packages/notemd-bundle/test/composite-approval.test.ts
- Modify: packages/notemd-tools/test/tools.contract.test.ts
- Modify: scripts/accept-dsh-profile.ts
- Modify: packages/notemd-bundle/test/acceptance-fixture.test.ts if the existing acceptance fixture is the appropriate owner.

**Interfaces:**
- The aggregate plan is approved once and applied once through notemd_request_plan_approval and notemd_apply_approved_plan.
- A stale base revision returns the existing conflict outcome and emits no workspace change event.
- Cancellation returns a terminal cancelled job state without an approvable partial plan.
- An unavailable optional DSH runtime returns the named capability-unavailable outcome; it is not converted into success.

- [ ] **Step 1: Write the approval and lifecycle tests**

~~~ts
it('uses one receipt for all three steps and applies once', async () => {
  const plan = await planOneClickExtract(validRequest())
  const receipt = await requestApproval(plan)
  expect(await applyApproved(receipt)).toMatchObject({ status: 'committed' })
  expect(await countMutationReceipts()).toBe(1)
})

it('fails closed on stale source revision before approval', async () => {
  const plan = await planOneClickExtract(validRequest())
  await mutatePhysicalSource()
  await expect(applyApproved(await requestApproval(plan))).resolves.toMatchObject({ status: 'conflict' })
})
~~~

- [ ] **Step 2: Run the focused lifecycle tests and capture missing behavior**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/one-click-extract.integration.test.ts packages/notemd-bundle/test/composite-approval.test.ts

Expected: FAIL until the aggregate receipt, stale-revision, and cancellation paths are wired.

- [ ] **Step 3: Wire the existing approval/event path**

Do not add a composite-specific executor. The aggregate WorkspaceMutationPlan enters the existing approval ledger, is consumed by the existing one-time receipt, and is applied by LocalMutationExecutor. Workspace events are emitted only from the committed receipt.

- [ ] **Step 4: Extend clean DSH profile acceptance**

Install the packed dsh-notemd tarball into an isolated profile, invoke notemd_plan_one_click_extract with the deterministic fixture, assert the closed output schema, and assert unavailable DSH capabilities remain explicit.

- [ ] **Step 5: Run the focused and acceptance gates**

Run: rtk pnpm exec vitest run --config vitest.config.ts packages/notemd-composites/test/one-click-extract.integration.test.ts packages/notemd-bundle/test/composite-approval.test.ts; rtk pnpm accept:dsh

Expected: PASS; no physical file changes occur before approval.

- [ ] **Step 6: Commit the acceptance evidence**

Run: rtk git add packages/notemd-composites packages/notemd-bundle scripts; rtk git commit -m "test: verify composite approval and acceptance"

---

### Task 8: Update bilingual evidence and publish only after the full gate

**Files:**
- Modify: docs/specs/2026-08-21-dsh-notemd-composite-workflow-architecture.md
- Modify: docs/specs/2026-08-21-dsh-notemd-composite-workflow-architecture.zh-CN.md
- Modify: docs/superpowers/plans/2026-08-21-dsh-notemd-composite-workflow.md
- Modify: docs/superpowers/plans/2026-08-21-dsh-notemd-composite-workflow.zh-CN.md
- Modify: docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md
- Modify: docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md
- Modify: docs/specs/2026-08-17-dsh-notemd-current-state-architecture-audit.md
- Modify: docs/specs/2026-08-17-dsh-notemd-current-state-architecture-audit.zh-CN.md
- Do not modify README.md or README.zh-CN.md to embed this plan.

**Interfaces:**
- Phase records must distinguish implemented code, measured evidence, and planned work.
- English and Chinese documents must contain the same source/target locks, phase status, rejected alternatives, and exit criteria.

- [ ] **Step 1: Record the implementation phase honestly**

Update Phase 19 only with measured facts. Before runtime code lands, the status must read: Architecture and implementation plan recorded. Runtime implementation not started in this phase. After each subsequent task, append its exact files, focused test count, capability limits, and next gate.

- [ ] **Step 2: Run documentation checks**

Run: rtk git diff --check; rtk rg "one-click-extract|3169964|07c629c6|dsh-notemd@0.1.1" docs/specs docs/superpowers/plans docs/walkthroughs

Expected: both language pairs contain the same identity and workflow terms, and no homepage plan link is added.

- [ ] **Step 3: Run the full repository release gate**

Run: rtk pnpm typecheck; rtk pnpm lint; rtk pnpm test; rtk pnpm test:coverage; rtk pnpm build; rtk pnpm pack:bundle; rtk pnpm verify:bundle; rtk pnpm accept:dsh; rtk git diff --check

Expected: every command exits zero. Optional native capability reports may remain unavailable and must remain truthful.

- [ ] **Step 4: Inspect the staged diff and commit**

Run: rtk git status --short; rtk git diff --stat; rtk git add docs packages fixtures scripts pnpm-workspace.yaml tsconfig.json; rtk git commit -m "feat: add Cordis composite workflow architecture"

Expected: only scoped implementation, fixture, and bilingual documentation files are staged.

- [ ] **Step 5: Push main and verify remote parity**

Run: rtk proxy git -c core.sshCommand="ssh -o ControlMaster=no -o ControlPath=none" push origin main; rtk git fetch origin main; rtk git status --short --branch; rtk git log -1 --oneline; rtk gh api repos/Jacobinwwey/dsh-NotEMD/commits/main --jq .sha

Expected: non-force push succeeds, local main and origin/main resolve to the same commit, and the worktree reports only ## main.

## Exit criteria

The implementation phase may claim completion only when all of the following are true:

- Source fixture and current source lock are pinned; dirty Drawnix paths remain excluded.
- Source-faithful batch title and Mermaid planners pass deterministic tests.
- The overlay proves virtual read/list, revision conflicts, budgets, and collision failure.
- one-click-extract@1 has a stable definition digest and fixed fail-fast semantics.
- Exactly one aggregate plan, one approval receipt, and one committed mutation receipt are observed.
- Named plan/job Tools pass closed schema and durable-resume tests.
- Clean DSH profile acceptance passes from the packed tarball.
- Full typecheck, lint, test, coverage, build, bundle verification, and git diff gates pass.
- main is pushed non-force and the worktree is clean.\n
