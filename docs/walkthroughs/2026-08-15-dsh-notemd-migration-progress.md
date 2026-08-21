# DSH NoteMD Full Migration Progress

> Chinese version: [2026-08-15-dsh-notemd-migration-progress.zh-CN.md](2026-08-15-dsh-notemd-migration-progress.zh-CN.md)

**Status:** Phases 12-18 of the standalone migration are implemented and the current release is synchronized with `origin/main`. Phase 19 records the Cordis composite-workflow architecture and executable plan; runtime composite implementation has not started in this phase. Slidev export remains pinned to the `Jacobinwwey/slidev` fork, never upstream Slidev.

## 1. Scope Baseline

- Source baseline: `E:\convert\undo\obsidian-NoteMD_new` at `4168a51cd19ad8c3d1e05f604b50936255461a31`.
- Target release: `E:\convert\undo\notemd-deepseek-harness` on `main` at `3169964` (`origin/main` synchronized); the Phase 15-18 release evidence is recorded below and Phase 19 is a design/plan phase.
- In scope: every non-Obsidian-host NoteMD workflow, including documents, knowledge, research, diagrams, artifact export, batch execution, and stable Drawnix behavior.
- Deliberately out of scope: Obsidian UI and host APIs, direct provider configuration, and the source working tree's uncommitted Drawnix WIP.

## 2. Verified Foundations

- The target has one approval-gated, revision-aware `WorkspaceMutationPlan` path, durable plan-only jobs, receipt-derived workspace change reconciliation, and incremental MiniSearch indexing.
- The current runtime already uses Cordis `Service` classes, declared `inject` dependencies, and `ctx.effect()` for the polling scanner and knowledge subscription cleanup.
- The target worktree was clean before this documentation update.
- Task 1 freezes the source boundary in `fixtures/migration/source-operation-matrix.json`: 29 operation IDs, 18 included rows, 11 design exclusions, four exact Drawnix-WIP exclusions, and 14 SHA-256-pinned deterministic fixtures.
- Task 2 adds `@notemd-harness/mutation`, the immutable content-addressed proposal vocabulary for text writes, staged binary writes, deletes, and metadata-only receipts. It is a contract package only; no workspace mutation occurs here.
- Task 3 adds the only recoverable multi-target executor: content-free journals, plan-local staged payloads, SHA-256 verification, reversible deletes, canonical locks, retry protection, and terminal staging cleanup tracking.
- Task 4 removes the legacy public text-write authority. Approval binds plan and staged-asset digests; tools invoke the executor only after a one-time receipt is consumed; jobs retain plan identity only; and workspace events originate only from verified committed receipts.
- Task 5 makes `ctx.llm` the default LLM seam. `@notemd-harness/llm-dsh` consumes DSH streams through a closed route policy, while the old OpenAI-compatible transport is an explicit legacy-only entry.
- Task 6 adds `@notemd-harness/research`: a durable `.notemd/research` catalog backed only by `ctx.web`, with closed named discovery/capture/synthesis Tools and evidence-id-only durable job input.
- Task 7 adds `@notemd-harness/documents` as the sole owner of structural Markdown sections, stable anchors, chapter ownership manifests, original-text output policies, and duplicate diagnostics. `notemd-knowledge` now retrieves section-level, citation-bearing context under task-root/current-file constraints; workflow and Tool surfaces expose the resulting named operations without write authority.
- Task 8 replaces the source-only artifact contract with `DiagramSpec` v2 and a source/preview/export lineage manifest. Five named renderer packages generate canonical Mermaid, Vega-Lite, JSON Canvas, HTML, or editable-SVG sources plus sanitized SVG derivatives; the JSON Canvas SVG is explicitly a projection, not a `.canvas` replacement. Each target has separate named planning/status Tools, while materialization remains on the existing approval-gated mutation path.
- Task 9 adds `@notemd-harness/process` as the only staging-only external process boundary. Draw.io, stable Drawnix, and Circuitikz providers emit deterministic canonical source, labelled SVG projections, truthful native capability outcomes, and (for Circuitikz) digest-verified staged PDF assets. Native exports never write final workspace paths; the process boundary owns executable allowlists, fixed argv, bounded I/O, timeout/cancellation classification, process-tree joining, HMR disposal, and staging cleanup.
- Task 10 adds `@notemd-harness/export-slidev`, `@notemd-harness/export-pptx`, and `@notemd-harness/export-media`. Prepared Slidev Markdown and layout reports are canonical source artifacts; HTML, PDF, PNG, PPTX, and MP4 each have a named provider. The process boundary pins `github:Jacobinwwey/slidev` revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`, stages all output, verifies byte digests, accepts the fork's `index-standalone.html`, and never treats SVG as PPTX/MP4 parity.
- Task 12 replaces indirect conformance proof terms with typed executable fixture adapters. Each adapter creates a temporary workspace, invokes the real workflow, knowledge, artifact, or Slidev source planner, normalizes only contract-level observations, and cleans up in `finally`; the v2 manifest separates source operation mapping from auxiliary executable observations.

## 3. Completed Code Audit

The source registry exposes 29 operations. Its host/provider/profile surfaces are excluded by the approved boundary; the remaining document, knowledge, diagram, and export behaviors are in scope. The source worktree is intentionally dirty in the Drawnix area. The migration baseline excludes the uncommitted cross-root router, mind-map projection, relation-lane layout, their touched support paths, and untracked fixtures.

| Current target area | Confirmed state | Architecture impact |
| --- | --- | --- |
| `packages/notemd-vault/src/revision.ts` | Exposes immutable read revisions only; its public `WritePlan` contract is removed. | Read facts no longer imply mutation authority. |
| `packages/notemd-vault-local/src/local-vault.ts` | Exposes shared-lock journaled mutation application/recovery as the only local write path. | Approval, jobs, events, and Tools converge on one recoverable mutation authority. |
| `packages/notemd-llm-dsh/src/dsh-text-transformer.ts` and `cordis.patch.yml` | The default bridge injects `ctx.llm`, consumes DSH `StreamChunk` values, and accepts only provider/model/output/prompt route policy. | DSH owns credentials and transport; the explicit legacy subpath alone retains OpenAI-compatible diagnostics/discovery. |
| `packages/notemd-research/src/` and `packages/notemd-bundle/src/research.ts` | The catalog persists content-addressed DSH Web discoveries/evidence and the Cordis service injects `web` explicitly. | Provider selection remains DSH-owned; neither the bundle nor a workflow owns network transport. |
| `packages/notemd-workflows/src/index.ts` and `packages/notemd-bundle/src/jobs.ts` | Research synthesis accepts `ResearchEvidence`; Tools and durable jobs persist only evidence ids and resolve them through `notemdResearch`. | Raw caller passages cannot bypass evidence provenance or enter a durable job record. |
| `packages/notemd-documents/src/` and `packages/notemd-knowledge/src/knowledge-index.ts` | Structural Markdown sections feed chapter plans, link/concept prompts, and a rebuildable section-level MiniSearch index. | Retrieval carries task-root selection, current-file exclusion, context windows, explanations, and `citation:<path>#<anchor>` metadata. |
| `packages/notemd-artifacts/src/artifact-manifest.ts` and `packages/notemd-render-*/` | `ArtifactPlanner` freezes v2 source/preview/export lineage with content and renderer/theme/font fingerprints, sanitizes SVG before a mutation plan is emitted, and binds one renderer per canonical SVG-capable target. | SVG is a truthful derivative for Mermaid, Vega-Lite, JSON Canvas, HTML, and editable SVG only; it is not a replacement for future Draw.io, Drawnix, Circuitikz, PPTX, or media sources. |
| `packages/notemd-tools/src/tool-contract.ts` | Each named Tool uses a closed DSH author schema and explicit outcome variants. | The DSH runtime can validate every emitted result without a catch-all object schema. |
| `packages/notemd-jobs` and `packages/notemd-workspace-events` | Durable planning checkpoints retain proposal identity/evidence only; metadata-only changes derive from verified receipts. | Planning remains non-authoritative and indexing observes only committed mutations. |

## 4. Prior Plan Reconciliation

The previous plans are not discarded. They establish the correct standalone, lifecycle, approval, and packaging foundations. They do not establish behavior-contract parity for the source plugin, and two earlier default decisions are deliberately superseded.

| Earlier requirement | Current evidence | Full-migration disposition |
| --- | --- | --- |
| Standalone DSH bundle with explicit workspace root, Cordis services, profile patch, and clean-profile acceptance. | `notemd-bundle`, the profile patch, and `pnpm accept:dsh` are present and passing. | Delivered and retained. New packages must preserve declared injection, Fiber-owned effects, complete patch configs, and packed-bundle acceptance. |
| Revision-bound, approval-gated text `WritePlan` is the only workspace mutation path. | `notemd-vault` is read-only and `LocalVault` applies only canonical `WorkspaceMutationPlan` values through the journaled executor. | Delivered as one mutation protocol; retaining `WritePlan` beside it would have created two mutable authorities. |
| Durable plan-only jobs, metadata-only workspace events, and rebuildable incremental knowledge indexing. | `notemd-jobs`, `notemd-workspace-events`, and `notemd-knowledge` retain proposal-only checkpoints, committed-receipt causation, scans, and fresh-read index updates. | Delivered without turning workspace events into an event-sourcing log. |
| Generic OpenAI-compatible adapter owns default endpoint/key configuration, diagnostics, and model discovery. | The default patch configures only `provider`, `model`, `maxTokens`, and `promptPolicyId`; `DshTextTransformer` rejects unknown route fields and consumes `ctx.llm.stream()`. | Superseded as the default. The old transport and its diagnostics remain in an opt-in legacy entry only. |
| Source artifacts plus truthful unavailable renderer/export status are sufficient for the portable core. | `SourceArtifactPlanner` persists JSON/README and reports permanent `unavailable`. | Honest but incomplete. Evolve it into versioned source/preview/export lineage and add named capability-gated providers; do not call SVG an equivalent substitute for non-SVG targets. |
| Baseline workflow planners cover portable note semantics. | Links, titles, translation, concepts, formula repair, Mermaid repair, and string-supplied research synthesis exist. | Partial only. Source behavior still lacks chapter splitting, original-text extraction, folder policies, reconciliation, task-scoped retrieval, DSH-native research evidence, and all real render/export providers. |

The architectural correction is intentionally narrow: it preserves working reliability mechanisms and replaces the contracts that would otherwise encode the wrong ownership or an insufficient artifact/mutation model.

## 5. Full-Migration Phase Ledger

The table records code state, not planned completion. A passing baseline release gate proves the existing bundle is installable; it does not prove a capability family has migrated.

| Task | Current state | Gate to leave the state |
| --- | --- | --- |
| 1. Source behavior contract | Complete. The matrix pins all 29 source registry IDs at `4168a51cd19ad8c3d1e05f604b50936255461a31`; each of 18 included rows references one or more of 14 deterministic fixtures. | The source contract cannot silently expand its Drawnix WIP exclusion set or lose local retrieval, diagram, or slide fixture coverage. |
| 2. Typed mutation proposals | Complete. `@notemd-harness/mutation` freezes text/bytes/delete plans with canonical destination ordering, content digests, opaque staged-asset metadata, and closed receipts. | Delivered through Task 4's sole mutation authority. |
| 3. Local journaled executor | Complete. `LocalMutationExecutor` journals content-free metadata, stages plan payloads, locks canonical targets, verifies hashes, rolls back safely, finalizes staging separately, and shares locks with `LocalVault`. | Delivered through receipt-bound approval, jobs, events, and Tools. |
| 4. Approval, events, jobs, and Tool receipts | Complete. `WritePlan` exports and callers are removed; approvals bind proposal/asset digests; checkpoints store proposal identity/evidence; only matching committed receipts publish events; and every Tool has a closed DSH outcome schema. | Task 5 can now replace the default model boundary without a second write authority. |
| 5. DSH LLM consumer bridge | Complete. `@notemd-harness/llm-dsh` injects DSH `llm`, builds provider-neutral completions from `StreamChunk`, rejects closed-policy violations, and disposes active calls with its Cordis owner. | Delivered. The default patch contains no endpoint/key/transport settings and registers no legacy provider tools. |
| 6. DSH web research evidence | Complete. `@notemd-harness/research` persists bounded DSH Web discoveries/evidence; named Tools return evidence metadata and research synthesis accepts durable ids only. `notemdResearch` is injected into Tools and jobs, and the bundle declares `dsh-web` as an optional peer. | Delivered. No provider yields the closed `capability-unavailable` outcome; non-2xx resources remain evidence rather than becoming transport failures. |
| 7. Document semantics and knowledge retrieval | Complete. `@notemd-harness/documents` owns structural sections, chapter manifests, original-text policies, and duplicate diagnostics; workflows and Tools expose named single-file/folder operations; knowledge indexes sections with citations and explanations. | Delivered. The phase passed focused and full integration gates, including packed-bundle and clean-profile acceptance. |
| 8. Artifact lineage and SVG-capable renderers | Complete. `DiagramSpec` v2 carries source revisions, provenance, evidence, structured inputs, and renderer intent. Five bundled named renderers create canonical sources plus sanitized SVG preview/export derivatives; Tool schemas are source-bound and target-specific. | Delivered. The packed bundle contains compiled renderer dependencies only, and clean-profile acceptance executes the Mermaid planning Tool. |
| 9. Draw.io, stable Drawnix, and Circuitikz providers | Complete. `@notemd-harness/process` enforces fixed command profiles and staging containment; three named providers and six planning/status Tools are bundled. Drawnix WIP paths remain excluded, and the optional `notemd-drawnix-render` adapter is reported unavailable when absent. | Delivered with Windows process/provider tests, full suite, packed-bundle verification, and clean DSH profile acceptance. |
| 10. Slidev and media exporters | Complete. Three packages provide canonical source preparation plus named HTML/PDF/PNG/PPTX/MP4 providers over one staging/process boundary. | Task 10 focused and full gates pass; optional real executables report unavailable rather than being emulated. |
| 11. Conformance, HMR, and publication | Complete. The matrix conformance and lifecycle contracts, full release gate, clean DSH profile, and non-force mainline synchronization all pass. | Keep the fork lock, optional capability boundaries, and publication evidence aligned when future changes update the bundle. |
| 12. Executable conformance adapters | Complete. Fourteen typed adapters execute nineteen observations (eighteen included source operations plus auxiliary local retrieval), with operation-specific duplicate contracts and deterministic artifact lineage paths. | Any missing adapter, unmapped included operation, fixture digest drift, or contract mismatch must fail the focused conformance gate before publication. |
| 13. Optional-runtime capability lane | Complete. The opt-in lane records executable fingerprints, native output digests, cancellation, and staging cleanup. This Windows run reports `pdftocairo` SVG/PNG ready and missing Slidev fork, Draw.io, Tectonic, Drawnix, and FFmpeg as truthful unavailable. | Native strictness stays opt-in; portable-core gates must remain green when optional binaries are absent. |
| 14. Artifact schema registry | Complete. `diagram-spec@2`, `diagram-lineage@2`, and `document-export@3` are enforced by the packaged registry with structured diagnostics and a metadata-only extension point. | Keep matrix paths and artifact identity aligned whenever schema fields change. |
| 15. Workspace operation hardening | Complete for the current single-process contract. `WorkspaceOwnershipGuard` rejects live second owners, recovers only dead stale owners, records recovery counters, and reports cleanup health through the vault lifecycle. | A durable lease/job backend is still required before claiming multi-process scheduling semantics. |
| 16. Source intake and Drawnix review | Complete as an audit-only intake. Candidate `cdf580c6...` is locked with a dirty-path inventory; registry IDs and migration fixture hashes are unchanged; Mermaid is a follow-up candidate and Drawnix remains quarantined. | Do not implement candidate behavior until its own deterministic contract/fixtures are accepted; do not consume any dirty Drawnix path. |

## 6. Recorded Direction

- [Authoritative architecture](../specs/2026-08-15-dsh-notemd-full-migration-architecture.md) defines the DSH/Koishi/Cordis-aligned service graph and corrects the earlier default-provider and source-only artifact decisions.
- [Executable implementation plan](../superpowers/plans/2026-08-15-dsh-notemd-full-migration.md) breaks migration into twelve independently testable tasks.
- Task 1's characterization fixtures prevent later implementation from silently dropping chapter manifest cleanup, original-text extraction, task-scoped retrieval, or target-specific exports.

## 7. Next Direction

1. Preserve the fork lock: `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`. Updating it is a compatibility decision, not a dependency refresh.
2. Keep staged assets durable across HMR until approval/materialization completes; disposing a renderer must stop processes and timers without deleting pending approval inputs.
3. Treat the typed conformance manifest, release gate, and clean-profile acceptance as mandatory evidence for future capability changes.

## 8. Guardrails

- No source Drawnix WIP is treated as migration baseline.
- `ctx.llm` and `ctx.web` replace NoteMD-owned provider and web transport configuration.
- Renderer and exporter availability is reported truthfully; SVG is a preview derivative only for SVG-capable targets.
- Workspace changes remain explicit, approval-gated, revision-bound, and recoverable.

## 11. Phase 12 Verification

- Scope: `fixtures/migration/conformance-implementations.json` moved from manifest v1 (`testPath`/`proofTerms`) to v2 (`adapterId`, `sourceOperationIds`, `operationIds`). `packages/notemd-workflows/test/migration-fixture-adapters.ts` now owns fourteen temporary-workspace adapters covering nineteen executable observations.
- Contract corrections are evidence-based: chapter split records the source-sibling `_chapters` manifest/chapters/TOC set; original-text uses the pinned `_Extracted` sibling policy; translation records the current language-folder policy plus source revision; diagram and Slidev outputs use deterministic content-addressed artifact directories; duplicate diagnostic and dedupe use operation-specific schemas.
- The conformance test verifies exact included-operation coverage, auxiliary-operation separation, adapter registry parity, operation-to-fixture declarations, source revision normalization, target paths, citations, and mutation preconditions. No expected value is read from the adapter result or test source text.
- Focused evidence: `rtk proxy pnpm.cmd exec vitest run --config vitest.config.ts packages/notemd-workflows/test/migration-conformance.test.ts` passed 1 file and 2 tests.
- Full evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm test` passed 48 files and 185 tests; `pnpm test:coverage` passed with 77.63% statements, 72.35% branches, and 85.33% functions; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, `pnpm accept:dsh`, and `git diff --check` passed.
- Capability boundary: these adapters prove deterministic planner and renderer contracts, not live DSH provider quality or installed Playwright/FFmpeg/Draw.io/Tectonic/Drawnix interoperability; those remain Phase 13 optional-runtime evidence.
- Rejected alternatives: source text proof-term matching, deriving expected values from observed output, a shared duplicate fixture contract that hides read-only versus delete semantics, and simplified artifact paths that discard lineage identity.

## 9. Verification and Publication

The first verification segment ran against the documentation change on Node `v22.19.0`:

- Relative-link validation across both READMEs and all six new documents found no missing target.
- `git diff --check` completed without whitespace errors.

### Phase 15/16 release gate

- Node `v22.19.0` / pnpm `10.7.1` passed the strict sequence `test`, `test:coverage`, `build`, `pack:bundle`, `verify:bundle`, and `accept:dsh`; the final `git diff --check` also passed.
- Vitest reported 52 files and 203 tests passing. Coverage is 77.68% statements, 73.00% branches, and 85.21% functions.
- The packed tarball was verified and installed into a clean DeepSeek Harness profile; clean-profile acceptance passed with the source-intake lock and workspace ownership changes present.
- Publication: `f8de6de` (`feat: harden workspace ownership and lock source intake`) was pushed non-force to `git@github.com:Jacobinwwey/dsh-NotEMD.git`; final fetch confirmed `origin/main...main = 0 0` and `git status --short --branch` reported only `## main`.

## 12. Phase 13 Verification

- Scope and owner: `packages/notemd-process/src/allowlisted-process.ts` owns the fixed executable profiles and byte fingerprints; `packages/notemd-process/src/capability-lane.ts` and `scripts/optional-runtime-capability-lane.ts` own the opt-in observation/report protocol. No optional binary was added to core dependencies.
- Target locks: the source oracle remains `obsidian-NoteMD_new@4168a51cd19ad8c3d1e05f604b50936255461a31`; the Slidev lock remains `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c` and must be proven by `NOTEMD_SLIDEV_FORK_MANIFEST` before Slidev status can be ready.
- Focused evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm typecheck`, `pnpm lint`, `vitest` for `allowlisted-process.test.ts` and `capability-lane.test.ts` passed 2 files/15 tests; `git diff --check` passed.
- Real lane report: fixture SHA-256 `0ddba517ff3630d3c1e84b54bb952a6d91a82d7550489e3805994e57a52d53d4`; staging cleanup `true`; `pdf-to-svg` ready with native digest `2f74b912f9ad7bc30512d1de59457e665400ca590acfa03a886aee50ac3c87cb`; `pdf-to-png` ready with native digest `f2279ebd674c8dadc5f57e35ebeb0c7573ff953359b5703a42a33b292c9e4c70`.
- Capability limits: Draw.io, Drawnix adapter, Tectonic, Slidev fork, and Playwright/FFmpeg paths were absent or unverified and returned `unavailable`; cancellation returned `process-cancelled`. No unavailable result was coerced into a preview or export success.
- Rejected alternatives and risks: installing global runtimes, hashing only executable paths, using upstream Slidev, and making strict native availability mandatory were rejected. Executable bytes are hashed when present; fake runtimes are path-fingerprinted only for deterministic tests; strict native gating remains an explicit environment opt-in.

## 13. Phase 14 Verification

- Scope and owner: `packages/notemd-artifacts/src/schema-registry.ts` is the only family/version registry. `diagram-spec.ts`, `artifact-manifest.ts`, and `document-export.ts` own payload validation and generated discriminator fields; bundle verification checks the packaged registry rather than a source-only copy.
- Closed combinations: `diagram-spec@2`, `diagram-lineage@2`, and `document-export@3`. `inspectArtifactSchema` returns stable `invalid-record`, `missing-family`, `unknown-family`, `missing-version`, `unknown-version`, `invalid-combination`, and `invalid-metadata` diagnostics; `assertArtifactSchema` adds expected family/version mismatch diagnostics.
- Forward compatibility: nested JSON-safe `metadata` is accepted and frozen; unknown payload fields remain the responsibility of the family validator and are rejected by existing `assertKnownKeys` checks. No unbounded top-level extension point was introduced.
- Focused evidence: `schema-registry.test.ts` passed 8 tests; the artifact/renderer/tool focused gate passed 17 files/38 tests; `pnpm typecheck` and `pnpm lint` passed. Full conformance passed 1 file/2 tests after the canonical diagram artifact id changed from `notemd-artifact-9a9e469f716c93be0bbe` to `notemd-artifact-ff9a6d55ec0208286fed`.
- Packed verification contract: `scripts/verify-bundle.ts` dynamically loads `@notemd-harness/artifacts/lib/index.js` from the extracted tarball, accepts all three valid fixtures, and requires a structured `invalid-combination` diagnostic for `diagram-spec@3`.
- Rejected alternatives and risks: one global version number, silent legacy-family inference, arbitrary metadata at the top level, and string-only migration errors were rejected. Existing version-1 cleanup data now fails closed with an attached diagnostic instead of being treated as a current diagram lineage manifest.

## 14. Phase 15 Verification

- Scope and owner: `packages/notemd-vault-local/src/workspace-ownership.ts` owns the file-backed process guard; `packages/notemd-bundle/src/vault-local.ts` acquires it before opening the local vault and registers async Cordis cleanup. No scheduler or database was added.
- Lock contract: `.notemd/runtime/workspace-owner.json` is created with exclusive open and contains only version, PID, process-start token, canonical workspace root, owner revision, timestamps, recovery count, and optional recovered revision. Heartbeats update the same owner revision; release removes the lock only when ownership still matches.
- Concurrency/recovery evidence: `workspace-ownership.test.ts` passed 5 tests covering acquisition/release, live second-owner rejection (`workspace-process-already-owned`), dead stale-owner recovery, malformed metadata fail-closed, and unhealthy cleanup after external lock removal. Existing local-vault/mutation tests passed 26/26.
- Lifecycle evidence: `NotemdVaultLocalService` releases the guard from `ctx.effect()` and releases it on `LocalVault.open()` failure. Bundle runtime-boundary coverage asserts the ownership effect is present; typecheck and lint passed.
- Rejected alternatives and risks: SQLite, distributed lease, unconditional stale lock deletion, and treating a live PID with a stale heartbeat as reclaimable were rejected. A lock with a live/unknown owner or malformed metadata is blocked; only a dead PID plus expired heartbeat is recoverable. Multi-process model-planning serialization is not claimed.
- `pnpm typecheck` and `pnpm lint` completed successfully.
- `pnpm test` completed successfully: 16 test files and 50 tests passed.

The second verification segment completed successfully:

- `pnpm test:coverage` passed with the same 16 files and 50 tests. The current repository baseline is 66.6% statement coverage; the low bundle-service coverage is an explicit implementation-phase risk, not a documentation defect.
- `pnpm build` completed successfully for all workspace packages.
- `pnpm pack:bundle` created the standalone tarball, and `pnpm verify:bundle` verified it.
- `pnpm accept:dsh` installed the packed tarball into an isolated DeepSeek Harness profile and passed clean-profile acceptance.

### Publication Segment

- Before publication, local `HEAD`, `FETCH_HEAD`, and `origin/main` all resolved to `6672f54def2b05e1628786ace97ab73649edab74`; the divergence count against the fetched remote was `0 0`.
- `626f6e1ac46ac5cb733e1d6c177b47cc987e0f77` (`docs: define full NotEMD migration roadmap`) was created on `main` after the release gate and a clean staged-diff check.
- The commit was pushed non-force to `git@github.com:Jacobinwwey/dsh-NotEMD.git` as `6672f54..626f6e1`; immediately before this publication-log update, `git status --short --branch` reported only `## main`.

This publication records architecture, planning, audit, and baseline verification only. It intentionally does not advance a capability task; that requires the task's source fixtures and exit evidence.

### Task 1 Verification

- Source baseline: `4168a51cd19ad8c3d1e05f604b50936255461a31`, represented by 29 registry IDs in the machine-readable matrix.
- Classification: 18 `included` operations, 11 `excluded-by-design` operations, and exactly four `excluded-wip` Drawnix paths. The 14 fixture inputs are SHA-256 pinned, including the explicit local-retrieval, diagram-source, and slide-source cases.
- `pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-contracts.test.ts packages/notemd-artifacts/test/source-artifact-contracts.test.ts`: 2 files and 4 tests passed.
- `pnpm test`: 18 files and 54 tests passed. `pnpm typecheck` completed successfully. `git diff --check` completed without whitespace errors before staging.

### Task 2 Verification

- `@notemd-harness/mutation` contains the new proposal vocabulary: versioned content-addressed plans, `write-text`, `write-bytes`, and `delete` variants, opaque staged asset references, and metadata-only receipts.
- The contract test observed its initial missing-export red state, empty-text-content and malformed-JSON-boundary red states, and a closed-receipt-vocabulary red state with validation removed, then passed with validation restored: `pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts` reported 1 file and 11 tests passing.
- `pnpm --filter @notemd-harness/mutation test`, `pnpm typecheck`, and `pnpm lint` completed successfully. After the boundary-input correction, `pnpm test` reported 19 files and 65 tests passing; `git diff --check` found no whitespace errors before staging.

### Task 3 Verification

- `@notemd-harness/vault-local` now supplies a journaled executor with immutable proposal input, staged binary asset verification, canonical multi-target locking, same-volume replacement, quarantine deletes, digest-checked recovery, retry rejection, and metadata-only receipts. Journal records never contain prompts, text payloads, or binary bytes.
- The focused executor suite covers 19 tests: all persisted crash states, stale and concurrent plans, symlink escape, staged-asset substitution, rollback integrity, external changes, cancellation, idempotence, idle construction, and committed-state finalization cleanup. `LocalVault` adds a shared-lock mutation bridge test.
- `pnpm install --lockfile-only` updated the workspace link, then `pnpm install --frozen-lockfile` completed. `pnpm --filter @notemd-harness/vault-local test` and `pnpm test` both reported 20 test files and 85 tests passing; `pnpm typecheck`, `pnpm lint`, and `git diff --check` also passed on Node `v22.19.0` / pnpm `10.7.1`.

### Task 4 Verification

- The legacy `WritePlan` public contract and tool bridge are removed. `notemd_request_plan_approval` parses and canonicalizes a mutation proposal, issues an asset-bound one-time receipt only after DSH approval, and `notemd_apply_approved_plan` consumes that receipt before invoking the journaled executor.
- Receipt outcomes are truthful: only a matching `committed` receipt can publish a `notemd-mutation-receipt` event. Conflict, rejected, cancelled, failed, recovered, mismatched, and event-recording failure paths return explicit closed outcomes without publishing an indexable change.
- The schema adapter now emits the DSH author DSL rather than precompiled JSON Schema; nested required fields use `required: true`. The contract suite exercises approval decisions, invalid consumption, stale plans, staged-asset substitution, rejected deletes, and closed-schema registration.
- All legacy behavior tests, the runtime approval test, the durable-job checkpoint test, and the clean-profile runner now assert `mutations`, proposal checkpoint identity, and receipt states rather than `writes` or per-file legacy statuses.
- An offline `pnpm install --offline` repaired the workspace link after the new mutation dependency was declared. The bundle verifier now requires `@notemd-harness/mutation`; its package manifest limits distribution to compiled JS/declarations, and build caches/source maps are excluded from the tarball.
- Fresh evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm typecheck`, `pnpm test` (21 files, 97 tests), `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all completed successfully.

### Task 5 Verification

- `@notemd-harness/llm-dsh` converts DSH `StreamChunk` values into NoteMD text completions. It validates the closed route policy, preserves only neutral failure classes, rejects malformed or post-terminal streams, propagates cancellation, and aborts active calls when its Cordis owner disposes.
- The default `notemd-llm` service has static `llm` injection and configures only `provider`, `model`, `maxTokens`, and `promptPolicyId`. Endpoint, API-key, header, retry, and discovery fields cannot enter the default route policy. The OpenAI-compatible service is exposed only from `./llm-openai-compatible-legacy`; default tool registration omits its diagnostics.
- Fresh evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm typecheck`, `pnpm test` (22 files, 109 tests), `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all completed successfully. The acceptance runner installs the packed bundle into a clean DSH profile, loads `LlmRuntime`, and asserts the default bridge has no legacy provider Tool.

### Task 6 Verification

- `DshResearchClient` calls only DSH's provider-selecting `ctx.web.search()` and `ctx.web.fetch()` seams. The durable catalog writes discovery/evidence JSON under `.notemd/research`; it retains final URLs, non-2xx status, body kind, bounded content digest, truncation, retrieval time, and citations. Research Tool responses intentionally omit fetched body text; synthesis resolves evidence ids internally and frames bodies as untrusted records.
- The Tool/job boundary no longer accepts `sources`. `notemd_research_discover`, `notemd_research_capture_evidence`, and `notemd_plan_research_synthesis` are distinct operations; research batch jobs persist only `evidenceIds`. The job runner resolves those ids immediately before it calls the workflow planner, so its checkpoint retains only proposal identity and evidence references.
- Focused evidence: `packages/notemd-research/test/dsh-research-client.test.ts` passed 4 tests; `packages/notemd-workflows/test/workflow-planning.test.ts` passed 6; `packages/notemd-tools/test/tools.contract.test.ts` passed 14; and `packages/notemd-bundle/test/patch.contract.test.ts` passed 4. The Tool contract includes a regression for the exact-one-branch DSH schema invariant.
- Fresh Node `v22.19.0` / pnpm `10.7.1` release evidence: `pnpm typecheck`, `pnpm test` (23 files, 118 tests), `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all completed successfully. Clean-profile acceptance installs `WebRuntime` with no provider and asserts `notemd_research_discover` returns `{ status: 'unavailable', code: 'capability-unavailable' }`.

### Task 7 Verification

- `@notemd-harness/documents` parses headings outside fences into immutable section records with source digests, stable duplicate-safe anchors, breadcrumbs, Markdown projections, and search projections. Chapter planning records generated artifact hashes in a manifest and rejects both manually changed managed files and unmanaged collisions before proposing writes/deletes.
- `NotemdWorkflowPlanner` exposes separate individual and merged original-text operations, deterministic folder batches, chapter split, duplicate diagnostics, reviewed concept-delete proposals, and extract-and-generate. Original-text output paths are policy objects, not a merged-mode switch; folder/job snapshots are lexical and deterministic.
- `VaultKnowledgeIndex` is derived and rebuildable. It indexes sections, supports task roots, top-k, current-file exclusion, adjacent section windows, hit explanations, and citations such as `citation:notes/knowledge.md#canonical-lock-ordering`. The named DSH Tool returns the same closed, citation-bearing result contract.
- Fresh evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm test` passed 26 files and 132 tests; `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all passed. The packed tarball includes `@notemd-harness/documents`, and clean-profile acceptance succeeded.

### Task 8 Verification

- The renderer Tool contract was first observed red: the pre-Task-8 registry contained only `notemd_artifact_render_status`, `notemd_artifact_export_status`, `notemd_plan_source_artifact`, and cleanup. The focused named-Tool test then passed after replacing that generic surface with five target-specific planning/status pairs and v2 source-bound specifications.
- Focused artifact evidence: `diagram-spec`, `svg-sanitizer`, lineage/manifest, five renderer, and Tool suites passed: 10 files and 16 tests. SVG sanitizer coverage proves removal of scripts, foreign content, event attributes, remote URLs, JavaScript links, and unsafe data URLs while preserving local fragment and image references.
- Bundle verifier was intentionally observed red when initial renderer packages included source, tests, maps, and build metadata. Each renderer package now ships only compiled `.js` and `.d.ts`; `pnpm pack:bundle` and `pnpm verify:bundle` passed with all five renderer dependencies present.
- Fresh full evidence: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test` (35 files, 144 tests), `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all passed. Clean-profile acceptance invokes `notemd_mermaid_render_status` and `notemd_plan_mermaid_artifact`, confirming the installed bundle creates a canonical `.mmd` source and sanitized SVG preview proposal without claiming a document-export provider.

### Task 9 Verification

- `@notemd-harness/process` exposes only fixed Draw.io SVG, stable Drawnix adapter SVG, Tectonic PDF, PDF-to-SVG, and PDF-to-PNG profiles. The boundary validates resolved executable identity, exact argv, staging containment, bounded input/output, environment allowlisting, timeout versus caller cancellation, process-tree `waitForExit()`, and owner disposal. Its focused Windows suite passed 1 file and 7 tests, including missing executable, nonzero exit, malformed output, byte cap, staging escape, timeout/cancellation, and cleanup.
- `@notemd-harness/render-drawio`, `@notemd-harness/render-drawnix`, and `@notemd-harness/render-circuitikz` passed 3 provider files and 8 tests. Draw.io XML and Drawnix semantic JSON are deterministic and escaped; each preview states projection semantics; native failures remain unavailable/failed; cancellation is not converted into success. Circuitikz stages only a PDF whose recomputed digest matches the process result.
- Artifact/tool integration passed: specialist lineage tests passed 3 tests; named Tool contract passed 16 tests and now includes `notemd_plan_drawio_artifact`, `notemd_drawio_render_status`, `notemd_plan_drawnix_artifact`, `notemd_drawnix_render_status`, `notemd_plan_circuitikz_artifact`, and `notemd_circuitikz_render_status`. The bundle injects DSH `subprocess`, composes the SVG and specialist planners, and awaits process quiescence through an async Cordis effect.
- Fresh release evidence on Node `v22.19.0` / pnpm `10.7.1`: root typecheck and lint passed; `pnpm build`, `pnpm verify:bundle`, and clean DSH acceptance passed. The full Vitest suite now reports 40 files and 162 tests passing. Clean-profile acceptance installed the packed bundle with the local DSH subprocess runtime, exercised all three capability Tools, and created a Draw.io canonical/projection plan while preserving truthful optional-binary status.

### Task 10 Verification

- Source preparation is deterministic and source-bound: ordinary Markdown becomes a stable Slidev deck with section/closing slides and a layout report; existing Slidev decks retain their content while `fonts.provider` is normalized to `none` for offline operation. The fork lock fixture records origin `github:Jacobinwwey/slidev`, revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`, release asset, and required build options.
- `AllowlistedProcessBoundary` owns HTML, PDF, PNG, PPTX, and MP4 profiles. HTML validates both `index-standalone.html` (fork output) and `index.html`; MP4 uses numerically ordered PNG frames, FFmpeg `libx264`/`yuv420p`/`+faststart`, even-dimension padding, and staged output. Native targets never receive an SVG substitute.
- Named providers emit `slides.md`, `layout-report.json`, and target-specific exports through `DocumentExportPlanner`; manifests are version 3, source/revision bound, and include renderer/theme/font fingerprints plus staged-byte digests. The generic document-export Tool was removed in favor of six closed named planning/status pairs.
- Fresh Task 10 evidence before Task 11 additions: `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` passed; Vitest reported 46 files and 179 tests. The first acceptance run intentionally failed on unsupported DSH `minimum` schema keywords; moving range checks to the Tool edge runtime validator restored clean-profile acceptance without weakening input validation.

### Task 11 Verification

- `packages/notemd-workflows/test/migration-conformance.test.ts` consumes the pinned source matrix and the conformance manifest. It requires all included operation fixture ids plus the independent local-retrieval/diagram/slide fixtures to have an existing test proof with a runnable `test(...)` contract. The added `extract-and-generate` test exercises both LLM planning steps and asserts the two absent-precondition outputs.
- `packages/notemd-bundle/test/runtime-boundary.test.ts` proves the five DSH runtimes remain optional removable peers, the patch restates complete replacement-row configuration, and Cordis effects own LLM, process, and scanner disposal. The process suite now proves disposal aborts active trees, waits for completion, removes run directories, and rejects new work after disposal; existing DSH LLM route rejection and Web ambiguity tests remain green.
- Fresh final-gate evidence on Node `v22.19.0` / pnpm `10.7.1`: `pnpm typecheck`, `pnpm lint`, `pnpm test` (48 files, 184 tests), `pnpm test:coverage` (77.03% statements, 71.87% branches, 84.54% functions), `pnpm build`, `pnpm pack:bundle`, `pnpm verify:bundle`, and `pnpm accept:dsh` all passed. `git diff --check` also passed; the packed tarball installed into an isolated DSH profile and clean acceptance completed successfully.

### Final Task 11 Publication

- Release commit `73480df` (`test: prove full NoteMD migration conformance`) contains the conformance tests, runtime-boundary checks, bilingual architecture/plan/progress updates, and validation walkthroughs.
- The commit was pushed non-force to `git@github.com:Jacobinwwey/dsh-NotEMD.git` after the fresh release gate. The fetch-before-push divergence was `0 11` (no remote-ahead commits); post-push `origin/main` resolved to `73480df`.

## 10. Current-State Audit (2026-08-17, historical snapshot)

The earlier publication-record commit was `488378fb6a1429683bf1789f418abca8992bd3a2`; the paired [current-state architecture audit](../specs/2026-08-17-dsh-notemd-current-state-architecture-audit.md) remains the architectural record, while the Phase 15/16 completion evidence is recorded below.

### Evidence lock

- The parity oracle remains `obsidian-NoteMD_new` at `4168a51cd19ad8c3d1e05f604b50936255461a31`. The source checkout has since advanced to `5efd4285f2d1861e725f520cfa8a02d1bf898eb7` and is dirty, with diagram-gallery, cache, render-target, and Drawnix-related changes; those changes are not part of this release.
- The target has 26 workspace packages, with `notemd-bundle` as the Cordis composition root and `notemd-vault-local` as the only workspace mutation authority. DSH LLM/Web/tool services remain optional peer-owned seams.
- The historical Phase 12 release-gate evidence was Node `v22.19.0`, pnpm `10.7.1`, 48 Vitest files and 185 tests; the current Phase 15/16 gate supersedes it with 52 files and 203 tests (77.68% statements, 73.00% branches, 85.21% functions).

### Reconciliation and limits

- The migration is complete for the pinned non-Obsidian-host behavior contract and the Phase 15/16 audit boundary. It does not claim that Playwright, the pinned `github:Jacobinwwey/slidev` fork, FFmpeg, Draw.io, Tectonic, or the optional Drawnix adapter are installed and interoperable on every deployment.
- Conformance is now an executable typed-adapter gate: shared semantic fixtures still avoid one monolithic invocation per source operation, but every included operation is explicitly mapped and executed, with auxiliary local retrieval kept separate. This is a verification-quality boundary, not an omitted source operation.
- Artifact versions are intentionally split: DiagramSpec/diagram lineage `v2`; document export manifest `v3`. The next phase must make that family boundary explicit rather than flattening versions.
- File-backed jobs are safe for one workspace process. Per-target locks do not provide distributed scheduling or prevent duplicate planning across two DSH processes.

### Post-release continuation (historical decisions, now implemented)

1. Phase 12 is complete: typed executable fixture adapters and explicit operation-to-fixture mappings replaced free-form conformance proof terms.
2. Phase 13 is complete: the optional-runtime lane records pinned executable fingerprints, native artifacts, digest checks, cancellation, and staging cleanup.
3. Phase 14 is complete: the packaged registry enforces DiagramSpec/lineage `v2` and export manifest `v3`.
4. Phase 15 is complete for the single-process contract; a durable lease remains conditional on a real multi-process deployment requirement.
5. Phase 16 is complete as audit-only source intake; Mermaid normalization is the next candidate and Drawnix remains quarantined.
6. Future work must first add a deterministic contract and fixture set for any candidate behavior before implementation.

No completed Task 1-12 is reopened by this audit; the next phase starts from the current release commit and the pinned source lock.
- A final fetch confirmed `origin/main...main = 0 0`; the worktree reported only `## main` with no paths. The Slidev lock remains `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`.

## 15. Phase 16 Source Intake Verification

- Source lock: `fixtures/migration/source-intake-lock.json` records candidate `obsidian-NoteMD_new@cdf580c6c876190ecc1040caea08e5ba5bee004f`, parent `426d0e8d...`, and the five dirty checkout paths. The candidate commit itself is reproducible; the checkout is not treated as a parity oracle.
- Registry comparison: both baseline and candidate expose 29 operation IDs with no additions or removals. The only schema delta removes `diagram.generate.input.properties.drawnixKnowledgeMapDelivery`, which is already outside the non-host matrix.
- Fixture comparison: the target matrix retains 14 fixture IDs and no input hash changes. The candidate-only `src/tests/fixtures/drawnixArchitectureDocumentTreeFixture.ts` is explicitly quarantined.
- Category decisions: diagram-gallery is deferred as source-side presentation/fixture governance; response-cache is rejected because DSH owns provider endpoint/model policy; render-target descriptors are deferred behind named bundle adapters; Mermaid family detection/fence/ER normalization is accepted only as a follow-up candidate with no current implementation claim.
- Drawnix quarantine names the baseline exclusions, committed candidate paths, and all five dirty paths. No Drawnix implementation or fixture was copied into the bundle.
- Focused evidence: `migration-source-intake.test.ts` and `migration-conformance.test.ts` passed; typecheck, lint, the full 52-file/203-test suite, coverage, build, packed-bundle verification, clean DSH acceptance, and `git diff --check` all passed in the release gate above.

## 16. Phase 17 Remote-main parity review (2026-08-18)

- Comparison locks: DSH `main/origin/main` at `92479bc`; source oracle is `obsidian-NoteMD_new@6097ff1` on `origin/main`, compared with the behavior-contract baseline `4168a51cd19ad8c3d1e05f604b50936255461a31`.
- The source remote-main delta is 194 committed files with 9,434 insertions and 6,770 deletions across 17 commits. The source checkout currently has 17 uncommitted paths; all are excluded from parity and remain untouched.
- Result: the pinned non-host contract remains high quality (18/18 included operations, 14 fixtures, typed adapters, journaled mutation, and DSH-owned LLM/Web), but current remote-main parity is partial. The unrepresented committed delta includes the three-axis diagram catalog and new semantic payloads, deterministic Mermaid normalization, Drawnix/Circuitikz convergence, and gallery/consumer gates.
- Intentional exclusions remain valid: Obsidian host UI/lifecycle/provider profiles and provider response-cache policy are not migration defects. SVG derivatives are not native Drawnix/Circuitikz or PPTX/MP4 parity.
- Disposition: no implementation was accepted from this audit. Phase 17 follow-up must pin `6097ff1` in a new intake lock, update fixture/adapter contracts, and pass focused plus full bundle gates before any new full-parity claim.

## 18. Phase 18 npm package identity and publication gate (2026-08-21)

- Canonical display/repository name is now `dsh-NotEMD`; the npm package identity and install spec are the unscoped public package `dsh-notemd`. The former scoped package identifier is no longer referenced by runtime imports, Cordis patch rows, profile manifests, acceptance scripts, or documentation.
- `packages/notemd-bundle/package.json` now declares public registry metadata, repository links, keywords, and `publishConfig.access = public`. The bundle still embeds all unpublished `@notemd-harness/*` packages and keeps the tarball as the reproducible offline path.
- The verified release artifact is `artifacts/dsh-notemd-0.1.0.tgz`. It passed `pnpm pack:bundle`, `pnpm verify:bundle`, clean DSH profile acceptance, typecheck, lint, coverage, build, capability lane, and the 52-file/203-test suite.
- The package was deleted before this migration, so the unscoped name is available for first publication. npm dry-run must pass before the real publish; no credential or OTP is stored in the repository or requested through chat. Publish with `npm publish .\\artifacts\\dsh-notemd-0.1.0.tgz --access public --registry=https://registry.npmjs.org/` after completing npm 2FA.
## 19. Phase 19 Composite workflow architecture and implementation plan (2026-08-21)

**Phase status:** Architecture and implementation plan recorded. Runtime implementation not started in this phase.

**Evidence lock:** Target dsh-NotEMD main 3169964, npm dsh-notemd@0.1.1; current source observation ref/obsidian-NotEMD main 07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5; historical oracle obsidian-NoteMD_new 4168a51cd19ad8c3d1e05f604b50936255461a31. No Drawnix WIP was copied or accepted.

### Deep comparison

| Requirement | Current evidence | Diagnosis |
| --- | --- | --- |
| Default One-Click Extract chains add-links, title generation, and Mermaid repair with folder context | Source workflowButtons.ts and NotemdSidebarView.ts:927-1160 | No named DSH composite definition, explicit path request, or aggregate plan exists. |
| Title batch materializes generated files in a complete folder | Source fileUtils.ts:1262 and main.ts:2688 | planTitlesInFolder is in-place replacement; reusing it would encode the wrong semantics. |
| Mermaid batch validates, repairs, reports, and can move unresolved files | Source fileUtils.ts:1521 | planMermaidRepairsInFolder only replaces fenced Markdown. |
| Later steps see earlier planned output | Current planners read the physical vault | A virtual overlay and virtual-revision validation are required. |
| One approval covers the workflow | Existing approval/executor is plan-scoped | Composite must finalize one WorkspaceMutationPlan and one receipt. |
| Diagram Markdown to intent inference | Source registry/types support it; migration-fixture-adapters.ts uses synthetic mermaidSpec(source) | This remains a separate parity gap and is not silently claimed here. |

The current planExtractAndGenerate is also insufficient: it generates only the first concept and uses hardcoded concepts/ and generated/ destinations.

### Architecture recorded

- Pure package: packages/notemd-composites.
- Named definition: one-click-extract@1, exactly add-links -> generate-complete -> repair-mermaid, fixed fail-fast.
- Explicit request paths: sourcePath, conceptFolderPath, completedFolderPath, mermaidFolderPath, optional mermaidErrorFolderPath.
- CompositeWorkspaceView reads and lists a virtual overlay, validates virtual revisions, enforces file/byte budgets, and finalizes one net mutation per destination.
- Optional typed mutation lineage records workflow id/version, definition digest, step id, and ordinal without changing legacy plan digests.
- NotemdCompositeWorkflowService uses Cordis static injection of notemdVault and notemdWorkflows. Existing approval ledger, FileJobStore, DurableWorkflowRunner, and journaled executor remain the only authorities.
- Named Tool surfaces are not implemented in this phase: notemd_plan_one_click_extract and notemd_job_start_one_click_extract are planned, not shipped.

### Rejected alternatives

Raw custom-workflow DSL and generic dispatch are rejected because they create an unbounded Tool surface. Public continueOnError is rejected because it changes transaction semantics through one parameter; best-effort needs a separate definition and receipt contract. Immediate per-step apply and temporary overlay files are rejected because they create partial or unapproved workspace state. SVG remains a target-specific derivative, not universal export parity.

### Plan and exit evidence

The paired eight-task plan is at docs/superpowers/plans/2026-08-21-dsh-notemd-composite-workflow.md. It covers source fixtures, mutation lineage, overlay aggregation, source-faithful atomic planners, Cordis integration, named Tools/jobs, aggregate approval acceptance, and release evidence.

No runtime code changed in Phase 19. The first implementation phase exits only after deterministic source and overlay tests, definition digest and collision tests, one aggregate approval receipt, stale-revision/cancellation tests, clean DSH acceptance, and the full typecheck/lint/test/coverage/build/pack/verify gate.

### Next direction

Implement source-faithful atomic batch planners and overlay tests before exposing any Tool or durable job. Keep current source remote-main diagram/normalization drift and all Drawnix WIP in audit-only lanes.
