# DSH NoteMD Full Migration Validation

> Chinese version: [2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md](2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md)

This walkthrough records the release evidence for the twelve-phase baseline and the post-release capability lanes. It is intentionally evidence-oriented: a capability is complete only when its named contract, failure behavior, packed distribution, and DSH profile boundary are verified.

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

The Phase 12 release run passed every command above. Vitest reported 48 files and 185 tests; coverage reported 77.63% statements, 72.35% branches, and 85.33% functions. `accept:dsh` installed the packed tarball into an isolated DSH profile, verified the bundle patch and dependency graph, loaded the clean runtime, exercised source/diagram/export/research Tool contracts, and removed temporary profile state.

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
- Release commit `73480df` (`test: prove full NoteMD migration conformance`) was pushed to `origin/main` without force after the fresh release gate. Fetch-before-push divergence was `0 11`; there were no remote-ahead commits to rebase.
- A final fetch confirmed `origin/main...main = 0 0`. `rtk git status --short --branch` reported exactly `## main` with no following paths.

## Phase 13 optional-runtime evidence

The lane is deliberately separate from the portable bundle gate. `scripts/optional-runtime-capability-lane.ts` creates a deterministic PDF fixture, resolves allowlisted executables through the Windows `Path`, runs only staging-bound profiles, records executable/content fingerprints, and finalizes staging cleanup. `NOTEMD_CAPABILITY_LANE_REQUIRE_NATIVE=1` is an explicit strict-native opt-in; the default run must preserve truthful unavailable results.

The measured Node `v22.19.0` / pnpm `10.7.1` run used fixture digest `0ddba517ff3630d3c1e84b54bb952a6d91a82d7550489e3805994e57a52d53d4` and reported cleanup `true`. `pdftocairo` produced ready native SVG (`2f74b912f9ad7bc30512d1de59457e665400ca590acfa03a886aee50ac3c87cb`) and PNG (`f2279ebd674c8dadc5f57e35ebeb0c7573ff953359b5703a42a33b292c9e4c70`) outputs. Draw.io, Tectonic, the stable Drawnix adapter, and the Slidev/Playwright/FFmpeg lane were absent or unverified and remained `unavailable`; the cancellation probe returned `process-cancelled`.

The Slidev observation cannot become ready without a manifest matching the pinned fork `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`; this run intentionally reported `slidev-fork-unverified`. Executable bytes are fingerprinted when present, while path fallback is limited to deterministic fake runtimes. No upstream Slidev, global installation, or SVG substitution for a native PPTX/MP4 result is accepted.

## Phase 14 schema evidence

Artifact envelopes now carry one explicit family discriminator: `diagram-spec@2`, `diagram-lineage@2`, or `document-export@3`. `packages/notemd-artifacts/src/schema-registry.ts` is the shared registry; family modules remain responsible for payload fields and reject unsupported top-level keys. `metadata` is the only forward-compatible extension point and must be a finite JSON-safe object.

The registry suite passed 8 tests. Its inspection API returns structured diagnostics for missing/unknown family, missing/unknown version, invalid family/version combinations, and invalid metadata. The generated diagram and document manifests assert their expected registry entry before mutation planning. Adding `schemaFamily` to the canonical DiagramSpec identity changed the conformance fixture directory from `notemd-artifact-9a9e469f716c93be0bbe` to `notemd-artifact-ff9a6d55ec0208286fed`; the matrix was updated and the conformance adapter passed 1 file/2 tests.

`verify-bundle` extracts the tarball, dynamically loads the packaged artifacts registry, accepts valid v2/v3 fixtures, and requires `invalid-combination` for `diagram-spec@3`. This prevents a source-only registry from passing while the distributed package drifts.
