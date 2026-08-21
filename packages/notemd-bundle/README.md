# dsh-NotEMD

Portable, approval-gated NoteMD workflow providers for DeepSeek Harness. This
package is the installable bundle described by the repository [README](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.md)
and its [Chinese edition](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.zh-CN.md).

Short display name: [dsh-notemd](https://www.npmjs.com/package/@jacobinwwey/dsh-notemd). The canonical npm install spec remains `@jacobinwwey/dsh-notemd`.

## Install

Install the published package into a Node workspace, then add the same version to a DSH profile:

```powershell
npm install --save-exact @jacobinwwey/dsh-notemd@0.1.0
dsh plugin --profile notes add @jacobinwwey/dsh-notemd@0.1.0
```

The package is public-scoped and declares its registry in `publishConfig`. npm 2FA is only relevant to maintainers publishing a release; consumers do not need the publisher's login or OTP.

For offline or unreleased builds, use the tarball path below.

Build the tarball from the repository root, then add it to a DSH profile:

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\jacobinwwey-dsh-notemd-0.1.0.tgz
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
