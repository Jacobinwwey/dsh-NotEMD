# dsh-NotEMD

[![DSH bundle](https://img.shields.io/badge/DeepSeek%20Harness-bundle-0f766e)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-3c873a)](https://nodejs.org/)
[![Repository](https://img.shields.io/badge/repository-dsh--NotEMD-181717?logo=github)](https://github.com/Jacobinwwey/dsh-NotEMD)

Portable, approval-gated NoteMD workflows for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The bundle runs against an explicit workspace root, keeps canonical source and derived artifacts together, and has no dependency on Obsidian APIs, editor state, commands, or UI hosts.

[English](README.md) | [简体中文](README.zh-CN.md)

Published package: [dsh-notemd](https://www.npmjs.com/package/dsh-notemd). The canonical npm install spec is `dsh-notemd@0.1.0`.

## Install in 30 seconds

The published delivery unit is an npm package and a DSH bundle. Use the registry path for normal installation:

```powershell
npm install --save-exact dsh-notemd@0.1.0
dsh plugin --profile notes add dsh-notemd@0.1.0
```

The DSH command installs the package into the selected profile. `npm install` is useful when the bundle is consumed from another Node workspace; it is not a substitute for adding the package to a DSH profile.

For an offline or unreleased build, install the packed tarball instead:

Requirements:

| Requirement | Version or policy |
| --- | --- |
| Node.js | `>=22.19.0` |
| pnpm | `10.7.1` (the workspace `packageManager`) |
| DeepSeek Harness | `0.1.0-rc.5` acceptance baseline |
| Cordis | `@deepseek-ai/cordis` `4.0.1` acceptance baseline |

Build and install the packed bundle:

```powershell
git clone git@github.com:Jacobinwwey/dsh-NotEMD.git
cd dsh-NotEMD
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\dsh-notemd-0.1.0.tgz
```

`pnpm pack:bundle` embeds every unpublished `@notemd-harness/*` workspace package. `minisearch` remains a normal runtime dependency and is resolved by the profile package manager. `verify:bundle` expects exactly one `.tgz` under `artifacts/`; remove stale tarballs before repacking during local iteration.

The source profile used by this repository is at [`profiles/notemd`](profiles/notemd). It is a fixture profile, not a replacement for a deployment-owned profile. Run `dsh --profile <name> --dump-config` after installation to inspect the effective Cordis tree and verify that the bundle rows are present.

## What is included

| Capability | Model-facing entry points | Contract |
| --- | --- | --- |
| Workspace | `notemd_workspace_list`, `notemd_workspace_read` | Relative Markdown paths, root containment, immutable revisions. |
| Knowledge | `notemd_knowledge_search`, `notemd_knowledge_retrieve` | Derived index only; retrieval rereads the vault and returns citations. |
| Note workflows | `notemd_plan_*` | Wiki-links, title generation, translation, concepts, Mermaid/formula repair, chapter split, original-text extraction, folder batches, duplicate checks and reviewed dedupe. Planning never writes. |
| Research | `notemd_research_discover`, `notemd_research_capture_evidence`, `notemd_plan_research_synthesis` | Uses DSH `web`; durable evidence stores identity, citations and a digest, not tool output as trusted content. |
| Mutation | `notemd_request_plan_approval`, `notemd_apply_approved_plan` | One plan digest, one approval receipt, one consume; exact revision preconditions; stale plans fail closed. |
| Durable jobs | `notemd_job_start_*`, `notemd_job_resume`, `notemd_job_status`, `notemd_job_cancel` | Asynchronous plan-only checkpoints under `<workspace>/.notemd/jobs/`. Jobs never apply a plan. |
| Diagrams and charts | `notemd_plan_mermaid_artifact`, `notemd_plan_vega_lite_artifact`, `notemd_plan_json_canvas_artifact`, `notemd_plan_html_artifact`, `notemd_plan_editable_svg_artifact` | Canonical source plus an explicitly labelled SVG preview. |
| Specialist diagrams | `notemd_plan_drawio_artifact`, `notemd_plan_drawnix_artifact`, `notemd_plan_circuitikz_artifact` | Canonical source plus SVG projection; native export is capability-gated and never silently substituted. |
| Slidev | `notemd_plan_slidev_source`, `notemd_plan_slidev_*_export` | Source, standalone HTML, PDF, PNG, native PPTX and MP4 are separate named providers. |
| Capability status | `*_render_status`, `*_export_status` | Missing Playwright, FFmpeg, Draw.io, Tectonic or adapters return `unavailable` with a structured diagnostic. |

There is intentionally no generic renderer or export selector. Target fidelity, process allowlists, staging, and failure semantics differ enough that one polymorphic switch would hide important contracts.

## Use it safely

DSH exposes these operations through its normal tool and approval surfaces. A useful first request is:

```text
Read notes/architecture.md. Propose wiki-links and a Mermaid repair as immutable plans.
Show the affected paths and revisions. Ask for approval, then apply only the plan whose
revisions still match.
```

The write protocol is fixed:

```text
read -> immutable WorkspaceMutationPlan -> approval -> apply -> committed receipt -> workspace event -> index update
```

Only a matching `committed` receipt produces a workspace change event. `conflict`, `rejected`, `cancelled`, `failed`, `recovered`, and inconsistent receipts are never treated as indexable content changes.

## Profile configuration

The bundle patch defaults stateful providers to `process.cwd()`. A deployment profile must replace the whole `config` object for every row it overrides; DSH patches do not deep-merge rows. Keep the complete field set:

```yaml
- id: notemd-vault
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-jobs
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT
    concurrency: 2

- id: notemd-workspace-changes
  config:
    scanIntervalMs: 5000

- id: notemd-approval
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT
    approvalTtlMs: 300000

- id: notemd-research
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-artifacts
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-llm
  config:
    provider: deepseek
    model: deepseek-chat
    maxTokens: 4096
    promptPolicyId: notemd.default.v1
```

The default `notemd-llm` provider injects DSH `llm`. Its closed route policy accepts only `provider`, `model`, `maxTokens`, and `promptPolicyId`. Endpoints, keys, headers, transport retries, and model discovery are rejected rather than ignored. Configure credentials, adapters, and provider selection in DSH; NoteMD never reads or persists them.

The explicit `dsh-notemd/llm-openai-compatible-legacy` entry is migration-only. It provides the former OpenAI-compatible diagnostic and model-discovery tools for deployments that cannot yet use DSH routing. Replace the default `notemd-llm` row when using it; never load both because both provide `notemdTextTransformer`.

## Diagrams and export policy

SVG is the default preview derivative for diagrams and charts because DSH has no Obsidian preview host. It is not a claim that every target has an equivalent SVG export:

- Mermaid, Vega-Lite, JSON Canvas, HTML and editable SVG keep their canonical source and produce a labelled SVG preview.
- Draw.io, Drawnix and Circuitikz keep their canonical source; native SVG or PDF is exposed only when the controlled executable or adapter is available.
- Slidev source preparation is deterministic and offline-font safe. HTML, PDF, PNG, PPTX and MP4 are separate providers behind the same approval-gated planner.
- External processes run in a request-scoped staging directory and return digest-verified staged assets. They never write the workspace directly.

The accepted Slidev runtime is the NoteMD fork, not upstream Slidev:

```text
origin: github:Jacobinwwey/slidev
revision: bbcb2efae709c2ebaa96bda522cd6c192476817c
package: @slidev/cli@52.16.0
```

The fork emits `index-standalone.html` for standalone HTML. PPTX remains native OOXML. MP4 is Slidev PNG frames plus FFmpeg. SVG is not advertised as a PPTX or MP4 fallback.

## Operational boundaries

- The bundle is not an Obsidian compatibility layer. UI, editor selection, commands, modals, and preview hosting remain host responsibilities.
- `notemdWorkspaceChanges` snapshots once and reconciles by ordered polling. The default interval is `5000` ms; valid values are `250` through `60000`. Scan cost is proportional to Markdown workspace size.
- Events contain paths, revisions, origin, causation id and timestamps only. They never carry note content or credentials.
- Interrupted `running` jobs recover to inert `queued` records. `notemd_job_resume` is the explicit continuation operation, not write authorization or arbitrary replay.
- The file-backed store has no cross-process lease. Run one bundle process per workspace.
- The default DSH route does not register `notemd_provider_diagnostic` or `notemd_provider_models`; those exist only in the explicit legacy transport entry.
- `@deepseek-ai/*` APIs are validated against the pinned DSH source used by acceptance. Future DSH releases may require a compatibility update.
- Third-party DSH plugins execute code in the host process. Install only packages you trust and inspect the effective profile patch before starting a production profile.

## Development

The code follows the DSH/Cordis composition model: each provider owns one service or capability, registrations are reversible effects, and model-facing tools consume stable seams (`llm`, `web`, `subprocess`, `tools`). Do not import Obsidian or build a second host loop into this bundle.

Useful entry points:

| Area | Source |
| --- | --- |
| Bundle manifest and patch | [`packages/notemd-bundle/package.json`](packages/notemd-bundle/package.json), [`packages/notemd-bundle/cordis.patch.yml`](packages/notemd-bundle/cordis.patch.yml) |
| Tool registration | [`packages/notemd-tools/src`](packages/notemd-tools/src) |
| Workflow planners | [`packages/notemd-workflows/src`](packages/notemd-workflows/src) |
| Artifact providers | [`packages/notemd-artifacts/src`](packages/notemd-artifacts/src), [`packages/notemd-export-slidev/src`](packages/notemd-export-slidev/src) |
| Installed-profile acceptance | [`scripts/accept-dsh-profile.ts`](scripts/accept-dsh-profile.ts) |
| Packed-bundle verification | [`scripts/verify-bundle.ts`](scripts/verify-bundle.ts) |

Run the focused gates first, then the distribution gates:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
pnpm capability:lane
git diff --check
```

`accept:dsh` creates an isolated `DSH_HOME`, installs the packed tarball through the pinned source DSH CLI, boots the installed ToolRuntime, checks approval and stale-revision behavior, checks plan-only jobs and research fail-closed behavior, and verifies the diagram/Slidev capability surface. It removes its temporary profile and fixture workspace after recording evidence.

When adding a capability, define the service contract, provider and consumer together. Register model-facing behavior through `ctx.tools`, use DSH's `llm`/`web`/`subprocess` seams instead of private transports, and add a real installed-artifact acceptance assertion. Keep optional executables explicit: absence is a capability result, never a format substitution.

## Release checklist

1. Update the bundle version in `packages/notemd-bundle/package.json` and keep the lockfile consistent.
2. Update both root README files and both package README files when public behavior or installation changes.
3. Pin or review the Slidev fork lock and optional runtime allowlists.
4. Run all commands in the development gate block on a clean worktree.
5. Confirm the packed tarball contains `dsh.bundle.patch`, compiled entries, all bundled internal packages, and both language README files; `pnpm verify:bundle` checks the distribution contract.
6. Install that exact tarball into a clean DSH profile and inspect `dsh --profile <name> --dump-config` before publishing or sharing it.
7. Publish the exact verified tarball with `npm publish .\\artifacts\\dsh-notemd-0.1.0.tgz --access public --registry=https://registry.npmjs.org/`; npm account 2FA may request a one-time password during this command.

The supported release paths are the npm registry package and the tarball added to a DSH profile. The package is unscoped and public by npm policy; its canonical identity and install spec are `dsh-notemd`, while the tarball remains the reproducible offline fallback.

## Documentation map

| Topic | English | Chinese |
| --- | --- | --- |
| Architecture | [`docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md`](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md) | [`docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md`](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md) |
| Implementation plan | [`docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.md`](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.md) | [`docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md`](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md) |
| Migration progress | [`docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md`](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md) | [`docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md`](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md) |
| Validation evidence | [`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md`](docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md) | [`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md`](docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md) |

External contracts:

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [DeepSeek Harness development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [DeepSeek Harness capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- [DeepSeek Harness testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

## Status

This repository is a developer-preview bundle. The public contract is the packed tarball plus the effective DSH profile patch, not an Obsidian plugin API. Breaking changes are possible while the DSH baseline remains pre-1.0.
