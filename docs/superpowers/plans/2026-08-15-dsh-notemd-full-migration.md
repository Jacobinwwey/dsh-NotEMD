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

- [x] Wrote and observed failing tests for deterministic digesting, duplicate destinations, text/bytes digest validation, empty text payloads, malformed JSON boundary values, delete preconditions, malformed staged references, immutable snapshots, and closed receipt states.
- [x] Implemented immutable discriminated mutations. Every entry owns a destination, expected revision, provenance, and rejecting conflict policy; write variants add canonical media type and content SHA-256.
- [x] Implemented `StagedAssetRef` with an opaque identifier, byte length, media type, and SHA-256. It carries no binary payload and cannot name a staging path.
- [x] Defined the closed receipt vocabulary `committed`, `conflict`, `rejected`, `cancelled`, `failed`, and `recovered`; receipt entries copy only allowlisted metadata, never secrets, prompts, text, or bytes.
- [x] Ran the mutation package test, root project-reference TypeScript build, and workspace test gate.
- [x] Updated progress records with the mutation boundary and verification evidence; commit `feat: add typed workspace mutation proposals`.

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

- [x] Wrote crash-injection tests for every persisted transition, same-target conflict, canonical locking, path escape, symlink/junction recheck, binary write, quarantine delete, stale revisions, retry protection, cancellation, staging integrity, external-change protection, and idempotent recovery.
- [x] Stage plan payloads below `<workspace>/.notemd/staging/<plan-id>/`, keep opaque assets below `.notemd/staging/assets/`, and persist content-free journals below `<workspace>/.notemd/mutations/`; `.notemd` remains excluded from Markdown indexing and idle executor construction creates no workspace state.
- [x] Acquire normalized lexical locks before preflight and share them with the legacy `LocalVault` path. Writes use same-volume staged replacement; deletes use reversible quarantine moves until a verified commit.
- [x] Recompute SHA-256 after replacement, fsync file contents before journal replacement, protect backups/quarantine data with recorded digests, retain diagnostic journal state on failures, and record a separate cleanup-completion fact after terminal mutation state.
- [x] Retained `LocalVault.apply(WritePlan)` as a temporary compatibility surface only. `applyMutationPlan()` and `recoverIncompleteMutationPlans()` share its target locks; Task 4 owns caller migration and removal of the legacy public write path.
- [x] Ran `rtk proxy pnpm.cmd --filter @notemd-harness/vault-local test`, `pnpm typecheck`, and `pnpm lint` on Windows.
- [x] Updated paired progress records with recovery evidence. The phase commit is `feat: journal local workspace mutations`.

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

- [x] Replaced tool-wide `objectOutput` with per-tool closed DSH author schemas. Required output fields now use property-level `required: true`, so the schemas survive real `defineTool()` compilation; every result has an explicit success, conflict, rejected, unavailable, cancelled, or failed variant.
- [x] Bound approval receipts to the canonical mutation-plan digest and sorted staged-asset digests. Expired, consumed, malformed, or mismatched receipts never invoke the executor.
- [x] Publish workspace changes only from matching committed mutation receipts, including metadata-only deletes; rejected, conflict, cancelled, failed, or inconsistent receipts never publish an indexable event, and the knowledge synchronizer re-reads changed Markdown.
- [x] Persist durable checkpoints only as proposal id, proposal digest, and evidence references. Planning jobs can create proposals but have no approval or mutation-application authority.
- [x] Added Tool contract coverage for stale proposals, staged-asset substitution, rejected deletes, unavailable/rejected/cancelled approval decisions, and invalid approval consumption; migrated legacy tests and the clean-profile runner from `WritePlan` to mutation plan/receipt semantics.
- [x] Ran strict typecheck, lint, the full Vitest suite (21 files, 97 tests), build, packed-bundle verification, and clean DSH-profile acceptance. The package boundary now excludes stale build output, source maps, build-info, and non-distribution mutation content.
- [x] Updated paired progress records and prepared the phase commit `refactor: route NoteMD writes through mutation receipts`.

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

- [x] Injected `llm` explicitly. `DshTextTransformer` assembles DSH `StreamChunk` text blocks and maps terminal error/aborted outcomes to provider-neutral NoteMD failures.
- [x] Closed route policy to provider, model, `maxTokens`, and `promptPolicyId`; runtime validation rejects unknown legacy transport fields rather than silently discarding them.
- [x] Moved OpenAI-compatible diagnostics/discovery behind the explicit `./llm-openai-compatible-legacy` entry, which is absent from the default patch.
- [x] Tested text assembly, usage, cancellation, malformed and post-terminal streams, route selection, and owner disposal of active consumers.
- [x] Ran strict TypeScript, the complete Vitest suite (22 files, 109 tests), ESLint, package build, bundle packing/verification, and clean DSH-profile acceptance on Node `v22.19.0` / pnpm `10.7.1`.
- [x] Updated paired progress records and committed Task 5 as `feat: consume DSH LLM routes by default`.

### Task 6: Add Native Research Evidence Through `ctx.web`

**Files:**
- Create: `packages/notemd-research/package.json`
- Create: `packages/notemd-research/tsconfig.json`
- Create: `packages/notemd-research/src/research-evidence.ts`
- Create: `packages/notemd-research/src/dsh-research-client.ts`
- Create: `packages/notemd-research/src/index.ts`
- Create: `packages/notemd-research/test/dsh-research-client.test.ts`
- Create: `packages/notemd-tools/src/research-tools.ts`
- Create: `packages/notemd-bundle/src/research.ts`
- Modify: `packages/notemd-workflows/src/index.ts`, `packages/notemd-jobs/{package.json,tsconfig.json}`, and `packages/notemd-bundle/src/{jobs.ts,workflows.ts,harness-types.d.ts,index.ts,tools.ts}`
- Modify: `packages/notemd-tools/src/{index.ts,notemd-services.ts,plan-tools.ts,job-tools.ts}`, package manifests, project references, Cordis patches, and bundle verification/acceptance scripts

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

- [x] Implemented named discovery, evidence capture, and synthesis operations. Synthesis resolves durable evidence ids through `notemdResearch`; neither Tools nor durable jobs accept arbitrary source passages.
- [x] `DshResearchClient` uses bounded `ctx.web.search()` followed only by selected `ctx.web.fetch()` calls. The catalog persists final URL, non-2xx status, body kind, truncation, digest, retrieval time, and aligned citations under `.notemd/research`.
- [x] Missing or ambiguous DSH Web providers and unsupported body kinds map to `capability-unavailable`; no DuckDuckGo, Tavily, raw HTTP, or fallback transport was added. Tool output exposes evidence metadata but not fetched body text.
- [x] Added provider-selection, non-2xx preservation, truncation, citation alignment, evidence identity, cancellation, closed-schema, durable-job input, packed-bundle, and clean-profile acceptance coverage.
- [x] Ran focused research/workflow/Tool/bundle tests, strict TypeScript, full Vitest, ESLint, build, packed-bundle verification, and clean DSH-profile acceptance.
- [x] Updated paired progress records with measured Task 6 evidence.

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

- [x] Introduced structural Markdown sections with stable anchors, title/breadcrumb fields, text/search projections, and source digest. Chapter planning, knowledge retrieval, wiki-link prompts, and concept prompts consume that one semantic representation.
- [x] Implemented a single chapter mutation proposal containing chapter/TOC/manifest writes and stale deletes. A manifest records content hashes; managed manual edits and unmanaged output collisions reject planning rather than being overwritten.
- [x] Implemented separate `planOriginalTextExtraction` and `planMergedOriginalTextExtraction` operations, including corresponding named folder workflows and Tools. No merged-mode flag selects behavior.
- [x] Added lexical folder target snapshots, output-location policy objects, and named batch workflows for titles, translation, links, concepts, formula and Mermaid repair, chapters, and both original-text extraction modes. Durable job targets are also persisted in canonical lexical order.
- [x] Restored rebuildable section-level local knowledge with task roots, section windows, top-k, current-file exclusion, hit explanations, and `citation:<path>#<anchor>` metadata.
- [x] Ran focused documents, workflow, knowledge, Tool, and durable-job tests; full `pnpm test` (26 files, 132 tests), `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all passed on Node `v22.19.0` / pnpm `10.7.1`.
- [x] Updated paired progress records and committed `feat: restore NoteMD document and knowledge semantics`.

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

- [x] Made `DiagramSpec` versioned and discriminated by canonical target source; it carries structured graph/chart/circuit inputs, evidence refs, source revision, prompt/model provenance, and renderer intent.
- [x] Recorded source, preview, and export entries separately with MIME, SHA-256, parent artifact id, renderer/theme/font fingerprints, and `ready`, `unavailable`, or `failed` state.
- [x] Implemented SVG-capable named renderers. JSON Canvas produces an explicitly labelled SVG projection, not a replacement for `.canvas` source.
- [x] Sanitized SVG before persistence and verified removal of scripts, event attributes, remote URLs, JavaScript links, and unsafe data URLs.
- [x] Added named planning and status Tools per rendering target; artifact planning remains separate from the existing approval-gated application Tool, with no target selector parameter.
- [x] Ran renderer package tests, artifact tests, strict TypeScript, lint, the complete suite, bundle packing/verification, and clean-profile DSH acceptance.
- [x] Updated paired progress records and committed `feat: add artifact lineage and SVG-capable renderers`.

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

- [x] Define command profiles for Draw.io, Tectonic, PDF/PNG conversion, and stable Drawnix rendering. Validate executable identity, fixed argument construction, output root, timeout, byte budget, and environment allowlist at the provider boundary.
- [x] Port only committed Drawnix behavior. Exclude `drawnixCrossRootRouter.ts`, `drawnixMindMapProjection.ts`, `drawnixRelationLaneLayout.ts`, their touched support files, and untracked fixtures until a later source commit is pinned.
- [x] Persist Draw.io XML, Drawnix source, and Circuitikz `.tex` as canonical sources. Generate preview/export derivatives only through their named providers.
- [x] Test missing executable, nonzero exit, malformed output, output path escape, timeout, cancellation, and source/preview digest lineage.
- [x] Run provider tests on Windows and capability-unavailable tests without optional binaries.
- [x] Update progress records and commit `feat: add guarded specialist diagram providers`.

### Task 10: Add Slidev and Media Export Providers

**Files:**
- Create: `packages/notemd-export-slidev/`
- Create: `packages/notemd-export-pptx/`
- Create: `packages/notemd-export-media/`
- Create: provider-specific fixture decks under `fixtures/migration/slides/`
- Modify: `packages/notemd-artifacts/src/artifact-manifest.ts`
- Modify: `packages/notemd-tools/src/artifact-tools.ts`
- Modify: `packages/notemd-bundle/cordis.patch.yml`

- [x] Ported Slidev source preparation and layout validation before process calls. Prepared Markdown and the layout report are canonical artifacts, with offline fonts enforced and existing Slidev decks preserved.
- [x] Added separate named providers for HTML, PDF, PNG, PPTX, and MP4. Each reports its actual capability; SVG never substitutes for PPTX or MP4. The runtime is pinned to the `github:Jacobinwwey/slidev` fork at `bbcb2efae709c2ebaa96bda522cd6c192476817c`.
- [x] Runs Slidev/Playwright/FFmpeg only in staging and returns digest-verified staged assets for approval-gated workspace materialization. The fork standalone archive accepts `index-standalone.html` and legacy `index.html`.
- [x] Tested missing dependencies, fixture-success fakes, output byte caps, staging cleanup, cancellation/process failure mapping, source/report reproducibility, numeric MP4 frame ordering, and staged digest substitution protection. The optional real binaries remain truthfully capability-gated.
- [x] Updated progress records and prepared the phase commit `feat: add staged Slidev export providers`.

### Task 11: Conformance, HMR, Documentation, and Mainline Publication

**Files:**
- Modify: `scripts/accept-dsh-profile.ts`
- Modify: `scripts/verify-bundle.ts`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: both full-migration architecture, plan, and progress document pairs
- Create: `docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md`
- Create: `docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md`

- [x] Added `packages/notemd-workflows/test/migration-conformance.test.ts`, which consumes the source matrix and conformance manifest; every included operation fixture and every required semantic fixture must point at a passing test proof.
- [x] Tested removable optional DSH peer boundaries, complete profile-row replacement configuration, Cordis effect disposal seams, timer/process/staging cleanup ordering, `ctx.llm` route rejection and active-call disposal, `ctx.web` provider ambiguity, and clean-profile bundle installation.
- [x] Ran the full release gate:

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

- [x] Updated both progress records after each verified phase and wrote the bilingual validation walkthrough with exact command evidence and known environmental provider limits.
- [x] Verified `main` was current, fetched remote `main`, found no remote-ahead commits, pushed `73480df` non-force to `origin/main`, and confirmed the post-push worktree was clean.

## Plan Review

- Coverage: Tasks 1-4 establish the only safe mutation path; Tasks 5-7 recover DSH-native semantic workflows; Tasks 8-10 add renderer and export parity; Tasks 11-12 prove and publish the result.
- Failure model: deterministic fixture mismatches, DSH provider absence, renderer absence, stale revisions, and recovery transitions are all explicit test cases, never hidden fallbacks.
- Scope control: source host UI, DSH provider configuration, and current Drawnix WIP remain outside the conformance matrix.

## Post-release continuation plan (2026-08-17)

Tasks 1-12 are closed by the published release and are not reopened. This section is the executable continuation plan from target commit `488378fb6a1429683bf1789f418abca8992bd3a2`, with the source oracle still pinned to `4168a51cd19ad8c3d1e05f604b50936255461a31`.

### Phase 12: Executable conformance adapters

- Replace free-form proof-term matching with typed fixture adapters under `fixtures/migration` and explicit operation-to-fixture mappings in `packages/notemd-workflows/test` and `packages/notemd-artifacts/test`.
- Keep shared semantic fixtures explicit; require every included source operation to execute at least one mapped adapter, and fail closed when an excluded operation is reintroduced without a reason.
- Exit evidence: deleting a mapping, skipping an adapter, or changing a fixture digest fails the conformance suite with the operation ID and fixture ID.
- [x] Implemented manifest v2 with `adapterId`, `sourceOperationIds`, and executable `operationIds`; removed `testPath`/`proofTerms` as a conformance mechanism.
- [x] Added fourteen temporary-workspace adapters covering nineteen observations, including auxiliary `knowledge.retrieve`, real workflow/artifact/Slidev source planner execution, source revision normalization, and `finally` cleanup.
- [x] Corrected fixture contracts from observed source behavior: chapter `_chapters` ownership, `_Extracted` original-text output, language-folder translation, content-addressed artifact lineage, source bindings, and operation-specific duplicate schemas.
- [x] Exit gate passed: focused conformance 1 file/2 tests; full Vitest 48 files/185 tests; coverage 77.63% statements, 72.35% branches, 85.33% functions; typecheck, lint, build, bundle verification, clean DSH acceptance, and diff check all passed.

### Phase 13: Real optional-runtime capability lane

- Add an opt-in lane for the pinned `github:Jacobinwwey/slidev` fork, Playwright, FFmpeg, Draw.io, Tectonic, and the stable Drawnix adapter; do not make these binaries core install dependencies.
- Record executable fingerprints, native output digests, staging cleanup, cancellation, and intentional-unavailable results for each capability.
- Exit evidence: each installed capability emits its native artifact from a deterministic fixture; removing the executable reports `unavailable` without weakening the portable-core gate.
- [x] Added `@notemd-harness/process` capability profiles for PDF-to-SVG and PDF-to-PNG and an opt-in `capability:lane` script covering the fork, specialist exporters, and cancellation.
- [x] Fingerprints hash executable bytes when available and fall back to the resolved path only for deterministic fake runtimes; native output digests are recorded per observation.
- [x] The Windows lane produced ready PDF-to-SVG (`2f74b912...`) and PDF-to-PNG (`f2279ebd...`) artifacts from `pdftocairo`; missing Draw.io, Tectonic, Drawnix, Slidev/Playwright, and FFmpeg paths remain `unavailable`.
- [x] The fork manifest is verified before any Slidev result can become ready; this run reported `slidev-fork-unverified`. Cancellation returned `process-cancelled`, and staging cleanup completed successfully.
- [x] Focused gate passed: `typecheck`, `lint`, 2 files/15 tests, capability lane, and `git diff --check`. Strict native availability remains opt-in and does not weaken portable-core acceptance.

### Phase 14: Artifact schema registry and migration policy

- Add family discriminators and a registry owned by `packages/notemd-artifacts` for DiagramSpec/diagram lineage `v2` and document export manifest `v3`.
- Define unknown-family/version rejection, forward-compatible metadata rules, and migration tooling before external consumers depend on the manifests.
- Exit evidence: packed-bundle verification accepts valid v2/v3 artifacts and rejects unknown combinations with a structured diagnostic.
- [x] Added `schemaFamily` discriminators for `diagram-spec@2`, `diagram-lineage@2`, and `document-export@3`; generated manifests and source validators now assert their closed family/version pair.
- [x] Added `artifactSchemaRegistry`, `inspectArtifactSchema`, and `assertArtifactSchema`. Unknown families, unknown versions, invalid known combinations, missing family/version, and invalid metadata return structured diagnostics with stable codes.
- [x] Forward-compatible fields are confined to a JSON-safe `metadata` object; payload validators still reject unsupported top-level fields. `ArtifactSchemaError`, `DiagramSpecError`, and `ArtifactManifestError` retain diagnostics for callers.
- [x] Updated the diagram fixture's content-addressed paths after schemaFamily became part of the canonical spec identity (`9a9e...` -> `ff9a...`), and conformance passed 1 file/2 tests.
- [x] Focused registry/artifact gate passed 17 files/38 tests plus typecheck and lint. The packed-bundle verifier now loads the packaged registry and accepts all three valid fixtures while rejecting `diagram-spec@3` with `invalid-combination`.

### Phase 15: Workspace operations hardening (implemented for the current single-process contract)

- Only if multi-process deployment becomes a requirement, choose between an explicit single-process guard and a durable workspace lease/job backend; per-target file locks are not sufficient scheduling semantics.
- Add lifecycle diagnostics, recovery counters, and cleanup-health facts without adding a database pre-emptively.
- Exit evidence: concurrent processes are either rejected with a clear diagnostic or serialized by a tested lease; duplicate model planning is never silent.
- [x] Selected the explicit single-process guard for the current deployment contract; no SQLite or distributed lease was introduced.
- [x] `WorkspaceOwnershipGuard` owns `.notemd/runtime/workspace-owner.json`, allowlisted metadata (`pid`, process start token, workspace root, owner revision, heartbeat, recovery count), exclusive creation, heartbeat, owner-matched release, and cleanup-health facts.
- [x] A live owner returns `workspace-process-already-owned`; malformed or unreadable lock metadata fails closed. Automatic recovery requires a dead PID and an expired heartbeat, then increments the durable recovery counter and records the recovered owner revision.
- [x] `NotemdVaultLocalService` acquires the guard before `LocalVault.open()` and releases it through a Cordis effect. A vault-open failure releases the guard before propagating the error.
- [x] Focused evidence passed: ownership tests 5/5, existing local-vault/mutation tests 26/26, typecheck, lint, and bundle lifecycle boundary checks. Multi-process serialization remains intentionally out of scope until a durable lease is required.

### Phase 16: Source intake and Drawnix review

- Pin a new source commit before consuming any change after `4168a51`; diff registry IDs, semantic fixtures, and output policies against the existing matrix.
- Classify diagram-gallery, response-cache, render-target, and Drawnix changes separately. Keep the current Drawnix WIP excluded until each path is tied to a committed source contract.
- Exit evidence: a new source lock and matrix/fixture update land together before implementation; rejected WIP remains named and quarantined.
- [x] Pinned candidate source commit `cdf580c6c876190ecc1040caea08e5ba5bee004f` and recorded its dirty checkout state in `fixtures/migration/source-intake-lock.json`.
- [x] Confirmed 29 unchanged operation IDs, no migration fixture hash drift, and one Drawnix-only schema removal; linked the intake lock from `source-operation-matrix.json` without advancing the behavior contract commit.
- [x] Classified diagram-gallery, response-cache, render-target, and Mermaid normalization changes. Provider cache and host preview/gallery behavior are rejected by the DSH/Obsidian boundary; Mermaid normalization is accepted only as a follow-up candidate.
- [x] Named the committed and dirty Drawnix paths in the quarantine record. No source implementation or fixture from the dirty checkout entered the bundle.
- [x] Focused intake gate passed: the typed source-intake lock test, migration conformance test, typecheck, lint, and `git diff --check`.
- [x] Full Phase 15/16 release gate passed: Vitest 52 files/203 tests, coverage 77.68% statements/73.00% branches/85.21% functions, build, packed-bundle verification, clean DSH acceptance, and final `git diff --check`.

### Execution order and record protocol

Phases 12-16 are complete for the pinned non-Obsidian-host contract. Phase 15 is the explicit single-process hardening choice for the current bundle; a durable lease remains deferred until multi-process deployment is required. Phase 16 is audit-only and should run again only when a new source commit is pinned. Each future phase must update both progress files with source/target locks, changed files and owners, measured tests, capability limits, rejected alternatives, risks, and its exit evidence.
