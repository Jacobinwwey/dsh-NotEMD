# NoteMD DeepSeek Harness Bundle

An installable DeepSeek Harness bundle that moves NoteMD note-workflow semantics out of Obsidian. It operates on an explicit workspace root and has no runtime dependency on Obsidian APIs, editor state, or the command registry.

The design rationale is in [the architecture record](docs/specs/2026-08-14-notemd-deepseek-harness-design.md). The Chinese edition is [README.zh-CN.md](README.zh-CN.md).

## Runtime Contract

| Concern | Runtime owner | Invariant |
| --- | --- | --- |
| Workspace content | `notemdVault` | Canonical paths stay inside the configured root; each write carries an exact revision or `absent` precondition. |
| Plans | `notemdWorkflows` and `notemdArtifacts` | Plans are immutable, content-addressed values. Planning does not write. |
| Approval | `notemdApprovalGate` and `notemdApprovalLedger` | A user grant is bound to one plan digest and consumed once. Missing approval fails closed. |
| Mutation | `notemd_apply_approved_plan` | Every target reports `created`, `updated`, `skipped-stale`, `rejected`, `cancelled`, or `failed`. |
| Workspace changes | `notemdWorkspaceChanges` | Approved writes emit metadata-only changes after the vault returns; periodic reconciliation observes external edits. |
| Derived state | `notemdKnowledge` | The index consumes workspace changes and always rereads the vault instead of trusting event payload content. |
| Durable planning jobs | `notemdJobs` | Named workflows checkpoint plans under `<workspace>/.notemd/jobs/`; a job never applies a plan. |

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
    endpoint: !!js process.env.NOTEMD_OPENAI_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions'
    model: !!js process.env.NOTEMD_OPENAI_MODEL ?? 'deepseek-chat'
    apiKeyEnv: NOTEMD_API_KEY
    timeoutMs: 30000
```

`NOTEMD_API_KEY` is read only by model-backed workflows. Deterministic formula repair does not need it. Keep credentials out of `cordis.patch.yml`, fixtures, and workspace state.

## Operational Semantics

The mutation boundary is fixed: `read -> immutable WritePlan -> approval -> vault.apply -> workspace event -> index synchronization`. Only successful `created` and `updated` vault results produce an approved-plan event. Stale, rejected, cancelled, and failed results never masquerade as indexable content changes.

Named `notemd_job_start_*` tools persist a plan-only job and schedule new work asynchronously. A checkpoint records the generated plan for each target; it does not authorize or apply it. On process restart, interrupted `running` jobs become `queued` and remain inert until `notemd_job_resume` is called. Terminal jobs do not restart. Operate one bundle process per workspace: the file-backed store has no cross-process lease protocol.

`notemdWorkspaceChanges` captures an initial snapshot and then reconciles with an ordered poll. The default is `5000` ms; valid values are `250` through `60000` ms. Each scan is proportional to the Markdown workspace size because it lists paths and reads revisions. It is deliberately not a filesystem watcher or a distributed change feed. Events carry paths, revisions, origin, causation id, and timestamps only, never note content or credentials.

`notemd_provider_diagnostic` makes a minimal configured-provider request and may consume provider quota. `notemd_provider_models` is advisory: `/models` is inferred only when the configured completion endpoint ends exactly in `/chat/completions`; otherwise configure `modelsEndpoint`. An unavailable discovery result does not prove that completion is unavailable. Both tools redact credentials, query strings, response bodies, and completion text.

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

The bundle embeds every unpublished `@notemd-harness/*` workspace package. `minisearch` remains a normal public runtime dependency and is resolved by the profile package manager during installation.

## Profile Configuration

The bundle default uses `process.cwd()` as its workspace root. Production profiles must replace the full config of every workspace-owning row because DSH patch layers replace `config` rather than deep-merge it.

```yaml
- id: notemd-vault
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-jobs
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-approval
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT
    approvalTtlMs: 300000

- id: notemd-llm
  config:
    endpoint: !!js process.env.NOTEMD_OPENAI_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions'
    model: !!js process.env.NOTEMD_OPENAI_MODEL ?? 'deepseek-chat'
    apiKeyEnv: NOTEMD_API_KEY
    timeoutMs: 30000
```

`NOTEMD_API_KEY` is read only when a model-backed workflow executes. Deterministic workflows such as formula normalization do not require an LLM key. Do not put keys in `cordis.patch.yml`, fixtures, or workspace state.

## Tool Sequence

Mutation is intentionally a three-step protocol:

```text
notemd_plan_* -> notemd_request_plan_approval -> notemd_apply_approved_plan
```

The write tool revalidates revisions while applying the approved plan. An approval receipt is not a bypass for concurrent edits: changed files return `skipped-stale` instead of being overwritten.

## Development Gates

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
```

`accept:dsh` creates a temporary `DSH_HOME`, installs the packed tarball through the pinned source DSH CLI, dumps the resolved profile, and exercises installed Tools for read, formula planning, approval, application, and stale-plan protection. It removes its temporary profile and workspace after recording the result.

## Operational Limits

- The `@deepseek-ai/*` APIs are pinned to the DSH source reference used by acceptance, not assumed stable across future releases.
- Approval requires a DSH `approval` service and an agent context. Absence is denial, not implicit approval.
- The bundle owns filesystem workflow semantics, not visual rendering or desktop lifecycle. Add those capabilities through declared optional services rather than importing host APIs into this package.
- Workspace roots are deployment inputs. Treat them as authority boundaries, not convenience defaults.
