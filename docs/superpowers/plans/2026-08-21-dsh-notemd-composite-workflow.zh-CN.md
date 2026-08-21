# Cordis Composite Workflow 实施计划

> English version: 2026-08-21-dsh-notemd-composite-workflow.md

本计划要求 inline execution，不派发 subagent。每个任务都必须有独立 gate；当前实现已完成 Task 1-7，Task 8 的文档同步与最终发布 gate 在本轮收尾。

**目标：** 为独立运行的 dsh-NotEMD bundle 实现 source-faithful、approval-safe 的 `one-click-extract@1`，不迁移 Obsidian 宿主层，不增加第二 mutation/job authority。

**架构：** 新增纯 `@notemd-harness/composites`，在 virtual workspace overlay 上编排三步，将净变化聚合为一个现有 `WorkspaceMutationPlan/v1`；增加薄 Cordis service、具名 plan/job Tool 与显式 durable executor entry；复用现有 vault、approval ledger、journaled executor、FileJobStore 和 DSH 的 `ctx.llm`/`ctx.web` seam。

**锁定：** source observation `ref/obsidian-NotEMD@07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5`；historical oracle `obsidian-NoteMD_new@4168a51cd19ad8c3d1e05f604b50936255461a31`；Slidev fork `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`；Drawnix WIP 不纳入。

**不变约束：** `WorkspaceMutationPlan.version` 保持 1；无 lineage 的旧 digest 不变；composite v1 只读 text/Markdown，固定 `fail-fast`；不提供 generic `notemd_run` 或 public `continueOnError`；DSH 继续拥有 Provider、凭据、endpoint、LLM/Web transport。

## Task 1：锁定源语义与 fixture（已完成）

- [x] 新增 `fixtures/migration/composite-source-lock.json` 与 `fixtures/migration/one-click-extract/`。
- [x] 固定源链 `process-current-add-links -> batch-generate-from-titles -> batch-mermaid-fix`、输出路径、collision 与 unresolved Mermaid case，并保留 SHA-256。
- [x] 新增 `packages/notemd-workflows/test/composite-source-contracts.test.ts`；既有 29-operation matrix 未改变。
- [x] Gate：source contract 与 composite fixture tests 通过。

## Task 2：增加可选 mutation lineage（已完成）

- [x] 新增 `packages/notemd-mutation/src/composite-lineage.ts`，校验 workflow/version/digest/step/ordinal。
- [x] 扩展 `mutation-plan.ts`、`index.ts` 与 `composite-lineage.test.ts`；lineage 仅在存在时进入 canonical provenance。
- [x] Gate：mutation focused tests、package typecheck/build 通过，legacy digest 保持不变。

## Task 3：实现 virtual workspace overlay 与 accumulator（已完成）

- [x] 新增 `packages/notemd-composites`：`CompositeWorkspaceView`、`MutationAccumulator`、closed diagnostics、package metadata 与 tests。
- [x] 支持 lazy base read、virtual read/list、virtual revision conflict、Markdown-only boundary、file/UTF-8 byte/completion-input budgets。
- [x] 支持同 destination collision、净变更聚合、virtual create 后 delete 的 net no-op；物理 workspace 在 planning 期间不写入。
- [x] Gate：overlay/accumulator focused tests、package typecheck/build 通过。

## Task 4：实现 source-faithful batch planner 与 definition（已完成）

- [x] 在 `packages/notemd-workflows/src/index.ts` 增加 title batch 与 Mermaid batch planner；不改变旧的原地 folder planner。
- [x] title batch 生成到显式 complete folder 并删除源副本；Mermaid batch 支持 repair、unresolved move、report 和 duplicate basename collision fail-closed。
- [x] 新增 `packages/notemd-composites/src/one-click-extract.ts` 与 `index.ts`；definition digest 固定为 `66f0e111d94d98cec3bab1b00f7c8f72ab096c0a0a69d94061e2ac88c6e7ac4c`。
- [x] Gate：source-faithful、definition、overlay integration tests 通过。

## Task 5：Cordis 集成（已完成）

- [x] 新增 `NotemdCompositeWorkflowService`，静态注入严格为 `['notemdVault', 'notemdWorkflows']`。
- [x] `NotemdWorkflowsService.createScopedPlanner` 接受可选 `beforeCompletion` guard；composite overlay 在每个 LLM request 前执行 completion-input budget。
- [x] 更新 `packages/notemd-bundle/src/index.ts`、`cordis.patch.yml`、package exports/dependencies 与 boundary tests。
- [x] Gate：bundle boundary tests、typecheck/build 通过；无第二 vault/transformer/executor。

## Task 6：具名 Tool 与 durable job（已完成）

- [x] 仅注册 `notemd_plan_one_click_extract` 与 `notemd_job_start_one_click_extract`；resume/status/cancel 不变。
- [x] Tool edge 做 closed schema/path validation；job input 不保存 prompt、credential、endpoint 或 raw Web body。
- [x] 由于现有 `FileJobStore` 只接受 lowercase kebab workflow 名称，durable key 固定为 `one-click-extract-v1`；record 另外保存 `workflowId`、`workflowVersion`、`definitionDigest`，definition drift fail closed。
- [x] Gate：Tool/job contract、durable runner tests 与 package checks 通过。

## Task 7：aggregate approval、cancel 与 clean profile（已完成）

- [x] 一个 aggregate plan 对应一份 approval receipt 和一份 committed mutation receipt；重复 receipt 被拒绝。
- [x] stale virtual revision、cancel、missing document、collision、binary dependency、budget overflow 均返回 closed outcome，不发布 partial workspace event。
- [x] `scripts/accept-dsh-profile.ts` 从 packed tarball 加载 composite service，并验证未配置 DSH web capability 的 truthful unavailable outcome。
- [x] Gate：approval/lifecycle focused tests 与 clean DSH profile acceptance 通过。

## Task 8：双语证据与最终发布（进行中）

- [x] 已同步 English/Chinese architecture、plan、progress、audit；修复历史中文 architecture/plan 文件的 mojibake，保留 source/target locks、拒绝方案、兼容性决策与 exit criteria。
- [x] 已记录 robustness：duplicate Mermaid error destinations、virtual create/delete no-op、completion guard injection。
- [x] 执行新鲜完整 gate：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm test:coverage`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle`、`pnpm accept:dsh`、`git diff --check`。
- [ ] 检查 staged diff，只提交 scoped code/fixtures/scripts/docs；随后非强制 push `origin/main`。
- [ ] `git fetch origin main` 后确认 local `main`、`origin/main` SHA 一致，`git status --short --branch` 只显示 clean `## main`。

## 出口条件

只有以下事实全部有新鲜命令证据，才可声明本阶段完成：source lock 与 fixture 固定；source-faithful title/Mermaid planner 通过；overlay 的 read/list、revision、budget、collision、net no-op 通过；`one-click-extract@1` digest 与 fail-fast 固定；一个 aggregate approval 与 committed receipt；具名 Tool/job 的 closed schema 与 durable resume；clean DSH profile acceptance；完整 typecheck/lint/test/coverage/build/pack/verify gate；main 非强制推送且工作区 clean。
