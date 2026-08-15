# DSH NoteMD 全量迁移进度

> English version: [2026-08-15-dsh-notemd-migration-progress.md](2026-08-15-dsh-notemd-migration-progress.md)

**状态：** standalone bundle 与 next-level runtime 基础已实现。全量迁移架构与可执行计划已在 `main` 的 `626f6e1` 发布；Task 1-5 已完成，下一项为 Task 6。

## 1. 范围基线

- 源基线：`E:\convert\undo\obsidian-NoteMD_new`，提交 `4168a51cd19ad8c3d1e05f604b50936255461a31`。
- 目标基线：`E:\convert\undo\notemd-deepseek-harness`，`main` 上的提交 `6672f54def2b05e1628786ace97ab73649edab74`。
- 范围内：全部非 Obsidian 宿主的 NoteMD 工作流，包括文档、知识库、研究、图表、工件导出、批处理和稳定 Drawnix 能力。
- 明确排除：Obsidian UI 与宿主 API、直连 Provider 配置，以及源工作树中尚未提交的 Drawnix WIP。

## 2. 已核验基础

- 目标已具备唯一的、审批门控且修订感知的 `WorkspaceMutationPlan` 路径，持久化的只规划作业、receipt 派生的工作区变更对账，以及增量 MiniSearch 索引。
- 当前运行时已使用 Cordis `Service`、显式 `inject` 依赖，并通过 `ctx.effect()` 管理轮询扫描器和知识订阅清理。
- 本文档更新前目标工作树处于 clean 状态。
- Task 1 已在 `fixtures/migration/source-operation-matrix.json` 冻结源边界：29 个 operation ID、18 个 included 行、11 个 design exclusion、四个精确的 Drawnix-WIP exclusion，以及 14 个 SHA-256 固定的确定性 fixture。
- Task 2 已增加 `@notemd-harness/mutation`，这是面向 text write、staged binary write、delete 和 metadata-only receipt 的不可变、内容寻址 proposal vocabulary。本阶段只建立 contract，不会修改工作区。
- Task 3 已增加唯一可恢复的多目标 executor：content-free journal、plan-local staged payload、SHA-256 核验、可逆 delete、canonical lock、重试保护和 terminal staging cleanup tracking。
- Task 4 已移除 legacy public text-write authority。approval 绑定 plan 与 staged-asset digest；Tool 只在一次性 receipt 被消费后调用 executor；job 只保留 plan identity；workspace event 只源于已核验的 committed receipt。
- Task 5 已将 `ctx.llm` 设为默认 LLM seam。`@notemd-harness/llm-dsh` 通过封闭 route policy 消费 DSH stream，旧 OpenAI-compatible transport 只作为显式 legacy entry 保留。

## 3. 已完成的代码审计

源 registry 暴露 29 个 operation。宿主/Provider/profile surface 按已批准边界排除，余下的文档、知识、图表和导出行为均在范围内。源工作树在 Drawnix 区域故意保持 dirty。迁移基线不含未提交的 cross-root router、mind-map projection、relation-lane layout、其关联改动和未跟踪 fixture。

| 当前目标区域 | 已确认现状 | 架构影响 |
| --- | --- | --- |
| `packages/notemd-vault/src/revision.ts` | 只暴露不可变的读取 revision；公共 `WritePlan` contract 已移除。 | 读取事实不再蕴含 mutation authority。 |
| `packages/notemd-vault-local/src/local-vault.ts` | 以共享锁 journaled mutation application/recovery 作为唯一 local write path。 | approval、job、event 和 Tool 已收敛到一个可恢复 mutation authority。 |
| `packages/notemd-llm-dsh/src/dsh-text-transformer.ts` 与 `cordis.patch.yml` | 默认 bridge 注入 `ctx.llm`、消费 DSH `StreamChunk`，只接受 provider/model/output/prompt route policy。 | DSH 拥有凭据与 transport；只有显式 legacy subpath 保留 OpenAI-compatible diagnostic/discovery。 |
| `packages/notemd-workflows/src/index.ts` | research synthesis 接受调用方提供的文本。 | 未实现 `ctx.web` evidence consumer 前没有 native research。 |
| `packages/notemd-knowledge/src/knowledge-index.ts` | 按整文件 MiniSearch 索引。 | 缺少源任务路径、section window、当前文件排除和检索解释。 |
| `packages/notemd-artifacts/src/artifact-manifest.ts` | 仅 source JSON/README，`renderer: source`，render/export 始终 unavailable。 | artifact lineage 与具名 renderer/export provider 是核心缺口。 |
| `packages/notemd-tools/src/tool-contract.ts` | 每个具名 Tool 使用封闭 DSH author schema 和显式 outcome variant。 | DSH runtime 可以验证每个输出，不再依赖 catch-all object schema。 |
| `packages/notemd-jobs` 与 `packages/notemd-workspace-events` | durable planning checkpoint 只保留 proposal identity/evidence；metadata-only change 由已核验 receipt 派生。 | planning 保持非权威，indexing 只观察 committed mutation。 |

## 4. 与先前方案的对账

先前方案并未被推翻。它们建立了正确的独立运行、生命周期、审批和打包基础，但尚未建立对源插件的行为契约对齐；其中两项早期默认决策需要有意地被新的架构边界取代。

| 先前要求 | 当前证据 | 全量迁移处置 |
| --- | --- | --- |
| 独立 DSH bundle，显式工作区根目录、Cordis service、profile patch 与 clean-profile 验收。 | `notemd-bundle`、profile patch 和 `pnpm accept:dsh` 已存在且通过。 | 已交付并保留。新增包必须维持显式 inject、Fiber-owned effect、完整 patch config 和 packed-bundle 验收。 |
| 修订绑定、审批门控的文本 `WritePlan` 是唯一工作区变更路径。 | `notemd-vault` 只读，`LocalVault` 只通过 journaled executor 应用 canonical `WorkspaceMutationPlan`。 | 已以一个 mutation protocol 交付；长期并存 `WritePlan` 会形成两个可变更 authority。 |
| 持久化的只规划作业、仅元数据的工作区事件和可重建的增量知识索引。 | `notemd-jobs`、`notemd-workspace-events` 和 `notemd-knowledge` 保留 proposal-only checkpoint、committed-receipt causation、scan 和 fresh-read index update。 | 已交付，且没有把 workspace event 演化为 event-sourcing log。 |
| 通用 OpenAI-compatible adapter 默认拥有 endpoint/key 配置、诊断和模型发现。 | 默认 patch 只配置 `provider`、`model`、`maxTokens` 与 `promptPolicyId`；`DshTextTransformer` 拒绝未知 route field，并消费 `ctx.llm.stream()`。 | 默认设计已被取代；旧 transport 和 diagnostic 仅保留在 opt-in legacy entry。 |
| portable core 只需 source artifact 和真实的 unavailable render/export 状态。 | `SourceArtifactPlanner` 持久化 JSON/README 并永久返回 `unavailable`。 | 诚实但不完整。演化为版本化 source/preview/export lineage，并加入具名 capability-gated provider；不得将 SVG 称作非 SVG 目标的等价替代物。 |
| baseline workflow planner 已覆盖可移植笔记语义。 | 已有链接、标题、翻译、概念、公式、Mermaid 和由字符串提供输入的研究摘要。 | 仅部分完成。源行为仍缺章节拆分、原文抽取、文件夹策略、协调、任务范围检索、DSH-native 研究证据以及全部真实渲染/导出 provider。 |

架构修正刻意保持窄范围：保留已经可靠的机制，只替换会错误表达所有权或无法承载 artifact/mutation 需求的契约。

## 5. 全量迁移阶段账本

下表记录代码现状，而不是计划完成度。既有 release gate 通过只证明 bundle 可安装，并不证明某个能力族已经迁移。

| 任务 | 当前状态 | 离开该状态的关口 |
| --- | --- | --- |
| 1. 源行为契约 | 已完成。矩阵在 `4168a51cd19ad8c3d1e05f604b50936255461a31` 固定全部 29 个源 registry ID；18 个 included 行均引用 14 个确定性 fixture 中的一个或多个。 | 源契约不能静默扩大 Drawnix WIP exclusion 集合，也不能丢失本地检索、图表或 slide fixture 覆盖。 |
| 2. 类型化 mutation proposal | 已完成。`@notemd-harness/mutation` 以 canonical destination 顺序、content digest、opaque staged-asset metadata 和 closed receipt 冻结 text/bytes/delete plan。 | 已通过 Task 4 的唯一 mutation authority 交付。 |
| 3. 本地 journaled executor | 已完成。`LocalMutationExecutor` 持久化 content-free metadata、stage plan payload、锁定 canonical target、核验 hash、安全回滚、单独完成 staging cleanup，并与 `LocalVault` 共享锁。 | 已通过 receipt-bound approval、job、event 与 Tool 交付。 |
| 4. 审批、事件、作业与 Tool receipt | 已完成。`WritePlan` export 和 caller 已移除；approval 绑定 proposal/asset digest；checkpoint 保存 proposal identity/evidence；只有匹配的 committed receipt 发布 event；每个 Tool 都有封闭 DSH outcome schema。 | Task 5 可在没有第二写入 authority 的前提下替换默认模型边界。 |
| 5. DSH LLM consumer bridge | 已完成。`@notemd-harness/llm-dsh` 注入 DSH `llm`，从 `StreamChunk` 生成 provider-neutral completion，拒绝封闭 policy 之外的字段，并随 Cordis owner disposal 终止 active call。 | 已交付。默认 patch 不含 endpoint/key/transport 配置，也不注册 legacy provider Tool。 |
| 6. DSH web research evidence | 未开始。研究摘要消费调用方字符串，且没有 durable evidence 包。 | 具名 discovery/synthesis 使用 `ctx.web`，保留类型化 evidence/citation，并在无 provider 时返回 capability-unavailable 而非自建 fallback。 |
| 7. 文档语义与知识检索 | 未开始。没有 documents 包，索引仍是整文件 MiniSearch。 | AST section、稳定锚点、章节/原文/协调 proposal、文件夹策略、scope window 和可解释命中通过特征化 fixture。 |
| 8. Artifact lineage 与 SVG renderer | 未开始。artifact 仅有 source JSON/README，尚无 renderer 包。 | 版本化 spec 与 source/preview/export lineage 仅通过独立具名 provider 为适用目标支持 sanitized SVG。 |
| 9. Draw.io、稳定 Drawnix 与 Circuitikz provider | 未开始。没有 staging-only process boundary 或专用 renderer 包。 | allowlisted process 测试和 provider-specific canonical source 通过，且只使用固定来源中已提交的 Drawnix 基线。 |
| 10. Slidev 与媒体导出 | 未开始。没有 Slidev/PPTX/media provider 或 staged export contract。 | prepared slide source 与每个具名 exporter 证明 capability、cleanup、字节上限和可复现性。 |
| 11. Conformance、HMR 与发布 | 仅具备前置条件。既有 bundle release gate 已通过，但没有 source-matrix conformance suite 或全量迁移 HMR 覆盖。 | 全部 included matrix 行通过，依赖/HMR/进程清理测试通过，且 clean DSH profile 能安装最终 packed bundle。 |

## 6. 已记录方向

- [权威架构](../specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md) 定义了符合 DSH/Koishi/Cordis 的 service graph，并修正旧文档中默认 Provider 与 source-only artifact 的结论。
- [可执行实施计划](../superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md) 将迁移拆为 11 个可独立测试的任务。
- Task 1 的特征化 fixture 阻止后续实现静默丢失章节 manifest cleanup、原文抽取、任务级检索或按目标导出等源语义。

## 7. 后续推进方向

1. 随后完成 Task 6。research discovery/synthesis 必须消费 durable `ctx.web` evidence，不能使用未跟踪的 caller-supplied passage 或 transport fallback。
2. 在扩展 renderer 宽度前完成 Task 7。文档结构和检索证据是图表、引用和 artifact provenance 的上游输入。
3. Task 8-10 必须按目标类别实现，不能使用 target selector。先实现 SVG-capable renderer；随后仅在具备显式 capability test 时加入 process-gated Draw.io/Drawnix/Circuitikz 和 Slidev/media exporter。
4. 将 Task 11 留给证明，而不是乐观判断：在实现任务全部完成后运行 source-matrix conformance、生命周期/HMR 失败路径、隔离 bundle 验收和完整 release gate。

## 8. 约束

- 不将源仓库的 Drawnix WIP 作为迁移基线。
- 使用 `ctx.llm` 与 `ctx.web` 替代 NoteMD 自有 Provider 与联网传输配置。
- 渲染和导出能力如实报告可用性；SVG 仅对支持 SVG 的目标充当预览派生产物。
- 工作区变更必须显式、审批门控、绑定修订，并支持恢复。

## 9. 验证与发布

第一段验证已在 Node `v22.19.0` 上针对本次文档变更执行：

- 两份 README 和六份新增文档的相对链接校验没有发现缺失目标。
- `git diff --check` 完成，没有空白错误。
- `pnpm typecheck` 与 `pnpm lint` 成功完成。
- `pnpm test` 成功完成：16 个测试文件、50 个测试通过。

第二段验证也已成功完成：

- `pnpm test:coverage` 通过，仍为 16 个文件、50 个测试。当前仓库基线 statement coverage 为 66.6%；bundle service 覆盖率偏低是实施阶段的显式风险，不是文档缺陷。
- `pnpm build` 成功完成全部 workspace package 的构建。
- `pnpm pack:bundle` 创建 standalone tarball，`pnpm verify:bundle` 已验证该包。
- `pnpm accept:dsh` 将 packed tarball 安装到隔离的 DeepSeek Harness profile，并通过 clean-profile 验收。

### 发布段

- 发布前，本地 `HEAD`、`FETCH_HEAD` 与 `origin/main` 均解析为 `6672f54def2b05e1628786ace97ab73649edab74`；相对已抓取远程的分歧计数为 `0 0`。
- `626f6e1ac46ac5cb733e1d6c177b47cc987e0f77`（`docs: define full NotEMD migration roadmap`）在 release gate 和 clean staged-diff check 后创建于 `main`。
- 该提交已非强制推送至 `git@github.com:Jacobinwwey/dsh-NotEMD.git`，远程快进为 `6672f54..626f6e1`；写入本发布日志前，`git status --short --branch` 只显示 `## main`。

本次发布只记录架构、计划、审计和基线验证。它不会推进任何能力任务；任务进度必须以对应的源 fixture 与退出证据为准。

### Task 1 验证

- 源基线：`4168a51cd19ad8c3d1e05f604b50936255461a31`，machine-readable matrix 表示其 29 个 registry ID。
- 分类：18 个 `included` operation、11 个 `excluded-by-design` operation，以及精确四个 `excluded-wip` Drawnix 路径。14 个 fixture input 均已固定 SHA-256，其中显式包含 local-retrieval、diagram-source 和 slide-source。
- `pnpm exec vitest run --config vitest.config.ts packages/notemd-workflows/test/source-contracts.test.ts packages/notemd-artifacts/test/source-artifact-contracts.test.ts`：2 个文件、4 个测试通过。
- `pnpm test`：18 个文件、54 个测试通过。`pnpm typecheck` 成功完成；staging 前 `git diff --check` 无空白错误。

### Task 2 验证

- `@notemd-harness/mutation` 包含新的 proposal vocabulary：versioned content-addressed plan、`write-text`、`write-bytes`、`delete` 变体、opaque staged asset reference 和 metadata-only receipt。
- 契约测试已观察到初始 missing-export red state、empty-text-content 与 malformed-JSON-boundary red state，并在临时移除验证时观察到 closed-receipt-vocabulary red state；恢复验证后，`pnpm exec vitest run --config vitest.config.ts packages/notemd-mutation/test/mutation-plan.test.ts` 报告 1 个文件、11 个测试通过。
- `pnpm --filter @notemd-harness/mutation test`、`pnpm typecheck` 与 `pnpm lint` 已成功完成。boundary-input correction 后，`pnpm test` 报告 19 个文件、65 个测试通过；staging 前 `git diff --check` 未发现空白错误。

### Task 3 验证

- `@notemd-harness/vault-local` 现提供 journaled executor：不可变 proposal input、staged binary asset 核验、canonical multi-target lock、same-volume replacement、quarantine delete、digest-checked recovery、retry rejection 与 metadata-only receipt。journal record 从不保存 prompt、text payload 或 binary bytes。
- 聚焦 executor suite 覆盖 19 个测试：全部持久化崩溃状态、陈旧和并发 plan、symlink escape、staged-asset substitution、rollback integrity、外部改写、取消、幂等、idle construction 与 committed-state finalization cleanup。`LocalVault` 额外覆盖 shared-lock mutation bridge。
- `pnpm install --lockfile-only` 更新 workspace link，随后 `pnpm install --frozen-lockfile` 完成。`pnpm --filter @notemd-harness/vault-local test` 与 `pnpm test` 均报告 20 个测试文件、85 个测试通过；在 Node `v22.19.0` / pnpm `10.7.1` 上，`pnpm typecheck`、`pnpm lint` 与 `git diff --check` 也已通过。

### Task 4 验证

- legacy `WritePlan` public contract 和 Tool bridge 已移除。`notemd_request_plan_approval` 解析并 canonicalize mutation proposal，只在 DSH approval 后签发 asset-bound one-time receipt；`notemd_apply_approved_plan` 在调用 journaled executor 前消费该 receipt。
- receipt outcome 保持真实：只有匹配的 `committed` receipt 能发布 `notemd-mutation-receipt` event。conflict、rejected、cancelled、failed、recovered、mismatched 和 event-recording failure path 都返回显式 closed outcome，且不发布可索引 change。
- schema adapter 现在输出 DSH author DSL，而非预编译 JSON Schema；嵌套必填字段使用 `required: true`。contract suite 覆盖 approval decision、invalid consumption、stale plan、staged-asset substitution、rejected delete 与 closed-schema registration。
- 全部 legacy behavior test、runtime approval test、durable-job checkpoint test 和 clean-profile runner 都改为断言 `mutations`、proposal checkpoint identity 和 receipt state，而不是 `writes` 或 legacy per-file status。
- 声明新 mutation dependency 后，离线 `pnpm install --offline` 修复了 workspace link。bundle verifier 现在要求 `@notemd-harness/mutation`；其 package manifest 只分发 compiled JS/declaration，build cache/source map 不会进入 tarball。
- Node `v22.19.0` / pnpm `10.7.1` 上的最新证据：`pnpm typecheck`、`pnpm test`（21 文件、97 测试）、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 和 `pnpm accept:dsh` 均已成功完成。

### Task 5 验证

- `@notemd-harness/llm-dsh` 将 DSH `StreamChunk` 转为 NoteMD text completion。它校验封闭 route policy，只保留中立 failure class，拒绝 malformed/post-terminal stream，传播 cancellation，并在 Cordis owner disposal 时终止 active call。
- 默认 `notemd-llm` service 声明静态 `llm` injection，只配置 `provider`、`model`、`maxTokens` 与 `promptPolicyId`。endpoint、API key、header、retry 与 discovery field 不能进入默认 route policy。OpenAI-compatible service 只由 `./llm-openai-compatible-legacy` 暴露；默认 Tool registration 不含其 diagnostic。
- Node `v22.19.0` / pnpm `10.7.1` 上的新鲜证据：`pnpm typecheck`、`pnpm test`（22 文件、109 测试）、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 和 `pnpm accept:dsh` 均成功完成。acceptance runner 将 packed bundle 安装到 clean DSH profile，加载 `LlmRuntime`，并断言默认 bridge 不存在 legacy provider Tool。
