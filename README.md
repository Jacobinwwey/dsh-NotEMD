# NoteMD DeepSeek Harness Bundle

An installable DeepSeek Harness bundle that moves NoteMD note-workflow semantics out of Obsidian. It operates on an explicit workspace root and has no runtime dependency on Obsidian APIs, editor state, or the command registry.

The current runtime baseline is in [the original architecture record](docs/specs/2026-08-14-notemd-deepseek-harness-design.md). The approved [full-migration architecture](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md), [implementation plan](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.md), and [progress record](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md) define the next direction. The Chinese edition is [README.zh-CN.md](README.zh-CN.md).

## Runtime Contract

| Concern | Runtime owner | Invariant |
| --- | --- | --- |
| Workspace content | `notemdVault` | Canonical paths stay inside the configured root; each write carries an exact revision or `absent` precondition. |
| Plans | `notemdWorkflows` and `notemdArtifacts` | Plans are immutable, content-addressed values. Planning does not write. |
| Approval | `notemdApprovalGate` and `notemdApprovalLedger` | A user grant is bound to one plan digest and consumed once. Missing approval fails closed. |
| Mutation | `notemd_apply_approved_plan` | Application yields a closed, revision-bound `WorkspaceMutationReceipt`; it is the only local workspace write authority. |
| Workspace changes | `notemdWorkspaceChanges` | Only a matching `committed` receipt emits metadata-only changes; periodic reconciliation observes external edits. |
| Derived state | `notemdKnowledge` | The index consumes workspace changes and always rereads the vault instead of trusting event payload content. |
| Durable planning jobs | `notemdJobs` | Named workflows checkpoint plans under `<workspace>/.notemd/jobs/`; a job never applies a plan. |
| LLM routing | DSH `llm` | NoteMD supplies only a provider/model route policy; DSH owns credentials, adapters, and transport. |

The package is deliberately not an Obsidian compatibility layer. UI, preview, native renderers, Slidev/PPTX/PDF export, Tectonic, and desktop process integrations are separate optional providers. The baseline produces portable source artifacts and reports missing optional capability explicitly.

## Install

Requirements:

- Node.js `>=22.19.0`
- pnpm `10.7.1`
- DeepSeek Harness `0.1.0-rc.5` with `@deepseek-ai/cordis` `4.0.1`

Build a distributable tarball, then add it to a DSH profile:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\jacobinwwey-notemd-deepseek-harness-0.1.0.tgz
```

## Profile Configuration

The bundle defaults its workspace root to `process.cwd()`. A production profile must restate the complete configuration for every replaced row because a DSH patch replaces a row's `config`; it does not deep-merge it.

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

- id: notemd-llm
  config:
    provider: deepseek
    model: deepseek-chat
    maxTokens: 4096
    promptPolicyId: notemd.default.v1
```

The default `notemd-llm` entry injects DSH's `llm` service. Its closed route policy permits only `provider`, `model`, `maxTokens`, and `promptPolicyId`; an endpoint, key, header, transport retry, or model-discovery field is rejected rather than ignored. Configure credentials, provider adapters, and provider selection in DSH itself. NoteMD never reads or persists them.

`@jacobinwwey/notemd-deepseek-harness/llm-openai-compatible-legacy` is an explicit migration-only entry for deployments that cannot yet use DSH LLM routing. It owns the former OpenAI-compatible diagnostics and discovery behavior. A legacy profile must replace the default `notemd-llm` entry with that module; do not load both, because both provide `notemdTextTransformer`. The default bundle patch never loads the legacy entry.

## Operational Semantics

The mutation boundary is fixed: `read -> immutable WorkspaceMutationPlan -> approval -> mutation executor -> matching committed receipt -> workspace event -> index synchronization`. Conflicted, rejected, cancelled, failed, recovered, or inconsistent receipts never masquerade as indexable content changes.

Named `notemd_job_start_*` tools persist a plan-only job and schedule new work asynchronously. A checkpoint records the generated plan for each target; it does not authorize or apply it. On process restart, interrupted `running` jobs become `queued` and remain inert until `notemd_job_resume` is called. Terminal jobs do not restart. Operate one bundle process per workspace: the file-backed store has no cross-process lease protocol.

`notemdWorkspaceChanges` captures an initial snapshot and then reconciles with an ordered poll. The default is `5000` ms; valid values are `250` through `60000` ms. Each scan is proportional to the Markdown workspace size because it lists paths and reads revisions. It is deliberately not a filesystem watcher or a distributed change feed. Events carry paths, revisions, origin, causation id, and timestamps only, never note content or credentials.

The default DSH route does not register `notemd_provider_diagnostic` or `notemd_provider_models`, because DSH owns provider configuration and observability. Those migration-only tools are available only when the explicit legacy transport entry replaces the default LLM entry.

`notemd_artifact_render_status` and `notemd_artifact_export_status` report structured `unavailable` results in the core bundle. Source artifacts remain reviewable plans; renderer and exporter installation belong to separately declared providers.

## Development Gates

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
git diff --check
```

`accept:dsh` creates an isolated `DSH_HOME`, installs the packed tarball through the pinned source DSH CLI, and exercises the installed ToolRuntime. It removes its temporary profile and fixture workspace after recording evidence.
