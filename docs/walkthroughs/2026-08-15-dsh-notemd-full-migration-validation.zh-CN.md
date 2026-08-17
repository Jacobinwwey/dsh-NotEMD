# DSH NoteMD 全量迁移验证

> English version: [2026-08-15-dsh-notemd-full-migration-validation.md](2026-08-15-dsh-notemd-full-migration-validation.md)

本文档记录十一阶段迁移的发布证据。判断标准不是“代码存在”，而是具名 contract、失败行为、packed distribution 和 DSH profile 边界都经过验证后，才可称为完成。

## 范围与所有权

- 源行为 oracle：`E:\convert\undo\obsidian-NoteMD_new`，commit `4168a51cd19ad8c3d1e05f604b50936255461a31`。
- 目标：独立运行的 `dsh-NotEMD` bundle，由 DSH 拥有 `llm`、`web`、`tools`、`subprocess` 与 Cordis lifecycle。
- 排除：Obsidian UI/editor/command host 行为、直接 Provider 凭据，以及未提交的 Drawnix WIP。
- Slidev runtime：`github:Jacobinwwey/slidev`，revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`；不接受静默替换为上游 Slidev。

## Contract 证据

`fixtures/migration/source-operation-matrix.json` 固定 29 个源 operation ID、18 个 included operation、11 个设计排除、四个精确 Drawnix WIP 排除和 14 个 SHA-256 fixture。`packages/notemd-workflows/test/migration-conformance.test.ts` 同时消费该 matrix 与 `fixtures/migration/conformance-implementations.json`；任何 included fixture 缺少通过的 proof test 都会使 suite 失败。

所有工作区写入遵循：

```text
read -> immutable WorkspaceMutationPlan -> DSH approval -> journaled executor
     -> committed receipt -> metadata-only event -> fresh-read index update
```

外部渲染遵循：

```text
canonical source -> staging-only process -> bounded/validated bytes
                 -> digest-verified staged asset -> approval-bound mutation
```

## Release 命令

在 `E:\convert\undo\notemd-deepseek-harness`，Node `v22.19.0`、pnpm `10.7.1` 下执行：

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

最终运行的所有命令均已通过。Vitest 报告 48 个文件、184 个测试；coverage 报告 statement 77.03%、branch 71.87%、function 84.54%。`accept:dsh` 将 packed tarball 安装到隔离 DSH profile，验证 bundle patch 与依赖图，加载 clean runtime，执行 source/diagram/export/research Tool contract，然后删除临时 profile 状态。

## Provider 限制

- `ctx.llm` 与 `ctx.web` 是消费型 service。DSH Provider 缺失或歧义时返回封闭的 unavailable/failure outcome；默认 bundle 不含 raw HTTP、DuckDuckGo、Tavily 或隐藏 OpenAI fallback。
- Draw.io、Tectonic、Playwright、NoteMD Drawnix adapter、Slidev fork CLI 和 FFmpeg 都是环境 capability。缺失时返回 unavailable。测试使用确定性的 subprocess fake 覆盖成功、字节上限、坏输出、取消、staging escape 与 cleanup。
- PPTX 是 Slidev 原生 OOXML，MP4 是 Slidev PNG 加 FFmpeg pipeline。SVG 只有在 target contract 明确允许时才是 preview derivative，绝不标记为 PPTX/MP4 parity。
- 当 staged asset 被 approval-bound plan 引用时，service dispose 后仍必须保留它。Cordis dispose 负责停止 timer 和 process tree；mutation cleanup 在 receipt lifecycle 结束后负责资产保留/删除。

## HMR 与替换检查

bundle patch 替换的是完整 config row，因此每次替换都必须按需重述 `workspaceRoot`、`approvalTtlMs`、`scanIntervalMs`、`concurrency`。DSH optional runtime 保持为 optional peer dependency，不隐藏在 package dependency 中。`ctx.effect()` 负责 polling timer、DSH stream consumer、knowledge subscription 与 process-boundary disposal；process disposal 在删除 staging run directory 前等待 active process tree join。

## 发布证据

- canonical remote：`git@github.com:Jacobinwwey/dsh-NotEMD.git`。
- 发布提交 `73480df`（`test: prove full NoteMD migration conformance`）在新鲜 release gate 通过后，以非强制方式推送到 `origin/main`。推送前分歧为 `0 11`；远端没有领先提交，因此无需 rebase。
- 最终 fetch 确认 `origin/main...main = 0 0`。`rtk git status --short --branch` 只输出 `## main`，其后没有任何路径。
