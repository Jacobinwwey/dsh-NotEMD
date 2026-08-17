# DSH NoteMD 全量迁移验证

> English version: [2026-08-15-dsh-notemd-full-migration-validation.md](2026-08-15-dsh-notemd-full-migration-validation.md)

本文档记录十六阶段 standalone migration 的发布证据。判断标准不是“代码存在”，而是具名 contract、失败行为、packed distribution 和 DSH profile 边界都经过验证后，才可称为完成。

## 范围与所有权

- 源行为 oracle：`E:\convert\undo\obsidian-NoteMD_new`，commit `4168a51cd19ad8c3d1e05f604b50936255461a31`。
- 目标：独立运行的 `dsh-NotEMD` bundle，由 DSH 拥有 `llm`、`web`、`tools`、`subprocess` 与 Cordis lifecycle。
- 排除：Obsidian UI/editor/command host 行为、直接 Provider 凭据，以及未提交的 Drawnix WIP。
- Slidev runtime：`github:Jacobinwwey/slidev`，revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`；不接受静默替换为上游 Slidev。

## Contract 证据

`fixtures/migration/source-operation-matrix.json` 固定 29 个源 operation ID、18 个 included operation、11 个设计排除、四个精确 Drawnix WIP 排除和 14 个 SHA-256 fixture。`packages/notemd-workflows/test/migration-conformance.test.ts` 同时消费该 matrix 与 v2 `fixtures/migration/conformance-implementations.json`；每个 included operation 都必须经类型化 adapter 执行，local retrieval 等 auxiliary observation 则显式保留。

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

历史 Phase 12 发布运行的所有命令均已通过，共 48 个文件、185 个测试。最新 Phase 15/16 gate 严格执行 `test`、`test:coverage`、`build`、`pack:bundle`、`verify:bundle`、`accept:dsh`，随后执行 `git diff --check`；Vitest 通过 52 个文件、203 个测试，statement 77.68%、branch 73.00%、function 85.21%。`accept:dsh` 将 packed tarball 安装到隔离 DSH profile，验证 bundle patch 与依赖图，加载 clean runtime，执行 source/diagram/export/research Tool contract，然后删除临时 profile 状态。

## Phase 12 Adapter 证据

- Manifest v2 使用 `adapterId`、显式 `sourceOperationIds` 和可执行 `operationIds`，替换源码 `proofTerms`。
- 14 个 adapter 创建隔离临时 workspace，调用真实 workflow、knowledge、diagram 或 Slidev source planner；只返回类型化 contract observation，并在 `finally` 删除 workspace。
- Matrix 记录真实源行为：source-sibling chapter ownership、`_Extracted` original-text output、translation language folder、content-addressed diagram/Slidev lineage、source revision binding 和 operation-specific duplicate schema。
- focused gate 通过 1 个文件、2 个测试。adapter gate 不宣称 live DSH provider 质量或已安装的 optional native runtime；这些 capability lane 由 Phase 13 负责。

## Provider 限制

- `ctx.llm` 与 `ctx.web` 是消费型 service。DSH Provider 缺失或歧义时返回封闭的 unavailable/failure outcome；默认 bundle 不含 raw HTTP、DuckDuckGo、Tavily 或隐藏 OpenAI fallback。
- Draw.io、Tectonic、Playwright、NoteMD Drawnix adapter、Slidev fork CLI 和 FFmpeg 都是环境 capability。缺失时返回 unavailable。测试使用确定性的 subprocess fake 覆盖成功、字节上限、坏输出、取消、staging escape 与 cleanup。
- PPTX 是 Slidev 原生 OOXML，MP4 是 Slidev PNG 加 FFmpeg pipeline。SVG 只有在 target contract 明确允许时才是 preview derivative，绝不标记为 PPTX/MP4 parity。
- 当 staged asset 被 approval-bound plan 引用时，service dispose 后仍必须保留它。Cordis dispose 负责停止 timer 和 process tree；mutation cleanup 在 receipt lifecycle 结束后负责资产保留/删除。

## HMR 与替换检查

bundle patch 替换的是完整 config row，因此每次替换都必须按需重述 `workspaceRoot`、`approvalTtlMs`、`scanIntervalMs`、`concurrency`。DSH optional runtime 保持为 optional peer dependency，不隐藏在 package dependency 中。`ctx.effect()` 负责 polling timer、DSH stream consumer、knowledge subscription 与 process-boundary disposal；process disposal 在删除 staging run directory 前等待 active process tree join。

## 发布证据

- canonical remote：`git@github.com:Jacobinwwey/dsh-NotEMD.git`。
- Phase 15/16 发布提交 `f8de6de`（`feat: harden workspace ownership and lock source intake`）已以非强制方式推送到 `git@github.com:Jacobinwwey/dsh-NotEMD.git`；最终 fetch 确认 `origin/main...main = 0 0`，工作区 clean。

## Phase 13 Optional-runtime 证据

该 lane 与 portable bundle gate 分离。`scripts/optional-runtime-capability-lane.ts` 创建确定性的 PDF fixture，通过 Windows `Path` 解析 allowlisted executable，只运行绑定 staging 的 profile，记录 executable/content fingerprint，并最终确认 staging cleanup。`NOTEMD_CAPABILITY_LANE_REQUIRE_NATIVE=1` 是显式 strict-native opt-in；默认运行必须保留 truthful unavailable 结果。

Node `v22.19.0` / pnpm `10.7.1` 的实测 run 使用 fixture digest `0ddba517ff3630d3c1e84b54bb952a6d91a82d7550489e3805994e57a52d53d4`，cleanup 为 `true`。`pdftocairo` 产生 ready native SVG（`2f74b912f9ad7bc30512d1de59457e665400ca590acfa03a886aee50ac3c87cb`）与 PNG（`f2279ebd674c8dadc5f57e35ebeb0c7573ff953359b5703a42a33b292c9e4c70`）。Draw.io、Tectonic、稳定 Drawnix adapter 与 Slidev/Playwright/FFmpeg lane 缺失或未验证，保持 `unavailable`；取消探针返回 `process-cancelled`。

Slidev observation 只有在 manifest 匹配固定 fork `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c` 时才能 ready；本次有意报告 `slidev-fork-unverified`。存在实际文件时 hash executable bytes；path fallback 仅限 deterministic fake runtime。不接受 upstream Slidev、global installation，也不接受用 SVG 冒充 native PPTX/MP4 结果。

## Phase 14 Schema 证据

Artifact envelope 现在携带一个显式 family discriminator：`diagram-spec@2`、`diagram-lineage@2` 或 `document-export@3`。`packages/notemd-artifacts/src/schema-registry.ts` 是共享 registry；family module 仍负责 payload field，并拒绝不支持的 top-level key。`metadata` 是唯一前向兼容扩展点，且必须是 finite、JSON-safe object。

Registry suite 通过 8 tests。inspection API 对缺失/未知 family、缺失/未知 version、非法 family/version 组合和坏 metadata 返回结构化 diagnostic。生成的 diagram/document manifest 在 mutation planning 前强制断言预期 registry entry。`schemaFamily` 进入 canonical DiagramSpec identity 后，conformance fixture directory 从 `notemd-artifact-9a9e469f716c93be0bbe` 变为 `notemd-artifact-ff9a6d55ec0208286fed`；matrix 已同步，conformance adapter 通过 1 file/2 tests。

`verify-bundle` 解压 tarball，动态加载打包后的 artifacts registry，接受合法 v2/v3 fixture，并要求 `diagram-spec@3` 返回 `invalid-combination`。这样可以阻止 source registry 通过而分发包发生 drift。

## Phase 15 Workspace ownership 证据

当前 bundle 以 `WorkspaceOwnershipGuard` 作为 single-process 边界。它在 `.notemd/runtime/workspace-owner.json` 写入 allowlisted metadata；live second owner 返回 `workspace-process-already-owned`；只有记录 PID 已 dead 且 heartbeat 已 expired 才能恢复。release 要求 owner revision 匹配并返回 cleanup-health fact；`LocalVault.open()` 失败时，vault 初始化会先释放 guard。

聚焦关口通过 `workspace-ownership.test.ts`（5 tests）、既有 local-vault/mutation suite（26 tests）、`runtime-boundary.test.ts`、typecheck 与 lint。SQLite、distributed lease、无条件删除 stale lock 和多进程 planning serialization 仍被明确拒绝。上方 52 文件/203 测试的完整 release gate 也已通过。

## Phase 16 Source-intake 证据

`fixtures/migration/source-intake-lock.json` 固定候选 `obsidian-NoteMD_new@cdf580c6c876190ecc1040caea08e5ba5bee004f`，记录 parent 与 dirty checkout path，并从 `source-operation-matrix.json` 链接，但不改变已固定的 behavior contract commit。candidate 与 baseline 都有 29 个 operation ID；migration fixture 没有 hash 变化。唯一 registry schema delta 是移除 Drawnix-only 的 `drawnixKnowledgeMapDelivery` input field。

Lock 将 diagram-gallery、response-cache、render-target 与 Mermaid normalization 分开分类。Provider cache policy 因 DSH 拥有 provider/model routing 被拒绝；host gallery/preview/save 行为排除；target descriptor 延后到具名 bundle adapter；Mermaid normalization 是需要独立 deterministic conformance fixture 的后续候选。Quarantine 明确列出 candidate 的 committed Drawnix path、四个 baseline exclusion、candidate-only Drawnix fixture 和五个 dirty path。没有从 dirty checkout 复制任何 source implementation。

聚焦 intake gate 已通过 `migration-source-intake.test.ts` 与 `migration-conformance.test.ts`。上方完整 release gate 已重新执行全量 suite、coverage、build、packed-bundle verification、clean DSH acceptance 与 `git diff --check`，全部通过。
