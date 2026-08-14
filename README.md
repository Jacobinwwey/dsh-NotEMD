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
| Derived state | `notemdKnowledge` and `notemdJobs` | State lives under `<workspace>/.notemd/`; it is never stored in the package directory. |

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
