# dsh-NotEMD

[![npm](https://img.shields.io/npm/v/dsh-notemd?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-notemd)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-bundle-0f766e)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-3c873a)](https://nodejs.org/)
[![Repository](https://img.shields.io/badge/repository-dsh--NotEMD-181717?logo=github)](https://github.com/Jacobinwwey/dsh-NotEMD)

Portable, approval-gated NoteMD workflows for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The bundle operates on an explicit workspace root, keeps canonical source and derived artifacts together, and has no dependency on Obsidian APIs, editor state, commands, or UI hosts.

[English](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.md) | [简体中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.zh-CN.md)

**Current release:** [`dsh-notemd@0.1.1`](https://www.npmjs.com/package/dsh-notemd/v/0.1.1) · [GitHub repository](https://github.com/Jacobinwwey/dsh-NotEMD)

## Install

Requirements for the supported acceptance baseline:

| Requirement | Version or policy |
| --- | --- |
| Node.js | `>=22.19.0` |
| pnpm | `10.7.1` (the workspace `packageManager`) |
| DeepSeek Harness | `0.1.0-rc.5` acceptance baseline |
| Cordis | `@deepseek-ai/cordis` `4.0.1` acceptance baseline |

Install the public registry package and add the same version to a DSH profile:

~~~
npm install --save-exact dsh-notemd@0.1.1
dsh plugin --profile notes add dsh-notemd@0.1.1
~~~

`npm install` makes the package available to a Node workspace. `dsh plugin ... add` activates its bundle patch in the selected profile; the second command is the step that enables the plugin for DSH.

For an offline or unreleased build, install the exact verified tarball:

~~~
git clone git@github.com:Jacobinwwey/dsh-NotEMD.git
cd dsh-NotEMD
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add ./artifacts/dsh-notemd-0.1.1.tgz
~~~

`pnpm pack:bundle` embeds the unpublished `@notemd-harness/*` implementation packages. `minisearch` remains a normal runtime dependency and is resolved by the profile package manager. The pack verifier expects exactly one `.tgz` under `artifacts/`; remove stale tarballs before repacking.

The repository fixture profile is [`profiles/notemd`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/profiles/notemd). It is an acceptance fixture, not a deployment-owned profile. After installation, inspect the effective profile with:

~~~
dsh --profile notes --dump-config
~~~

## Quick use

The bundle exposes planning tools first. A typical request is:

~~~
Read notes/architecture.md. Propose wiki-links and a Mermaid repair as immutable plans.
Show the affected paths and revisions. Ask for approval, then apply only the plan whose
revisions still match.
~~~

The write protocol is fixed and auditable:

~~~
read -> immutable WorkspaceMutationPlan -> approval -> apply -> committed receipt -> workspace event -> index update
~~~

Only a matching `committed` receipt produces a workspace change event. `conflict`, `rejected`, `cancelled`, `failed`, `recovered`, and inconsistent receipts are never treated as indexable content changes.

## Capabilities

| Area | Model-facing entry points | Contract |
| --- | --- | --- |
| Workspace | `notemd_workspace_list`, `notemd_workspace_read` | Workspace-relative Markdown paths, root containment, immutable revisions. |
| Knowledge | `notemd_knowledge_search`, `notemd_knowledge_retrieve` | Derived index only; retrieval rereads the vault and returns citations. |
| Note workflows | `notemd_plan_*` | Wiki-links, title generation, translation, concept extraction, Mermaid/formula repair, chapter split, original-text extraction, folder batches, duplicate checks, and reviewed dedupe. Planning never writes. |
| Research | `notemd_research_discover`, `notemd_research_capture_evidence`, `notemd_plan_research_synthesis` | Uses DSH `web`; durable evidence stores identity, citations, and a digest, not untrusted tool output. |
| Mutation | `notemd_request_plan_approval`, `notemd_apply_approved_plan` | One plan digest, one approval receipt, one consume; exact revision preconditions; stale plans fail closed. |
| Durable jobs | `notemd_job_start_*`, `notemd_job_resume`, `notemd_job_status`, `notemd_job_cancel` | Asynchronous plan-only checkpoints under `<workspace>/.notemd/jobs/`; jobs never apply a plan. |
| Diagrams and charts | `notemd_plan_mermaid_artifact`, `notemd_plan_vega_lite_artifact`, `notemd_plan_json_canvas_artifact`, `notemd_plan_html_artifact`, `notemd_plan_editable_svg_artifact` | Canonical source plus an explicitly labelled SVG preview. |
| Specialist diagrams | `notemd_plan_drawio_artifact`, `notemd_plan_drawnix_artifact`, `notemd_plan_circuitikz_artifact` | Canonical source plus SVG projection; native export is capability-gated and never silently substituted. |
| Slidev | `notemd_plan_slidev_source`, `notemd_plan_slidev_*_export` | Source, standalone HTML, PDF, PNG, native PPTX, and MP4 are separate named providers. |
| Capability status | `*_render_status`, `*_export_status` | Missing Playwright, FFmpeg, Draw.io, Tectonic, or adapters return `unavailable` with a structured diagnostic. |

There is intentionally no generic renderer or export selector. Target fidelity, process allowlists, staging, and failure semantics differ enough that one polymorphic switch would hide important contracts.

## Composite workflow

`one-click-extract@1` is the named composite workflow for the source plugin's One-Click Extract behavior:

~~~text
add-links -> generate-complete -> repair-mermaid
~~~

Use `notemd_plan_one_click_extract` when one aggregate immutable plan and one approval receipt are required. Supply explicit `sourcePath`, `conceptFolderPath`, `completedFolderPath`, `mermaidFolderPath`, and optional `mermaidErrorFolderPath`; the standalone bundle does not infer Obsidian active-file or UI folder state. Use `notemd_job_start_one_click_extract` for a durable plan-only job; its executor key is `one-click-extract-v1`, while the persisted record retains workflow version and definition digest for drift detection.

The composite uses a virtual workspace overlay. Later steps can read earlier planned Markdown writes, but no physical workspace write occurs before approval. Collisions, stale virtual revisions, binary dependencies, budget overflow, and net no-op results fail closed.

## Profile configuration

The bundle patch defaults stateful providers to `process.cwd()`. A deployment profile must replace the whole `config` object for every row it overrides; DSH patches do not deep-merge rows. Keep the complete field set:

~~~yaml
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
~~~

The default `notemd-llm` provider injects DSH `llm`. Its closed route policy accepts only `provider`, `model`, `maxTokens`, and `promptPolicyId`. Endpoints, keys, headers, transport retries, and model discovery are rejected rather than ignored. Configure credentials, adapters, and provider selection in DSH; NoteMD never reads or persists them.

The explicit `dsh-notemd/llm-openai-compatible-legacy` entry is migration-only. It provides the former OpenAI-compatible diagnostic and model-discovery tools for deployments that cannot yet use DSH routing. Replace the default `notemd-llm` row when using it; never load both because both provide `notemdTextTransformer`.

## Diagrams and exports

DSH has no Obsidian preview host, so SVG is the default preview derivative. This is a preview policy, not a claim that every target has an equivalent SVG export:

- Mermaid, Vega-Lite, JSON Canvas, HTML, and editable SVG keep their canonical source and produce a labelled SVG preview.
- Mermaid normalization runs deterministically before LLM repair. The versioned semantic/render/export catalog keeps `timeline`, `swimlane`, and `quadrant` payloads typed; `svg-preview` is an explicit derivative, not native target parity.
- Draw.io, Drawnix, and Circuitikz keep their canonical source; native SVG or PDF is exposed only when the controlled executable or adapter is available.
- Slidev source preparation is deterministic and offline-font safe. HTML, PDF, PNG, PPTX, and MP4 are separate providers behind the same approval-gated planner.
- External processes run in a request-scoped staging directory and return digest-verified staged assets. They never write the workspace directly.

The accepted Slidev runtime is the [NoteMD fork](https://github.com/Jacobinwwey/slidev), not upstream Slidev:

~~~
origin: github:Jacobinwwey/slidev
revision: bbcb2efae709c2ebaa96bda522cd6c192476817c
package: @slidev/cli@52.16.0
~~~

The fork emits `index-standalone.html` for standalone HTML. PPTX remains native OOXML. MP4 is Slidev PNG frames plus FFmpeg. SVG is not advertised as a PPTX or MP4 fallback.

## Runtime boundaries

- This bundle is not an Obsidian compatibility layer. UI, editor selection, commands, modals, and preview hosting remain host responsibilities.
- `notemdWorkspaceChanges` snapshots once and reconciles by ordered polling. The default interval is `5000` ms; valid values are `250` through `60000`. Scan cost is proportional to Markdown workspace size.
- Events contain paths, revisions, origin, causation id, and timestamps only. They never carry note content or credentials.
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
| Bundle manifest and patch | [`packages/notemd-bundle`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-bundle) |
| Tool registration | [`packages/notemd-tools/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-tools/src) |
| Workflow planners | [`packages/notemd-workflows/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-workflows/src) |
| Artifact providers | [`packages/notemd-artifacts/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-artifacts/src), [`packages/notemd-export-slidev/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-export-slidev/src) |
| Installed-profile acceptance | [`scripts/accept-dsh-profile.ts`](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/scripts/accept-dsh-profile.ts) |
| Packed-bundle verification | [`scripts/verify-bundle.ts`](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/scripts/verify-bundle.ts) |

Run the focused gates first, then the distribution gates:

~~~powershell
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
~~~

`accept:dsh` creates an isolated `DSH_HOME`, installs the packed tarball through the pinned source DSH CLI, boots the installed ToolRuntime, checks approval and stale-revision behavior, checks plan-only jobs and research fail-closed behavior, and verifies the diagram/Slidev capability surface. It removes its temporary profile and fixture workspace after recording evidence.

When adding a capability, define the service contract, provider, and consumer together. Register model-facing behavior through `ctx.tools`, use DSH's `llm`/`web`/`subprocess` seams instead of private transports, and add an installed-artifact acceptance assertion. Keep optional executables explicit: absence is a capability result, never a format substitution.

## Release

The public npm package is unscoped and public. Maintainers should publish the exact tarball that passed the installed-profile acceptance gate:

~~~powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
npm publish ./artifacts/dsh-notemd-0.1.1.tgz --access public --registry=https://registry.npmjs.org/
~~~

The package publishes `README.md` as its canonical npm README. The same Chinese document is included at `docs/README.zh-CN.md` and remains linked from the canonical document. It is kept out of the package root so npm cannot select it as `readmeFilename`.

For a maintainer account with npm 2FA enabled, `npm publish` may pause for an OTP. Consumers never need the maintainer's npm login or OTP.

After publishing, verify the registry metadata:

~~~powershell
npm view dsh-notemd version --registry=https://registry.npmjs.org/
npm view dsh-notemd@0.1.1 readmeFilename --registry=https://registry.npmjs.org/
~~~

Expected values are `0.1.1` and `README.md`.

## Documentation and external contracts

The homepage intentionally contains operational guidance only. Architecture and validation evidence live in the bilingual repository documents:

- [Architecture specification (English)](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md) · [中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md)
- [Validation evidence (English)](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md) · [中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md)
- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [DeepSeek Harness development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [DeepSeek Harness capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- [DeepSeek Harness testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

## Status

This repository is a developer-preview bundle. The public contract is the packed tarball plus the effective DSH profile patch, not an Obsidian plugin API. DSH remains pre-1.0, so future releases may require compatibility updates.
