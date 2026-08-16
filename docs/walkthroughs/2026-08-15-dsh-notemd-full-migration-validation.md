# DSH NoteMD Full Migration Validation

> Chinese version: [2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md](2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md)

This walkthrough records the release evidence for the eleven-phase migration. It is intentionally evidence-oriented: a capability is complete only when its named contract, failure behavior, packed distribution, and DSH profile boundary are verified.

## Scope and ownership

- Source oracle: `E:\convert\undo\obsidian-NoteMD_new` at commit `4168a51cd19ad8c3d1e05f604b50936255461a31`.
- Target: standalone `dsh-NotEMD` bundle with DSH-owned `llm`, `web`, `tools`, `subprocess`, and Cordis lifecycle.
- Excluded: Obsidian UI/editor/command host behavior, direct provider credentials, and uncommitted Drawnix WIP.
- Slidev runtime: `github:Jacobinwwey/slidev` at `bbcb2efae709c2ebaa96bda522cd6c192476817c`; upstream Slidev is not accepted.

## Contract evidence

`fixtures/migration/source-operation-matrix.json` pins 29 source operation IDs, 18 included operations, 11 design exclusions, four exact Drawnix WIP exclusions, and 14 SHA-256-pinned fixtures. `packages/notemd-workflows/test/migration-conformance.test.ts` consumes that matrix and `fixtures/migration/conformance-implementations.json`; an included fixture without a passing proof test fails the suite.

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

The final run passed every command above. Vitest reported 48 files and 184 tests; coverage reported 77.03% statements, 71.86% branches, and 84.54% functions. `accept:dsh` installed the packed tarball into an isolated DSH profile, verified the bundle patch and dependency graph, loaded the clean runtime, exercised source/diagram/export/research Tool contracts, and removed temporary profile state.

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
