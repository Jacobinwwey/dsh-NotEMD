# DSH NoteMD Composite Workflow Architecture

> Chinese version: 2026-08-21-dsh-notemd-composite-workflow-architecture.zh-CN.md

**Decision status:** Architecture and implementation plan recorded. Runtime implementation has not started in this phase.

**Scope lock:** The target is the standalone DeepSeek Harness bundle. Obsidian UI, editor, command, modal, settings, and host lifecycle behavior remain outside the bundle. DSH owns LLM, Web, provider selection, credentials, and transport.

**Evidence locks:**

- Target: dsh-NotEMD main at 3169964; npm package dsh-notemd@0.1.1.
- Current source observation: ref/obsidian-NotEMD at 07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5.
- Historical behavior oracle: obsidian-NoteMD_new at 4168a51cd19ad8c3d1e05f604b50936255461a31.
- Slidev compatibility remains locked to github:Jacobinwwey/slidev at bbcb2efae709c2ebaa96bda522cd6c192476817c.

## 1. Decision

Introduce one named, typed composite workflow: one-click-extract@1.

It is a domain package, not a generic action dispatcher. The definition is compiled into the bundle, has a fixed ordered step list, a fixed fail-fast policy, a definition digest, and an explicit request schema. The first version plans one aggregate immutable WorkspaceMutationPlan. Approval and application continue to use the existing one-time receipt and journaled executor.

The source plugin default button is semantically:

~~~text
process-current-add-links
  -> batch-generate-from-titles
  -> batch-mermaid-fix
~~~

The source implementation carries hidden UI state between steps: a preferred concept folder and the most recent generated complete folder. A standalone DSH runtime cannot infer an active file, selected folder, Obsidian settings, or a UI-owned output folder. The composite request therefore makes those paths explicit and derives later step inputs from the request and the virtual workspace overlay.

This is deliberately narrower than importing the source custom-workflow DSL. A raw action-list dispatcher would expose an unbounded Tool surface, make operation compatibility implicit, and let callers bypass step invariants. Future user-defined composites must be separately versioned definitions with capability declarations; they are not part of one-click-extract@1.

## 2. Current gap against the source contract

| Source behavior or previous requirement | Current target evidence | Defect to close |
| --- | --- | --- |
| Default One-Click Extract is a three-step chain with folder context propagation | ref/obsidian-NotEMD/src/workflowButtons.ts and NotemdSidebarView.ts:927-1160 | No composite definition, context object, aggregate plan, or named DSH Tool exists. |
| Batch title generation writes generated content and moves it to a complete folder | ref/obsidian-NotEMD/src/fileUtils.ts:1262 and main.ts:2688 | planTitlesInFolder performs in-place replacement and has no destination-folder or move semantics. |
| Batch Mermaid fix validates, repairs, optionally moves unresolved files, and writes a report | ref/obsidian-NotEMD/src/fileUtils.ts:1521 | planMermaidRepairsInFolder only replaces Markdown fences; it does not model validation, error moves, or report output. |
| Composite steps see previous step output | Existing planners read the physical vault only | A later step cannot read virtual writes without writing early to the workspace. |
| One aggregate approval for a workflow | Existing jobs/checkpoints are per atomic planner result | Applying one workflow could require multiple approvals or leave partial mutations. |
| Source diagram.generate accepts Markdown and generation options | Current source registry.ts and diagram/types.ts | The conformance adapter currently constructs a synthetic DiagramSpec; Markdown-to-intent inference is not proven. |
| DSH/Cordis ownership | Bundle services already use static inject and ctx.effect | The composite service and package must preserve lifecycle and dependency direction. |

The current extract-and-generate planner is not a substitute: it generates only the first extracted concept, uses hardcoded concepts/ and generated/ destinations, and has no virtual follow-up step.

## 3. Goals and non-goals

### Goals

- Preserve the existing read -> plan -> approve -> apply -> receipt pipeline.
- Make the source default workflow callable without Obsidian host context.
- Keep composite planning side-effect free until approval application.
- Make ordering, failure policy, path resolution, and lineage inspectable and digestable.
- Reuse named atomic planners only where their semantics are proven; add source-faithful batch planners where they are not.
- Resume a persisted job only when workflow id, version, and definition digest match.
- Keep old non-composite WorkspaceMutationPlan values valid and digest-compatible when lineage is absent.

### Non-goals

- Importing or evaluating the source custom-workflow DSL.
- Moving Obsidian UI progress, Notices, selection dialogs, or active-file discovery into DSH.
- Adding generic notemd_run(type, options).
- Adding provider credentials, endpoints, model discovery, or Web transport to NoteMD.
- Claiming multi-process job scheduling, filesystem-wide ACID, or native renderer parity from SVG projections.
- Implementing Drawnix WIP from the dirty source checkout.

## 4. Target topology

~~~mermaid
flowchart TD
  F["DSH Fiber"] --> B["notemd-bundle"]
  B --> C["NotemdCompositeWorkflowService"]
  C --> CW["@notemd-harness/composites"]
  CW --> W["scoped WorkflowPlanner"]
  W --> V["CompositeWorkspaceView"]
  V --> O["virtual mutation overlay"]
  O --> P["aggregate WorkspaceMutationPlan"]
  P --> A["existing approval ledger"]
  A --> E["existing journaled executor"]
  E --> R["committed receipt and workspace event"]
  B --> T["named plan Tool and named job Tool"]
  T --> C
  B --> L["ctx.llm / ctx.web"]
~~~

Ownership rules:

- @notemd-harness/composites depends on @notemd-harness/workflows, @notemd-harness/mutation, and @notemd-harness/vault. Workflows never imports composites.
- The bundle is the only Cordis composition root. The pure composites package creates no Context, Service, timer, process, or global singleton.
- NotemdCompositeWorkflowService uses declared static injection. Any future active planning resources are cleaned by Fiber-owned effects.
- Tools invoke the service; jobs extend the existing FileJobStore and DurableWorkflowRunner. No second job store or mutation executor is permitted.

## 5. Public contracts

~~~ts
export type CompositeWorkflowId = 'one-click-extract'

export interface OneClickExtractRequest {
  readonly sourcePath: string
  readonly conceptFolderPath: string
  readonly completedFolderPath: string
  readonly mermaidFolderPath: string
  readonly mermaidErrorFolderPath?: string
  readonly idempotencyKey?: string
}

export interface CompositeWorkflowDefinition {
  readonly id: CompositeWorkflowId
  readonly version: 1
  readonly definitionDigest: ContentSha256
  readonly failurePolicy: 'fail-fast'
  readonly steps: readonly CompositeStepDefinition[]
}

export interface CompositeStepDefinition {
  readonly id: 'add-links' | 'generate-complete' | 'repair-mermaid'
  readonly operationId:
    | 'file.process-add-links'
    | 'content.batch-generate-from-titles'
    | 'mermaid.batch-fix'
  readonly ordinal: number
}

export interface CompositeStepLineage {
  readonly workflowId: CompositeWorkflowId
  readonly workflowVersion: 1
  readonly definitionDigest: ContentSha256
  readonly stepId: CompositeStepDefinition['id']
  readonly ordinal: number
}

export interface CompositeWorkspaceView extends NotemdVault {
  applyPlannedPlan(plan: WorkspaceMutationPlan, lineage: CompositeStepLineage): void
  finalize(): WorkspaceMutationPlan
}
~~~

Request validation happens once at the Tool/job edge:

- All paths are relative, slash-separated, NUL-free workspace paths.
- sourcePath must be an existing Markdown document in the base snapshot.
- Folder paths are canonicalized once and are not silently replaced by settings.
- A requested destination collision is a closed error. The source behavior that silently skips a pre-existing complete file is a future reconciliation operation, not an implicit overwrite.
- Composite v1 is text/Markdown-readable. A future binary terminal step cannot be read by a later v1 step.

The existing workflow service also exposes an explicit scoped planner factory:

~~~ts
export interface ScopedWorkflowPlannerFactory {
  createScopedPlanner(vault: NotemdVault): WorkflowPlanner
}
~~~

NotemdWorkflowsService implements this factory. The composite service injects notemdVault and notemdWorkflows, then asks the existing service to create a planner over the overlay. This avoids a second transformer owner and keeps the dependency graph acyclic.

## 6. Step semantics and aggregation

one-click-extract@1 has exactly three ordered steps:

1. add-links calls the existing single-document link planner for sourcePath.
2. generate-complete calls a new source-faithful batch title planner with conceptFolderPath and completedFolderPath. It models generated Markdown, source removal/move, complete-folder output, exclusion of already-complete files, and lexical target order. It does not reuse planTitlesInFolder, whose semantics are in-place.
3. repair-mermaid calls a new source-faithful batch Mermaid planner over mermaidFolderPath. It may emit repaired writes, unresolved-file moves to mermaidErrorFolderPath, and a deterministic report write. It cannot claim source parity while it only calls planMermaidRepairsInFolder.

A step returns a non-empty atomic plan or an explicit no-op observation. Internal no-op is allowed, but the root fails with composite-no-op when the final net state has no mutation.

The overlay never touches the file system:

1. Lazily read each base document and retain its original revision/content digest.
2. Validate every incoming expectedRevision against virtual state.
3. Update the virtual document map; Markdown writes become readable by later steps and deletes disappear from listMarkdown.
4. Attach step lineage to staged mutations.
5. Enforce file-count, aggregate UTF-8 byte, and per-completion input budgets before the next LLM call.

Finalization emits one net transition per destination:

- base exists and final text differs: write-text expected at the base revision;
- base exists and final is absent: delete with the base content digest;
- base is absent and final exists: write-text expected absent;
- base equals final: no mutation;
- incompatible media type or staged asset: typed failure.

The aggregate is created through createWorkspaceMutationPlan, so canonical destination ordering and existing digest rules remain authoritative. Root provenance is workflow.one-click-extract; each mutation carries optional composite lineage.

## 7. Approval, jobs, and failure semantics

- notemd_plan_one_click_extract returns exactly one workspaceMutationPlan/v1.
- notemd_job_start_one_click_extract stores only the idempotency key, canonical paths, workflow id/version, and definition digest. It never stores credentials, endpoints, raw Web bodies, or unbounded prompts.
- notemd_job_resume and notemd_job_status remain the existing named lifecycle surface. The executor key is one-click-extract@1; an unknown definition digest fails closed with JOB_WORKFLOW_MISMATCH.
- One aggregate plan receives one approval receipt. Step-level approval is not exposed.
- The first definition is fixed fail-fast. Step error, cancellation, stale virtual revision, collision, budget overflow, or unavailable dependency returns a closed failure and no approvable partial plan.
- The source continue_on_error setting is not carried as a bool or enum parameter. A future best-effort workflow is a different named definition with a different receipt and partial-result contract.

## 8. Forward compatibility

- WorkspaceMutationPlan.version remains 1. Existing plans without composite lineage retain their current canonical digest.
- Composite lineage is optional and typed. Its canonical fields are workflow id, workflow version, definition digest, step id, and ordinal; prompt text and provider endpoints never enter the digest.
- Job workflow keys include the version, and durable records persist the definition digest. Changed ordering or policy cannot silently resume an old record.
- CompositeWorkflowPlan.version is 1 and internal. It is not a second mutation authority; only the finalized WorkspaceMutationPlan crosses the Tool/approval boundary.
- No arbitrary top-level extension fields are reserved. Future metadata must be bounded, JSON-safe, and owned by a versioned family validator.
- New failure policies, binary dependencies, or user-defined steps require a new workflow id/version and fixture; they cannot change one-click-extract@1.

## 9. Rejected alternatives and risks

| Alternative | Rejection reason | Residual risk |
| --- | --- | --- |
| Generic action dispatcher | Loses closed contracts, operation ownership, and reviewable capability boundaries | Named definitions are more verbose. |
| Reuse existing folder planners unchanged | Output semantics do not match source title move or Mermaid report/error behavior | Atomic source-faithful planners add cost before the composite is useful. |
| Apply each step immediately | Creates partial workspace state and multiple approval windows | Aggregate planning needs more memory and overlay collision logic. |
| Public continueOnError option | One flag changes transaction semantics and makes approval ambiguous | A separate best-effort definition is required later. |
| Let the overlay write temporary files | Violates plan purity and can leak unapproved content | In-memory state needs explicit budgets. |
| Put orchestration in tools or jobs | Duplicates domain logic and diverges for non-Tool callers | Bundle service remains a thin Cordis adapter. |
| Treat SVG as universal preview | Misrepresents PPTX/MP4/Draw.io/Circuitikz fidelity | Native capability remains opt-in and truthful. |

Primary risks:

- LLM output can make overlay state unbounded. Enforce budgets and reject before the next step; never silently truncate.
- Existing complete destinations cause v1 collision failure, unlike the source skip behavior. Document this explicitly and add a separate reconciliation operation later.
- Current source remote-main has diagram and normalization drift beyond the historical oracle. Composite work must not smuggle that drift into the contract.
- FileJobStore remains single-process; composite jobs do not improve scheduler guarantees.

## 10. Architecture-phase exit

This phase is complete when the paired decision record and implementation plan are committed, progress and audit records contain exact target/source locks and say runtime implementation has not started, and the plan names every file, interface, focused test, full gate, and release condition.

The README homepage is not changed to contain the implementation plan. The next phase implements source-faithful atomic batch planners and the virtual overlay. No runtime composite claim is valid before the focused conformance fixture, aggregate approval test, clean-profile acceptance, and full release gate pass.\n
