# NoteMD DSH Bundle Validation

## Scope

This walkthrough validates the packed NoteMD bundle against the source DeepSeek Harness checkout pinned at `47f943859bef60e4160492346772ded9b24f765a`. It records a reproducible release gate, not a claim that future upstream releases remain compatible.

## Environment

| Component | Verified version |
| --- | --- |
| Node.js | `22.19.0` |
| Workspace pnpm | `10.7.1` |
| Vitest suite | `16` test files / `50` tests |
| DeepSeek Harness | `0.1.0-rc.5` source checkout |
| DSH installer pnpm | `11.7.0` |
| Cordis peer contract | `@deepseek-ai/cordis` `4.0.1` |
| DSH Tool peer contract | `@deepseek-ai/dsh-tools` `0.1.0-rc.5` |

## Commands

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

`pnpm test:coverage` collects only publishable `packages/**/src/**/*.ts`; the pinned `ref/` checkout and release scripts are intentionally excluded.

The DSH source runtime is prepared only in `ref/deepseek-harness`:

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh --help
```

The reference checkout remains source-clean; generated dependencies and build output are not project changes.

## Acceptance Evidence

`pnpm accept:dsh` performs the following against a new temporary `DSH_HOME` and an independently copied fixture workspace:

1. Builds and packs the bundle, then verifies the tarball contains compiled bridge modules, its DSH patch, and all unpublished internal workspace dependencies while excluding source, tests, maps, build metadata, state, and environment files.
2. Runs `pnpm dsh plugin --profile notemd-acceptance add <tarball>` from the pinned DSH source checkout.
3. Writes a profile-only overlay that supplies the complete vault, job, and approval configurations through `NOTEMD_ACCEPTANCE_WORKSPACE`.
4. Runs `pnpm dsh --profile notemd-acceptance --dump-config` and asserts the vault, workspace-change, Tool, and workflows rows resolve from the installed bundle.
5. Loads the installed bundle through real Cordis and `ToolRuntime`, reads `notes/architecture.md`, verifies a missing provider key fails closed, and verifies renderer and export status are explicitly unavailable.
6. Starts a named formula-repair job, waits for its durable plan checkpoint, then creates a deterministic formula-repair plan, requests one-time approval, applies the plan, and verifies the normalized result plus its approved-plan workspace-change metadata.
7. Creates another plan, changes its source after planning, approves the old plan, and verifies the write result is `skipped-stale` and the newer content remains intact.
8. Removes the temporary DSH home and workspace in a `finally` block.

The automatic approval provider in this test returns `allowed-once` only to exercise the DSH approval seam without requiring an interactive browser session. It verifies that the bundle does not include plan content in the approval reason. Interactive answerer behavior remains owned by the DSH deployment.

## Operational Evidence and Limits

- An approved write follows `read -> immutable plan -> approval -> vault.apply -> workspace event`; the event contains metadata only. The knowledge package separately tests that a change causes a fresh vault read before the index is replaced.
- New named jobs are scheduled asynchronously. A crash-recovered job remains `queued` and requires `notemd_job_resume`; checkpoints record plans only and never become write authority.
- Workspace reconciliation is ordered polling, not a filesystem watcher. The default interval is `5000` ms and valid values are `250` through `60000` ms; each scan costs one Markdown listing plus revision reads.
- Run one bundle process per workspace. The file-backed job store and in-memory event subscriptions do not provide cross-process lease or event-delivery guarantees.
- Provider model discovery is advisory. `/models` is derived only for a completion endpoint ending exactly in `/chat/completions`; deployments with another topology must configure `modelsEndpoint`.
- Renderer and document-export status is explicitly `unavailable` in the core bundle. No unsupported local renderer is installed or claimed by this validation.

## Deliberate Exclusions

- No Obsidian host, UI, editor state, or command-palette integration.
- No browser preview, desktop process execution, Tectonic, Slidev, PPTX, PDF, SVG/PNG rendering, or native renderer acceptance.
- No live LLM request. Formula repair is deterministic; the LLM adapter separately verifies a missing API key fails before transport work.
- No claim of compatibility with unpinned future DSH/Cordis releases.

## Release Decision

Ship only when every listed command succeeds. A configuration override must restate each replaced row's complete config. Production credentials stay in deployment-owned secret inputs; they are never committed to the bundle or written to workspace state.
