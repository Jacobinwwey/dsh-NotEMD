# NoteMD DSH Bundle Validation

## Scope

This walkthrough validates the packed NoteMD bundle against the source DeepSeek Harness checkout pinned at `47f943859bef60e4160492346772ded9b24f765a`. It records a reproducible release gate, not a claim that future upstream releases remain compatible.

## Environment

| Component | Verified version |
| --- | --- |
| Node.js | `22.19.0` |
| Workspace pnpm | `10.7.1` |
| Vitest suite | `12` test files / `38` tests |
| DeepSeek Harness | `0.1.0-rc.5` source checkout |
| DSH installer pnpm | `11.7.0` |
| Cordis peer contract | `@deepseek-ai/cordis` `4.0.1` |
| DSH Tool peer contract | `@deepseek-ai/dsh-tools` `0.1.0-rc.5` |

## Commands

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
git diff --check
```

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
4. Runs `pnpm dsh --profile notemd-acceptance --dump-config` and asserts the vault, Tool, and workflows rows resolve from the installed bundle.
5. Loads the installed bundle through real Cordis and `ToolRuntime`, reads `notes/architecture.md`, produces a deterministic formula-repair plan, requests one-time approval, applies the plan, and verifies the normalized result.
6. Creates another plan, changes its source after planning, approves the old plan, and verifies the write result is `skipped-stale` and the newer content remains intact.
7. Removes the temporary DSH home and workspace in a `finally` block.

The automatic approval provider in this test returns `allowed-once` only to exercise the DSH approval seam without requiring an interactive browser session. It verifies that the bundle does not include plan content in the approval reason. Interactive answerer behavior remains owned by the DSH deployment.

## Deliberate Exclusions

- No Obsidian host, UI, editor state, or command-palette integration.
- No browser preview, desktop process execution, Tectonic, Slidev, PPTX, PDF, SVG/PNG rendering, or native renderer acceptance.
- No live LLM request. Formula repair is deterministic; the LLM adapter separately verifies a missing API key fails before transport work.
- No claim of compatibility with unpinned future DSH/Cordis releases.

## Release Decision

Ship only when every listed command succeeds. A configuration override must restate each replaced row's complete config. Production credentials stay in deployment-owned secret inputs; they are never committed to the bundle or written to workspace state.
