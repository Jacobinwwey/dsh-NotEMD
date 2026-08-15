# DSH NoteMD Full Migration Progress

> Chinese version: [2026-08-15-dsh-notemd-migration-progress.zh-CN.md](2026-08-15-dsh-notemd-migration-progress.zh-CN.md)

**Status:** The standalone-bundle and next-level-runtime foundations are implemented. The full-migration architecture and executable plan were published on `main` at `626f6e1`; Task 1, the source behavior contract, is complete and Tasks 2-11 remain pending implementation.

## 1. Scope Baseline

- Source baseline: `E:\convert\undo\obsidian-NoteMD_new` at `4168a51cd19ad8c3d1e05f604b50936255461a31`.
- Target baseline: `E:\convert\undo\notemd-deepseek-harness` at `6672f54def2b05e1628786ace97ab73649edab74` on `main`.
- In scope: every non-Obsidian-host NoteMD workflow, including documents, knowledge, research, diagrams, artifact export, batch execution, and stable Drawnix behavior.
- Deliberately out of scope: Obsidian UI and host APIs, direct provider configuration, and the source working tree's uncommitted Drawnix WIP.

## 2. Verified Foundations

- The target has an approval-gated, revision-aware text `WritePlan` path, durable plan-only jobs, workspace change reconciliation, and incremental MiniSearch indexing.
- The current runtime already uses Cordis `Service` classes, declared `inject` dependencies, and `ctx.effect()` for the polling scanner and knowledge subscription cleanup.
- The target worktree was clean before this documentation update.
- Task 1 freezes the source boundary in `fixtures/migration/source-operation-matrix.json`: 29 operation IDs, 18 included rows, 11 design exclusions, four exact Drawnix-WIP exclusions, and 14 SHA-256-pinned deterministic fixtures.

## 3. Completed Code Audit

The source registry exposes 29 operations. Its host/provider/profile surfaces are excluded by the approved boundary; the remaining document, knowledge, diagram, and export behaviors are in scope. The source worktree is intentionally dirty in the Drawnix area. The migration baseline excludes the uncommitted cross-root router, mind-map projection, relation-lane layout, their touched support paths, and untracked fixtures.

| Current target area | Confirmed state | Architecture impact |
| --- | --- | --- |
| `packages/notemd-vault/src/revision.ts` | `WritePlan` contains only text writes. | It cannot represent binary source visuals, renderer outputs, or managed deletes. |
| `packages/notemd-vault-local/src/local-vault.ts` | Uses per-path locks and atomic replacement, but applies writes through `Promise.all()`. | Strong single-file behavior must become journaled, canonical-order multi-target mutation execution. |
| `packages/notemd-bundle/src/runtime-adapter.ts` and `cordis.patch.yml` | Direct OpenAI-compatible endpoint/API-key config is the default. | Default ownership must move to the DSH `ctx.llm` seam; legacy transport becomes opt-in. |
| `packages/notemd-workflows/src/index.ts` | Research synthesis accepts supplied passages. | Native research is absent until a `ctx.web` evidence consumer exists. |
| `packages/notemd-knowledge/src/knowledge-index.ts` | Whole-file MiniSearch indexing. | It lacks source task paths, section windows, current-file exclusion, and retrieval explanation. |
| `packages/notemd-artifacts/src/artifact-manifest.ts` | Only source JSON/README artifacts, `renderer: source`, and permanent unavailable render/export reports. | Artifact lineage and named renderer/export providers are the central missing migration axis. |
| `packages/notemd-tools/src/tool-contract.ts` | One permissive `objectOutput` schema covers every Tool. | Closed canonical DSH Tool results are required before capability expansion. |
| `packages/notemd-jobs` and `packages/notemd-workspace-events` | Durable planning/checkpoints and metadata-only change reconciliation work. | Retain them, then migrate checkpoints and events from `WritePlan` to mutation receipts. |

## 4. Prior Plan Reconciliation

The previous plans are not discarded. They establish the correct standalone, lifecycle, approval, and packaging foundations. They do not establish behavior-contract parity for the source plugin, and two earlier default decisions are deliberately superseded.

| Earlier requirement | Current evidence | Full-migration disposition |
| --- | --- | --- |
| Standalone DSH bundle with explicit workspace root, Cordis services, profile patch, and clean-profile acceptance. | `notemd-bundle`, the profile patch, and `pnpm accept:dsh` are present and passing. | Delivered and retained. New packages must preserve declared injection, Fiber-owned effects, complete patch configs, and packed-bundle acceptance. |
| Revision-bound, approval-gated text `WritePlan` is the only workspace mutation path. | `notemd-vault` and `LocalVault` enforce text revisions, atomic sibling replacement, and approval consumption. | Retain the authority boundary, but replace the text-only public contract with one mutation protocol. Keeping `WritePlan` beside `WorkspaceMutationPlan` would create two mutable authorities. |
| Durable plan-only jobs, metadata-only workspace events, and rebuildable incremental knowledge indexing. | `notemd-jobs`, `notemd-workspace-events`, and `notemd-knowledge` implement checkpoints, explicit recovery, scans, and fresh-read index updates. | Retain the services. Migrate their checkpoint and causation payloads from write plans to mutation proposals and receipts. Do not turn events into an event-sourcing log. |
| Generic OpenAI-compatible adapter owns default endpoint/key configuration, diagnostics, and model discovery. | `ConfiguredTextTransformer` and the default `cordis.patch.yml` own `endpoint`, `apiKeyEnv`, and `model`. | Superseded as the default. Move it to an opt-in legacy entry; the normal path consumes DSH `ctx.llm.stream()` and never reads transport credentials. |
| Source artifacts plus truthful unavailable renderer/export status are sufficient for the portable core. | `SourceArtifactPlanner` persists JSON/README and reports permanent `unavailable`. | Honest but incomplete. Evolve it into versioned source/preview/export lineage and add named capability-gated providers; do not call SVG an equivalent substitute for non-SVG targets. |
| Baseline workflow planners cover portable note semantics. | Links, titles, translation, concepts, formula repair, Mermaid repair, and string-supplied research synthesis exist. | Partial only. Source behavior still lacks chapter splitting, original-text extraction, folder policies, reconciliation, task-scoped retrieval, DSH-native research evidence, and all real render/export providers. |

The architectural correction is intentionally narrow: it preserves working reliability mechanisms and replaces the contracts that would otherwise encode the wrong ownership or an insufficient artifact/mutation model.

## 5. Full-Migration Phase Ledger

The table records code state, not planned completion. A passing baseline release gate proves the existing bundle is installable; it does not prove a capability family has migrated.

| Task | State at `6672f54` | Gate to leave the state |
| --- | --- | --- |
| 1. Source behavior contract | Complete. The matrix pins all 29 source registry IDs at `4168a51cd19ad8c3d1e05f604b50936255461a31`; each of 18 included rows references one or more of 14 deterministic fixtures. | The source contract cannot silently expand its Drawnix WIP exclusion set or lose local retrieval, diagram, or slide fixture coverage. |
| 2. Typed mutation proposals | Not started. `notemd-mutation` does not exist. | Immutable text/bytes/delete plans, staged-asset references, digests, and closed receipts pass contract tests. |
| 3. Local journaled executor | Not started. Local writes are independent `Promise.all()` operations with no batch journal or recovery. | Crash-point, canonical-lock, binary, delete/quarantine, path-boundary, and idempotent recovery tests pass on Windows. |
| 4. Approval, events, jobs, and Tool receipts | Not started. Approvals, checkpoints, events, and open Tool schemas still center on `WritePlan`. | Approval binds plan and asset digests; verified receipts alone publish metadata-only changes; each named Tool has a closed result schema. |
| 5. DSH LLM consumer bridge | Not started. `notemd-llm-dsh` is absent and the direct OpenAI-compatible adapter remains default. | `ctx.llm.stream()` route assembly, cancellation, terminal failure, and HMR disposal tests pass; legacy transport is absent from default patches. |
| 6. DSH web research evidence | Not started. Research synthesis consumes caller-provided strings and no durable evidence package exists. | Named discovery/synthesis operations use `ctx.web`, retain typed evidence and citations, and return capability-unavailable without transport fallback. |
| 7. Document semantics and knowledge retrieval | Not started. There is no documents package; the index is whole-file MiniSearch. | AST sections, stable anchors, chapter/original-text/reconciliation plans, folder policies, scoped windows, and explainable hits pass characterization fixtures. |
| 8. Artifact lineage and SVG-capable renderers | Not started. Artifacts are source JSON/README only, and no renderer package exists. | Versioned specs and source/preview/export lineage support sanitized SVG only for eligible targets through separate named providers. |
| 9. Draw.io, stable Drawnix, and Circuitikz providers | Not started. No staging-only process boundary or specialist renderer package exists. | Allowlisted process tests and provider-specific canonical sources pass, using only the pinned committed Drawnix baseline. |
| 10. Slidev and media exporters | Not started. No Slidev/PPTX/media provider or staged export contract exists. | Prepared slide source and each named export provider prove capability, cleanup, byte limits, and reproducibility. |
| 11. Conformance, HMR, and publication | Prerequisites only. The existing bundle release gate passes, but there is no source-matrix conformance suite or full-migration HMR coverage. | Included matrix rows all pass, dependency/HMR/process cleanup tests pass, and a clean DSH profile accepts the final packed bundle. |

## 6. Recorded Direction

- [Authoritative architecture](../specs/2026-08-15-dsh-notemd-full-migration-architecture.md) defines the DSH/Koishi/Cordis-aligned service graph and corrects the earlier default-provider and source-only artifact decisions.
- [Executable implementation plan](../superpowers/plans/2026-08-15-dsh-notemd-full-migration.md) breaks migration into eleven independently testable tasks.
- Task 1's characterization fixtures prevent later implementation from silently dropping chapter manifest cleanup, original-text extraction, task-scoped retrieval, or target-specific exports.

## 7. Next Direction

1. Begin Task 2. Do not port chapter cleanup, binary artifacts, or exporter output to `WritePlan`; that would force a second rewrite and weaken approval causality.
2. Treat Tasks 2-4 as one authority migration, with one public mutation protocol after callers migrate.
3. Complete Tasks 5-6 after the proposal contract is available. The LLM and web bridges must be DSH consumers before workflows start persisting generated or researched outputs.
4. Complete Task 7 before renderer breadth. Document structure and retrieval evidence are upstream inputs to diagrams, citations, and artifact provenance.
5. Implement Tasks 8-10 by target class, never through a target selector. SVG-capable renderers come first; process-gated Draw.io/Drawnix/Circuitikz and Slidev/media exporters follow only with explicit capability tests.
6. Reserve Task 11 for proof, not optimism: run source-matrix conformance, lifecycle/HMR failure paths, isolated bundle acceptance, and the full release gate after the implementation tasks are green.

## 8. Guardrails

- No source Drawnix WIP is treated as migration baseline.
- `ctx.llm` and `ctx.web` replace NoteMD-owned provider and web transport configuration.
- Renderer and exporter availability is reported truthfully; SVG is a preview derivative only for SVG-capable targets.
- Workspace changes remain explicit, approval-gated, revision-bound, and recoverable.

## 9. Verification and Publication

The first verification segment ran against the documentation change on Node `v22.19.0`:

- Relative-link validation across both READMEs and all six new documents found no missing target.
- `git diff --check` completed without whitespace errors.
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
