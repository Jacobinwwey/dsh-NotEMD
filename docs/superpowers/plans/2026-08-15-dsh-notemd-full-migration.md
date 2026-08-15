# DSH NoteMD Full Migration Implementation Plan

> Chinese version: [2026-08-15-dsh-notemd-full-migration.zh-CN.md](2026-08-15-dsh-notemd-full-migration.zh-CN.md)

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` task-by-task in this session. Do not delegate tasks to subagents for this plan.

**Goal:** Deliver behavior-contract parity for every in-scope non-Obsidian NoteMD workflow as a standalone DeepSeek Harness bundle with DSH-owned LLM/Web integration, recoverable workspace mutations, and truthful renderer/export providers.

**Architecture:** Preserve the existing read, approval, job, and incremental-index foundations, but replace the text-only write path with a journaled mutation protocol. Keep all domain transformations pure until they emit a reviewable mutation proposal; use DSH service seams for LLM and web access, and use named renderer providers for targets with distinct fidelity or process-security semantics.

**Tech Stack:** Node.js `>=22.19.0`, pnpm `10.7.1`, TypeScript strict mode, Vitest, Cordis, DSH LLM/Web/Tool services, MiniSearch, Markdown AST tooling, and optional Slidev/Playwright/FFmpeg/Tectonic/Draw.io runtimes.

## Global Constraints

- Treat `E:/convert/undo/obsidian-NoteMD_new` at `4168a51` and `ref/deepseek-harness` at `47f9438` as read-only references.
- Do not migrate Obsidian UI, editor selection, commands, modals, settings, direct endpoint/key configuration, or current uncommitted Drawnix WIP.
- `ctx.llm` and `ctx.web` are the only default model and network paths. The OpenAI-compatible adapter may remain only as an explicitly loaded legacy adapter.
- Separate planning, approval, and application into named operations; no `dryRun` flag and no generic `notemd_run(type, options)` Tool.
- Every external process runs in staging with an allowlisted executable and argument vector, never a shell, and never writes the workspace directly.
- Update the paired English/Chinese progress records after each task using measured evidence, not forecasts.
- Preserve a clean worktree before each commit. The canonical remote is `git@github.com:Jacobinwwey/dsh-NotEMD.git`; do not rename the npm package as part of this plan.

## Planned Package Graph

```text
notemd-vault                 read-only workspace facts
notemd-mutation              plans, staged assets, receipts, mutation contract
notemd-vault-local           local journal, locks, recovery, local executor
notemd-llm-dsh               ctx.llm consumer bridge
notemd-research              ctx.web consumer and durable evidence
notemd-documents             AST transforms and stable anchors
notemd-knowledge             scoped section retrieval and explanation
notemd-artifacts             DiagramSpec and artifact lineage
notemd-render-*              named SVG-capable or external target providers
notemd-process               allowlisted staging-only process contract
notemd-workflows             orchestration that emits proposals
notemd-jobs                  durable planning/checkpoint orchestration
notemd-tools                 closed-schema, named DSH operations
notemd-bundle                Cordis services, schema config, bundle patch
```

### Task 1: Freeze the Source Behavior Contract

**Files:**
- Create: `fixtures/migration/source-operation-matrix.json`
- Create: `fixtures/migration/notes/`
- Create: `packages/notemd-workflows/test/source-contracts.test.ts`
- Create: `packages/notemd-artifacts/test/source-artifact-contracts.test.ts`
- Modify: `docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md`
- Modify: `docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md`

**Produces:** A machine-readable mapping from all source operation IDs to `included`, `excluded-by-design`, or `excluded-wip`, plus deterministic fixture inputs and normalized expected outputs.

- [x] Extracted the 29 source registry IDs. The matrix contains 18 `included` and 11 `excluded-by-design` operation rows; only the four pinned Drawnix worktree paths are `excluded-wip`.
- [x] Captured 14 deterministic fixtures for chapter splitting, original-text extraction, link generation, title generation, translation, concepts, dedupe, formula repair, Mermaid repair, local retrieval, diagram source, and slide-source preparation.
- [x] Pinned input and artifact SHA-256 values and asserted output schemas, target paths, citations, mutation preconditions, and artifact lineage without snapshotting generated prose.
- [x] Asserted complete included-fixture coverage, exclusion reasons, the exact fixture set, and the exact Drawnix WIP quarantine set.
- [x] Ran focused source-contract tests, full Vitest, and strict TypeScript build verification.
- [x] Recorded source commit, fixture count, exclusions, and test evidence in both progress documents; commit `test: characterize NotEMD migration behavior`.

### Task 2: Introduce Typed Workspace Mutation Proposals

**Files:**
- Create: `packages/notemd-mutation/package.json`
- Create: `packages/notemd-mutation/tsconfig.json`
- Create: `packages/notemd-mutation/src/mutation-plan.ts`
- Create: `packages/notemd-mutation/src/staged-asset.ts`
- Create: `packages/notemd-mutation/src/mutation-receipt.ts`
- Create: `packages/notemd-mutation/src/index.ts`
- Create: `packages/notemd-mutation/test/mutation-plan.test.ts`
- Modify: `pnpm-workspace.yaml`, root `package.json`, and `pnpm-lock.yaml`

**Interfaces:**

```ts
type WorkspaceMutation =
  | WriteTextMutation
  | WriteBytesMutation
  | DeleteMutation

interface WorkspaceMutationPlan {
  readonly version: 1
  readonly id: string
  readonly digest: string
  readonly provenance: MutationProvenance
  readonly mutations: readonly WorkspaceMutation[]
}

interface WorkspaceMutationExecutor {
  apply(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt>
  recover(signal?: AbortSignal): Promise<readonly RecoveredMutation[]>
}
```

- [ ] Write failing tests for deterministic digesting, duplicate destination rejection, text/bytes digest validation, delete preconditions, malformed staged references, and immutable plan snapshots.
- [ ] Implement the discriminated mutations. Common fields are destination, expected revision, provenance, and conflict policy; write variants additionally own media type and content digest.
- [ ] Implement `StagedAssetRef` as an opaque id plus byte length, media type, and SHA-256. Never encode binary payloads inside DSH Tool results.
- [ ] Define a closed receipt vocabulary: `committed`, `conflict`, `rejected`, `cancelled`, `failed`, and `recovered`; attach per-mutation records without raw secret, prompt, or byte payloads.
- [ ] Run `rtk proxy pnpm.cmd --filter @notemd-harness/mutation test` and `rtk tsc`.
- [ ] Update progress records with the new mutation boundary and commit `feat: add typed workspace mutation proposals`.

### Task 3: Build the Local Journaled Mutation Executor

**Files:**
- Create: `packages/notemd-vault-local/src/local-mutation-executor.ts`
- Create: `packages/notemd-vault-local/src/local-mutation-journal.ts`
- Create: `packages/notemd-vault-local/src/staged-asset-store.ts`
- Create: `packages/notemd-vault-local/test/local-mutation-executor.test.ts`
- Modify: `packages/notemd-vault-local/src/local-vault.ts`
- Modify: `packages/notemd-vault-local/src/write-lock.ts`
- Modify: `packages/notemd-vault-local/src/index.ts`
- Modify: `packages/notemd-vault-local/package.json`

**Required state transitions:**

```text
prepared -> staged -> applying -> verified -> committed
prepared | staged | applying -> recovering -> committed | rolled-back | failed
```

- [ ] Write crash-injection tests at every transition, plus same-target conflict, canonical lock ordering, path escape, symlink/junction recheck, binary write, quarantine delete, stale revision, and idempotent recovery tests.
- [ ] Stage bytes below `<workspace>/.notemd/staging/<plan-id>/`; store journal records below `<workspace>/.notemd/mutations/`. Exclude both directories from Markdown indexing.
- [ ] Lock all destinations in normalized lexical order before checking revisions. Apply each single-file write by same-volume temporary replacement and each deletion by reversible quarantine move until commit cleanup.
- [ ] Recompute SHA-256 after replacement, fsync journal transitions where the platform supports it, and leave diagnosable journal state on any failure.
- [ ] Replace `LocalVault.apply(WritePlan)` only after callers migrate; do not retain a second public mutation path.
- [ ] Run `rtk proxy pnpm.cmd --filter @notemd-harness/vault-local test` and `rtk tsc` on Windows.
- [ ] Update progress records with recovery evidence and commit `feat: journal local workspace mutations`.

### Task 4: Migrate Approval, Events, Jobs, and Tools to Mutation Receipts

**Files:**
- Modify: `packages/notemd-tools/src/write-tools.ts`
- Modify: `packages/notemd-tools/src/approval-ledger.ts`
- Modify: `packages/notemd-tools/src/notemd-services.ts`
- Modify: `packages/notemd-tools/src/tool-contract.ts`
- Modify: `packages/notemd-tools/test/approval-ledger.test.ts`
- Modify: `packages/notemd-tools/test/tools.contract.test.ts`
- Modify: `packages/notemd-workspace-events/src/workspace-change-coordinator.ts`
- Modify: `packages/notemd-jobs/src/file-job-store.ts`
- Modify: `packages/notemd-bundle/src/approval.ts`
- Modify: `packages/notemd-bundle/src/vault-local.ts`
- Modify: `packages/notemd-bundle/src/workspace-changes.ts`
- Modify: `packages/notemd-bundle/src/tools.ts`

- [ ] Replace tool-wide `objectOutput` with per-tool closed schemas. Every result is one of explicit success, conflict, rejected, unavailable, cancelled, or failed variants.
- [ ] Bind approval receipts to the full mutation-plan digest and staged asset digests. An expired, consumed, or mismatched receipt must not enter the executor.
- [ ] Publish workspace changes from verified mutation receipts, including deletes. Keep events metadata-only and make the knowledge synchronizer re-read content.
- [ ] Persist job checkpoints as proposal ids/digests and evidence references. Jobs may produce plans but may not invoke approval or mutation application.
- [ ] Add Tool tests proving that a stale plan, staged-asset substitution, and rejected delete do not publish an indexable change.
- [ ] Run `rtk proxy pnpm.cmd --filter @notemd-harness/tools test`, `rtk proxy pnpm.cmd --filter @notemd-harness/workspace-events test`, `rtk proxy pnpm.cmd --filter @notemd-harness/jobs test`, and `rtk tsc`.
- [ ] Update progress records and commit `refactor: route NoteMD writes through mutation receipts`.

### Task 5: Replace the Default LLM Adapter With a DSH Consumer Bridge

**Files:**
- Create: `packages/notemd-llm-dsh/package.json`
- Create: `packages/notemd-llm-dsh/tsconfig.json`
- Create: `packages/notemd-llm-dsh/src/dsh-text-transformer.ts`
- Create: `packages/notemd-llm-dsh/src/index.ts`
- Create: `packages/notemd-llm-dsh/test/dsh-text-transformer.test.ts`
- Modify: `packages/notemd-bundle/src/llm.ts`
- Modify: `packages/notemd-bundle/src/runtime-adapter.ts`
- Modify: `packages/notemd-bundle/cordis.patch.yml`
- Modify: `profiles/notemd/cordis.patch.yml`
- Modify: `packages/notemd-bundle/package.json`

**Interfaces:**

```ts
interface NotemdLlmRoute {
  readonly provider: string
  readonly model: string
  readonly maxTokens?: number
}

interface DshTextTransformer extends TextTransformer {
  complete(request: TextCompletionRequest): Promise<TextCompletion>
}
```

- [ ] Inject `llm` explicitly. Assemble text through DSH's `StreamChunk` protocol and reject terminal error/aborted finishes with provider-neutral NoteMD failures.
- [ ] Keep route policy schema-limited to provider, model, output limits, and prompt policy identifiers. Do not add endpoint, API key, header, transport retry, or model discovery fields.
- [ ] Move OpenAI-compatible diagnostics/discovery behind a separate legacy plugin entry that is absent from default patches.
- [ ] Test text block assembly, usage ordering, cancellation, malformed terminal streams, route selection, and HMR disposal of registered consumers.
- [ ] Run `rtk proxy pnpm.cmd --filter @notemd-harness/llm-dsh test`, `rtk proxy pnpm.cmd --filter @jacobinwwey/notemd-deepseek-harness test`, and `rtk tsc`.
- [ ] Update progress records and commit `feat: consume DSH LLM routes by default`.

### Task 6: Add Native Research Evidence Through `ctx.web`

**Files:**
- Create: `packages/notemd-research/package.json`
- Create: `packages/notemd-research/tsconfig.json`
- Create: `packages/notemd-research/src/research-evidence.ts`
- Create: `packages/notemd-research/src/dsh-research-client.ts`
- Create: `packages/notemd-research/src/index.ts`
- Create: `packages/notemd-research/test/dsh-research-client.test.ts`
- Modify: `packages/notemd-workflows/src/index.ts`
- Modify: `packages/notemd-bundle/src/workflows.ts`
- Modify: `packages/notemd-bundle/src/tools.ts`
- Modify: `packages/notemd-tools/src/plan-tools.ts`

**Interfaces:**

```ts
interface ResearchEvidence {
  readonly id: string
  readonly query: string
  readonly requestedUrl: string
  readonly finalUrl: string
  readonly statusCode: number
  readonly truncated: boolean
  readonly contentSha256: string
  readonly retrievedAt: string
  readonly citations: readonly EvidenceCitation[]
}
```

- [ ] Implement separate named planning operations for research discovery and research synthesis. A synthesis consumes durable evidence ids, never arbitrary untracked passages.
- [ ] Call `ctx.web.search()` with a bounded result count, then `ctx.web.fetch()` only for selected sources. Record redirect final URLs, status, body kind, truncation, and digest.
- [ ] Return `capability-unavailable` for missing/ambiguous DSH providers and unsupported PDF extraction. Do not introduce DuckDuckGo, Tavily, or raw HTTP fallback code.
- [ ] Test provider selection errors, non-2xx fetch result preservation, truncation, citation alignment, evidence digest changes, and cancellation.
- [ ] Run `rtk proxy pnpm.cmd --filter @notemd-harness/research test` and `rtk tsc`.
- [ ] Update progress records and commit `feat: add DSH web research evidence`.

### Task 7: Restore Document Semantics and Explainable Knowledge Retrieval

**Files:**
- Create: `packages/notemd-documents/package.json`
- Create: `packages/notemd-documents/src/markdown-document.ts`
- Create: `packages/notemd-documents/src/chapter-split.ts`
- Create: `packages/notemd-documents/src/original-text.ts`
- Create: `packages/notemd-documents/src/duplicate-reconciliation.ts`
- Create: `packages/notemd-documents/test/chapter-split.test.ts`
- Create: `packages/notemd-documents/test/original-text.test.ts`
- Modify: `packages/notemd-knowledge/src/knowledge-index.ts`
- Modify: `packages/notemd-knowledge/src/incremental-knowledge-synchronizer.ts`
- Modify: `packages/notemd-workflows/src/index.ts`
- Modify: `packages/notemd-workflows/src/plan-factory.ts`
- Modify: `packages/notemd-jobs/src/durable-workflow-runner.ts`

- [ ] Introduce AST-derived sections with stable anchors, title/breadcrumb fields, text/search projections, and source digest; use them for chapter split, knowledge, and link/concept work.
- [ ] Implement chapter plans with manifest ownership, manual-edit digest conflict detection, writes, and stale deletes as one mutation proposal.
- [ ] Implement original-text extraction as separate `planOriginalTextExtraction` and `planMergedOriginalTextExtraction` operations. Do not use a merged-mode flag.
- [ ] Add deterministic folder selectors, output-location policy objects, and named batch workflows for title generation, translation, links, concepts, dedupe, formulas, Mermaid repairs, chapters, and original-text extraction.
- [ ] Restore local-knowledge task roots, section windows, top-k, current-file exclusion, hit explanations, and citation metadata. Keep the index rebuildable.
- [ ] Run package-level tests plus `rtk proxy pnpm.cmd --filter @notemd-harness/workflows test`, `rtk proxy pnpm.cmd --filter @notemd-harness/knowledge test`, and `rtk tsc`.
- [ ] Update progress records and commit `feat: restore NoteMD document and knowledge semantics`.

### Task 8: Establish Diagram Specs, Artifact Lineage, and SVG-Capable Renderers

**Files:**
- Modify: `packages/notemd-artifacts/src/diagram-spec.ts`
- Modify: `packages/notemd-artifacts/src/artifact-manifest.ts`
- Create: `packages/notemd-artifacts/src/svg-sanitizer.ts`
- Create: `packages/notemd-artifacts/test/svg-sanitizer.test.ts`
- Create: `packages/notemd-render-mermaid/`
- Create: `packages/notemd-render-vega-lite/`
- Create: `packages/notemd-render-json-canvas/`
- Create: `packages/notemd-render-html/`
- Create: `packages/notemd-render-editable-svg/`
- Modify: `packages/notemd-bundle/src/artifacts.ts`
- Modify: `packages/notemd-tools/src/artifact-tools.ts`

- [ ] Make `DiagramSpec` versioned and discriminated by canonical target source; include structured graph/chart/circuit inputs, evidence refs, source revision, prompt/model provenance, and renderer intent.
- [ ] Record source, preview, and export entries separately with MIME, SHA-256, parent artifact id, renderer/theme/font fingerprints, and `ready`, `unavailable`, or `failed` state.
- [ ] Implement SVG-capable named renderers. JSON Canvas produces an explicitly labelled SVG projection, not a replacement for `.canvas` source.
- [ ] Sanitize SVG before persistence and verify removal of scripts, event attributes, remote URLs, JavaScript links, and unsafe data URLs.
- [ ] Add one named Tool per rendering target and separate planning/application tools for its artifacts. Avoid a target selector parameter.
- [ ] Run renderer package tests, artifact tests, `rtk tsc`, and `rtk proxy pnpm.cmd pack:bundle`.
- [ ] Update progress records and commit `feat: add artifact lineage and SVG-capable renderers`.

### Task 9: Add Process-Gated Draw.io, Stable Drawnix, and Circuitikz Providers

**Files:**
- Create: `packages/notemd-process/package.json`
- Create: `packages/notemd-process/src/allowlisted-process.ts`
- Create: `packages/notemd-process/test/allowlisted-process.test.ts`
- Create: `packages/notemd-render-drawio/`
- Create: `packages/notemd-render-drawnix/`
- Create: `packages/notemd-render-circuitikz/`
- Modify: `packages/notemd-bundle/cordis.patch.yml`
- Modify: `packages/notemd-bundle/src/artifacts.ts`

- [ ] Define command profiles for Draw.io, Tectonic, PDF/PNG conversion, and stable Drawnix rendering. Validate executable identity, fixed argument construction, output root, timeout, byte budget, and environment allowlist at the provider boundary.
- [ ] Port only committed Drawnix behavior. Exclude `drawnixCrossRootRouter.ts`, `drawnixMindMapProjection.ts`, `drawnixRelationLaneLayout.ts`, their touched support files, and untracked fixtures until a later source commit is pinned.
- [ ] Persist Draw.io XML, Drawnix source, and Circuitikz `.tex` as canonical sources. Generate preview/export derivatives only through their named providers.
- [ ] Test missing executable, nonzero exit, malformed output, output path escape, timeout, cancellation, and source/preview digest lineage.
- [ ] Run provider tests on Windows and capability-unavailable tests without optional binaries.
- [ ] Update progress records and commit `feat: add guarded specialist diagram providers`.

### Task 10: Add Slidev and Media Export Providers

**Files:**
- Create: `packages/notemd-export-slidev/`
- Create: `packages/notemd-export-pptx/`
- Create: `packages/notemd-export-media/`
- Create: provider-specific fixture decks under `fixtures/migration/slides/`
- Modify: `packages/notemd-artifacts/src/artifact-manifest.ts`
- Modify: `packages/notemd-tools/src/artifact-tools.ts`
- Modify: `packages/notemd-bundle/cordis.patch.yml`

- [ ] Port Slidev source preparation and layout validation before adding process calls. Treat prepared Markdown and layout report as canonical artifacts.
- [ ] Add separate named providers for HTML, PDF, PNG, PPTX, and MP4. Each reports its actual capability; SVG never substitutes for PPTX or MP4.
- [ ] Run Slidev/Playwright/FFmpeg processes in staging and return digest-verified staged assets for approval-gated workspace materialization.
- [ ] Test each output's missing dependency path, successful fixture export where runtime exists, output size cap, cleanup, and reproduction from canonical source.
- [ ] Update progress records and commit `feat: add staged Slidev export providers`.

### Task 11: Conformance, HMR, Documentation, and Mainline Publication

**Files:**
- Modify: `scripts/accept-dsh-profile.ts`
- Modify: `scripts/verify-bundle.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: both full-migration architecture, plan, and progress document pairs
- Create: `docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md`
- Create: `docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md`

- [ ] Add a conformance test that consumes `fixtures/migration/source-operation-matrix.json` and fails if an included capability lacks a passing implementation fixture.
- [ ] Test dependency removal/re-addition, HMR disposal, timer/process/staging cleanup ordering, profile config replacement semantics, `ctx.llm` route failure, `ctx.web` provider ambiguity, and clean-profile bundle installation.
- [ ] Run the full release gate:

```powershell
rtk tsc
rtk lint
rtk proxy pnpm.cmd test
rtk proxy pnpm.cmd test:coverage
rtk proxy pnpm.cmd build
rtk proxy pnpm.cmd pack:bundle
rtk proxy pnpm.cmd verify:bundle
rtk proxy pnpm.cmd accept:dsh
rtk proxy git diff --check
```

- [ ] Update both progress records after each verified phase and write the bilingual validation walkthrough with exact command evidence and known environmental provider limits.
- [ ] Verify `main` is current, change `origin` to `git@github.com:Jacobinwwey/dsh-NotEMD.git`, fetch remote `main`, rebase only if needed, make non-force commits, push, and run `rtk git status --short --branch` to prove a clean worktree.

## Plan Review

- Coverage: Tasks 1-4 establish the only safe mutation path; Tasks 5-7 recover DSH-native semantic workflows; Tasks 8-10 add renderer and export parity; Task 11 proves and publishes the result.
- Failure model: deterministic fixture mismatches, DSH provider absence, renderer absence, stale revisions, and recovery transitions are all explicit test cases, never hidden fallbacks.
- Scope control: source host UI, DSH provider configuration, and current Drawnix WIP remain outside the conformance matrix.
