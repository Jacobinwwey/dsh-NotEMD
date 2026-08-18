# NoteMD DeepSeek Harness Bundle

Portable, approval-gated NoteMD workflow providers for DeepSeek Harness. This
package is the installable bundle described by the repository [README](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.md)
and its [Chinese edition](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.zh-CN.md).

## Install

Build the tarball from the repository root, then add it to a DSH profile:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\jacobinwwey-notemd-deepseek-harness-0.1.0.tgz
```

The package embeds the unpublished `@notemd-harness/*` implementation packages
and declares `dsh.bundle.patch` in `package.json`. It deliberately excludes the
Obsidian runtime; workspace writes are revision-bound and require a one-time
approval receipt.

## Runtime boundary

- DSH owns `llm`, `web`, credentials, and provider transport.
- NoteMD owns workspace-safe planning, approval-bound mutation, durable
  plan-only jobs, knowledge indexing, diagram source/preview artifacts, and
  named Slidev export providers.
- Optional executables report `unavailable`; they are never replaced by a
  different output format.

Use the repository README for the complete tool matrix, profile patch example,
development gates, release checklist, and bilingual documentation map.
