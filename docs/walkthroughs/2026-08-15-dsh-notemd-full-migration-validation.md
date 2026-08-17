# DSH NoteMD Full Migration Validation

> Chinese version: [2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md](2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md)

This walkthrough records release evidence for the sixteen-phase standalone migration. It is intentionally evidence-oriented: a capability is complete only when its named contract, failure behavior, packed distribution, and DSH profile boundary are verified.

## Scope and ownership

- Source oracle: `E:\convert\undo\obsidian-NoteMD_new` at commit `4168a51cd19ad8c3d1e05f604b50936255461a31`.
- Target: standalone `dsh-NotEMD` bundle with DSH-owned `llm`, `web`, `tools`, `subprocess`, and Cordis lifecycle.
- Excluded: Obsidian UI/editor/command host behavior, direct provider credentials, and uncommitted Drawnix WIP.
- Slidev runtime: `github:Jacobinwwey/slidev` at `bbcb2efae709c2ebaa96bda522cd6c192476817c`; upstream Slidev is not accepted.

## Contract evidence

`fixtures/migration/source-operation-matrix.json` pins 29 source operation IDs, 18 included operations, 11 design exclusions, four exact Drawnix WIP exclusions, and 14 SHA-256-pinned fixtures. `packages/notemd-workflows/test/migration-conformance.test.ts` consumes that matrix and the v2 `fixtures/migration/conformance-implementations.json`; each included operation must execute through a typed adapter, while auxiliary observations such as local retrieval remain explicit.

All workspace writes follow:

```text
read -> immutable WorkspaceMutationPlan -> DSH approval -> journaled executor
     -> committed receipt -> metadata-only event -> fresh-read index update
```

External renderers follow:

```text
canonical source -> staging-only process -> bounded/validated bytes
                 -> digest-verified staged asset -> approval-bound mutation
```

## Release commands

Run from `E:\convert\undo\notemd-deepseek-harness` with Node `v22.19.0` and pnpm `10.7.1`:

```powershell
rtk proxy pnpm.cmd typecheck
rtk proxy pnpm.cmd lint
rtk proxy pnpm.cmd test
rtk proxy pnpm.cmd test:coverage
rtk proxy pnpm.cmd build
rtk proxy pnpm.cmd pack:bundle
rtk proxy pnpm.cmd verify:bundle
rtk proxy pnpm.cmd accept:dsh
rtk git diff --check
```

The historical Phase 12 release run passed every command above with 48 files and 185 tests. The latest Phase 15/16 gate passed the strict sequence `test`, `test:coverage`, `build`, `pack:bundle`, `verify:bundle`, and `accept:dsh`, followed by `git diff --check`; Vitest reported 52 files and 203 tests, with 77.68% statements, 73.00% branches, and 85.21% functions. `accept:dsh` installed the packed tarball into an isolated DSH profile, verified the bundle patch and dependency graph, loaded the clean runtime, exercised source/diagram/export/research Tool contracts, and removed temporary profile state.

## Phase 12 adapter evidence

- Manifest v2 replaces source-text `proofTerms` with `adapterId`, explicit `sourceOperationIds`, and executable `operationIds`.
- Fourteen adapters create isolated temporary workspaces and invoke the real workflow, knowledge, diagram, or Slidev source planner. They return only typed contract observations and remove the workspace in `finally`.
- The matrix records actual source behavior: source-sibling chapter ownership, `_Extracted` original-text output, translation language folders, content-addressed diagram/Slidev lineage, source revision bindings, and operation-specific duplicate schemas.
- The focused gate passed 1 file and 2 tests. The adapter gate does not claim live DSH provider quality or installed native optional runtimes; Phase 13 owns those capability lanes.

## Provider limits

- `ctx.llm` and `ctx.web` are consumed services. Missing or ambiguous DSH providers map to closed unavailable/failure outcomes; there is no raw HTTP, DuckDuckGo, Tavily, or hidden OpenAI fallback in the default bundle.
- Draw.io, Tectonic, Playwright, the NoteMD Drawnix adapter, Slidev fork CLI, and FFmpeg are environment capabilities. Their absence is reported as unavailable. Tests use deterministic subprocess fakes for success, byte caps, malformed output, cancellation, staging escape, and cleanup.
- PPTX is native Slidev OOXML and MP4 is the Slidev PNG plus FFmpeg pipeline. SVG is a preview derivative only where the target contract says so; it is never labelled as PPTX/MP4 parity.
- Staged assets survive service disposal when they are referenced by an approval-bound plan. Cordis disposal stops timers and process trees; mutation cleanup owns asset retention/removal after the receipt lifecycle.

## HMR and replacement checks

The bundle patch replaces complete config rows, so every replacement must restate `workspaceRoot`, `approvalTtlMs`, `scanIntervalMs`, or `concurrency` as applicable. Optional DSH runtimes remain optional peer dependencies rather than hidden package dependencies. `ctx.effect()` owns polling timer, DSH stream consumer, knowledge subscription, and process-boundary disposal; process disposal joins active process trees before staging run directories are removed.

## Publication evidence

- Canonical remote: `git@github.com:Jacobinwwey/dsh-NotEMD.git`.
- Phase 15/16 release commit `f8de6de` (`feat: harden workspace ownership and lock source intake`) was pushed non-force to `git@github.com:Jacobinwwey/dsh-NotEMD.git`; final fetch confirmed `origin/main...main = 0 0` and the worktree was clean.

## Phase 13 optional-runtime evidence

The lane is deliberately separate from the portable bundle gate. `scripts/optional-runtime-capability-lane.ts` creates a deterministic PDF fixture, resolves allowlisted executables through the Windows `Path`, runs only staging-bound profiles, records executable/content fingerprints, and finalizes staging cleanup. `NOTEMD_CAPABILITY_LANE_REQUIRE_NATIVE=1` is an explicit strict-native opt-in; the default run must preserve truthful unavailable results.

The measured Node `v22.19.0` / pnpm `10.7.1` run used fixture digest `0ddba517ff3630d3c1e84b54bb952a6d91a82d7550489e3805994e57a52d53d4` and reported cleanup `true`. `pdftocairo` produced ready native SVG (`2f74b912f9ad7bc30512d1de59457e665400ca590acfa03a886aee50ac3c87cb`) and PNG (`f2279ebd674c8dadc5f57e35ebeb0c7573ff953359b5703a42a33b292c9e4c70`) outputs. Draw.io, Tectonic, the stable Drawnix adapter, and the Slidev/Playwright/FFmpeg lane were absent or unverified and remained `unavailable`; the cancellation probe returned `process-cancelled`.

The Slidev observation cannot become ready without a manifest matching the pinned fork `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`; this run intentionally reported `slidev-fork-unverified`. Executable bytes are fingerprinted when present, while path fallback is limited to deterministic fake runtimes. No upstream Slidev, global installation, or SVG substitution for a native PPTX/MP4 result is accepted.

## Phase 14 schema evidence

Artifact envelopes now carry one explicit family discriminator: `diagram-spec@2`, `diagram-lineage@2`, or `document-export@3`. `packages/notemd-artifacts/src/schema-registry.ts` is the shared registry; family modules remain responsible for payload fields and reject unsupported top-level keys. `metadata` is the only forward-compatible extension point and must be a finite JSON-safe object.

The registry suite passed 8 tests. Its inspection API returns structured diagnostics for missing/unknown family, missing/unknown version, invalid family/version combinations, and invalid metadata. The generated diagram and document manifests assert their expected registry entry before mutation planning. Adding `schemaFamily` to the canonical DiagramSpec identity changed the conformance fixture directory from `notemd-artifact-9a9e469f716c93be0bbe` to `notemd-artifact-ff9a6d55ec0208286fed`; the matrix was updated and the conformance adapter passed 1 file/2 tests.

`verify-bundle` extracts the tarball, dynamically loads the packaged artifacts registry, accepts valid v2/v3 fixtures, and requires `invalid-combination` for `diagram-spec@3`. This prevents a source-only registry from passing while the distributed package drifts.

## Phase 15 workspace ownership evidence

`WorkspaceOwnershipGuard` is the single-process boundary for the current bundle. It creates `.notemd/runtime/workspace-owner.json` with allowlisted metadata, rejects a live second owner with `workspace-process-already-owned`, and recovers only when the recorded PID is dead and the heartbeat is expired. Release requires the owner revision to match and returns a cleanup-health fact; vault initialization releases the guard if `LocalVault.open()` fails.

The focused gate passed `workspace-ownership.test.ts` (5 tests), the existing local-vault/mutation suites (26 tests), `runtime-boundary.test.ts`, typecheck, and lint. SQLite, distributed leases, unconditional stale-lock deletion, and multi-process planning serialization remain explicitly rejected. The full 52-file/203-test release gate above also passed.

## Phase 16 source-intake evidence

`fixtures/migration/source-intake-lock.json` pins candidate `obsidian-NoteMD_new@cdf580c6c876190ecc1040caea08e5ba5bee004f`, records its parent and dirty checkout paths, and links from `source-operation-matrix.json` without changing the pinned behavior contract commit. The candidate and baseline both expose 29 operation IDs; there are no migration fixture hash changes. The only registry schema delta removes the Drawnix-only `drawnixKnowledgeMapDelivery` input field.

The lock classifies diagram-gallery, response-cache, render-target, and Mermaid normalization separately. Provider cache policy is rejected because DSH owns provider/model routing; host gallery/preview/save behavior is excluded; target descriptors are deferred behind named bundle adapters; Mermaid normalization is a follow-up candidate requiring its own deterministic conformance fixture. The committed candidate Drawnix paths, the four baseline exclusions, the candidate-only Drawnix fixture, and all five dirty paths are named in quarantine. No source implementation is copied from the dirty checkout.

The focused intake gate passed `migration-source-intake.test.ts` and `migration-conformance.test.ts`. The full release gate above reran the complete suite, coverage, build, packed-bundle verification, clean DSH acceptance, and `git diff --check`; all passed.
