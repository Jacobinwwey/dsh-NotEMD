# DSH NoteMD 全量迁移进度

> English version: [2026-08-15-dsh-notemd-migration-progress.md](2026-08-15-dsh-notemd-migration-progress.md)

**状态：** standalone migration 的 Phase 12-16 已实现，Phase 15/16 完整 release gate 已通过，发布提交 `f8de6de` 已与 `origin/main` 同步。Conformance 边界现执行类型化 fixture adapter，不再搜索测试源码文本。Slidev export 仍固定使用 `Jacobinwwey/slidev` fork，绝不静默使用上游 Slidev。

## 1. 范围基线

- 源基线：`E:\convert\undo\obsidian-NoteMD_new`，提交 `4168a51cd19ad8c3d1e05f604b50936255461a31`。
- 目标发布：`E:\convert\undo\notemd-deepseek-harness` 的 `main`，提交 `f8de6de`（`origin/main` 已同步）；下方记录 Phase 15/16 release gate。
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
- Task 6 已增加 `@notemd-harness/research`：以 `ctx.web` 为唯一后端的 durable `.notemd/research` catalog，具名的 closed Tool discovery/capture/synthesis，以及只接受 evidence id 的 durable job input。
- Task 7 已增加 `@notemd-harness/documents` 作为 structural Markdown section、stable anchor、chapter ownership manifest、original-text output policy 和 duplicate diagnostic 的唯一 owner。`notemd-knowledge` 现在在 task-root/current-file 约束下检索带 citation 的 section context；workflow 和 Tool surface 暴露相应具名操作但不拥有 write authority。
- Task 8 已将 source-only artifact contract 替换为 `DiagramSpec` v2 与 source/preview/export lineage manifest。五个具名 renderer package 生成 canonical Mermaid、Vega-Lite、JSON Canvas、HTML 或 editable-SVG source 及清洗后的 SVG 派生产物；JSON Canvas SVG 被明确标记为 projection，不能替代 `.canvas`。每个 target 均有独立的 planning/status Tool，而 materialization 仍走既有 approval-gated mutation path。
- Task 9 已增加 `@notemd-harness/process`，作为唯一 staging-only 外部进程边界。Draw.io、稳定 Drawnix 与 Circuitikz provider 生成确定性的 canonical source、明确标注的 SVG projection、真实的 native capability outcome，并在 Circuitikz 场景生成 digest-verified staged PDF。native export 不会直接写最终工作区；process boundary 负责 executable allowlist、固定 argv、有界 I/O、timeout/cancellation 分类、进程树 join、HMR dispose 与 staging cleanup。
- Task 10 已增加 `@notemd-harness/export-slidev`、`@notemd-harness/export-pptx` 与 `@notemd-harness/export-media`。prepared Slidev Markdown 和 layout report 是 canonical source；HTML、PDF、PNG、PPTX、MP4 各自有具名 provider。process boundary 固定 `github:Jacobinwwey/slidev` revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`，所有输出都经过 staging 与 digest 校验，支持 fork 的 `index-standalone.html`，且绝不把 SVG 当作 PPTX/MP4 parity。
- Task 12 已用类型化、可执行 fixture adapter 替换间接 conformance proof term。每个 adapter 创建临时 workspace，调用真实 workflow、knowledge、artifact 或 Slidev source planner，只归一化 contract 级观察值，并在 `finally` 清理；v2 manifest 分离 source operation 映射与 auxiliary executable observation。

## 3. 已完成的代码审计

源 registry 暴露 29 个 operation。宿主/Provider/profile surface 按已批准边界排除，余下的文档、知识、图表和导出行为均在范围内。源工作树在 Drawnix 区域故意保持 dirty。迁移基线不含未提交的 cross-root router、mind-map projection、relation-lane layout、其关联改动和未跟踪 fixture。

| 当前目标区域 | 已确认现状 | 架构影响 |
| --- | --- | --- |
| `packages/notemd-vault/src/revision.ts` | 只暴露不可变的读取 revision；公共 `WritePlan` contract 已移除。 | 读取事实不再蕴含 mutation authority。 |
| `packages/notemd-vault-local/src/local-vault.ts` | 以共享锁 journaled mutation application/recovery 作为唯一 local write path。 | approval、job、event 和 Tool 已收敛到一个可恢复 mutation authority。 |
| `packages/notemd-llm-dsh/src/dsh-text-transformer.ts` 与 `cordis.patch.yml` | 默认 bridge 注入 `ctx.llm`、消费 DSH `StreamChunk`，只接受 provider/model/output/prompt route policy。 | DSH 拥有凭据与 transport；只有显式 legacy subpath 保留 OpenAI-compatible diagnostic/discovery。 |
| `packages/notemd-research/src/` 与 `packages/notemd-bundle/src/research.ts` | catalog 持久化 content-addressed DSH Web discovery/evidence，Cordis service 显式注入 `web`。 | provider selection 仍由 DSH 持有；bundle 和 workflow 均不拥有 network transport。 |
| `packages/notemd-workflows/src/index.ts` 与 `packages/notemd-bundle/src/jobs.ts` | research synthesis 接受 `ResearchEvidence`；Tool 与 durable job 仅保存 evidence id，并通过 `notemdResearch` 解析。 | raw caller passage 不能绕过 evidence provenance，也不能进入 durable job record。 |
| `packages/notemd-documents/src/` 与 `packages/notemd-knowledge/src/knowledge-index.ts` | structural Markdown section 为 chapter plan、link/concept prompt 和可重建的 section-level MiniSearch index 提供输入。 | retrieval 携带 task-root selection、current-file exclusion、context window、explanation 和 `citation:<path>#<anchor>` metadata。 |
| `packages/notemd-artifacts/src/artifact-manifest.ts` 与 `packages/notemd-render-*/` | `ArtifactPlanner` 固化 v2 source/preview/export lineage、content 与 renderer/theme/font fingerprint，并在生成 mutation plan 前清洗 SVG；每个 canonical SVG-capable target 绑定一个 renderer。 | SVG 仅是 Mermaid、Vega-Lite、JSON Canvas、HTML、editable SVG 的真实派生产物；不能替代后续的 Draw.io、Drawnix、Circuitikz、PPTX 或 media source。 |
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
| 6. DSH web research evidence | 已完成。`@notemd-harness/research` 持久化有界 DSH Web discovery/evidence；具名 Tool 仅返回 evidence metadata，research synthesis 只接受 durable id。`notemdResearch` 已注入 Tools 和 jobs，bundle 将 `dsh-web` 声明为 optional peer。 | 已交付。无 provider 时返回封闭 `capability-unavailable` outcome；非 2xx resource 仍作为 evidence，而非 transport failure。 |
| 7. 文档语义与知识检索 | 已完成。`@notemd-harness/documents` 拥有 structural section、chapter manifest、original-text policy 和 duplicate diagnostic；workflow 与 Tool 暴露具名 single-file/folder operation；knowledge 索引 section 并返回 citation 和 explanation。 | 已交付。本阶段已通过 focused/full integration gate，包括 packed-bundle 与 clean-profile acceptance。 |
| 8. Artifact lineage 与 SVG renderer | 已完成。`DiagramSpec` v2 携带 source revision、provenance、evidence、structured input 与 renderer intent。五个已打包的具名 renderer 生成 canonical source 与清洗后的 SVG preview/export 派生产物；Tool schema 绑定 source 且按 target 分离。 | 已交付。packed bundle 仅包含编译后的 renderer dependency，clean-profile acceptance 会执行 Mermaid planning Tool。 |
| 9. Draw.io、稳定 Drawnix 与 Circuitikz provider | 已完成。`@notemd-harness/process` 强制固定 command profile 与 staging containment；三个具名 provider 和六个 planning/status Tool 已打包。Drawnix WIP 路径仍被排除；缺失可选 `notemd-drawnix-render` adapter 时如实返回 unavailable。 | 已通过 Windows process/provider 测试、全量 suite、packed-bundle 校验与 clean DSH profile acceptance。 |
| 10. Slidev 与媒体导出 | 已完成。三个 package 提供 canonical source preparation，以及在同一 staging/process boundary 上的 HTML/PDF/PNG/PPTX/MP4 具名 provider。 | Task 10 focused/full gate 通过；真实 optional executable 缺失时如实返回 unavailable。 |
| 11. Conformance、HMR 与发布 | 已完成。matrix conformance、lifecycle contract、完整 release gate、clean DSH profile 与非强制 mainline 同步全部通过。 | 后续能力变更必须继续保持 fork lock、optional capability boundary 与发布证据一致。 |
| 12. 可执行 conformance adapter | 已完成。14 个类型化 adapter 执行 19 个 observation（18 个 included source operation 加 auxiliary local retrieval），duplicate 使用 operation-specific contract，artifact 使用确定性 lineage path。 | 任一 adapter 缺失、included operation 未映射、fixture digest 漂移或 contract mismatch，都必须在发布前的 focused conformance gate 失败。 |
| 13. Optional-runtime capability lane | 已完成。记录 executable fingerprint、native output digest、取消与 staging cleanup；缺失 binary 时保持 truthful `unavailable`。 | native strictness 仍为 opt-in；portable core 不依赖可选 binary。 |
| 14. Artifact schema registry | 已完成。`diagram-spec@2`、`diagram-lineage@2` 与 `document-export@3` 由打包 registry 强制校验。 | schema family/version 变化必须同步 matrix artifact path 与 verifier。 |
| 15. Workspace operation 加固 | 已完成当前 single-process contract。`WorkspaceOwnershipGuard` 负责 live-owner 拒绝、dead-stale 恢复、heartbeat、recovery counter 与 cleanup-health fact。 | 未引入 durable lease；多进程调度语义仍未声明。 |
| 16. Source intake 与 Drawnix review | 已完成 audit-only intake。候选 `cdf580c6...` 已锁定，registry/fixture 无漂移；Mermaid 仅列为后续候选，Drawnix 已命名隔离。 | 新 source behavior 必须先有独立 deterministic contract/fixture；dirty Drawnix 路径不得进入实现。 |

## 6. 已记录方向

- [权威架构](../specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md) 定义了符合 DSH/Koishi/Cordis 的 service graph，并修正旧文档中默认 Provider 与 source-only artifact 的结论。
- [可执行实施计划](../superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md) 将迁移拆为 12 个可独立测试的任务。
- Task 1 的特征化 fixture 阻止后续实现静默丢失章节 manifest cleanup、原文抽取、任务级检索或按目标导出等源语义。

## 7. 后续推进方向

1. 保持 fork lock：`github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`；更新它是兼容性决策，不是普通依赖刷新。
2. HMR 时必须保留待审批/materialization 的 staged asset；dispose 只停止进程和 timer，不能提前删除审批输入。
3. 后续能力变更必须把类型化 conformance manifest、release gate 与 clean-profile acceptance 作为强制证据。

## 8. 约束

- 不将源仓库的 Drawnix WIP 作为迁移基线。
- 使用 `ctx.llm` 与 `ctx.web` 替代 NoteMD 自有 Provider 与联网传输配置。
- 渲染和导出能力如实报告可用性；SVG 仅对支持 SVG 的目标充当预览派生产物。
- 工作区变更必须显式、审批门控、绑定修订，并支持恢复。

## 11. Phase 12 验证

- 范围：`fixtures/migration/conformance-implementations.json` 从 manifest v1（`testPath`/`proofTerms`）升级为 v2（`adapterId`、`sourceOperationIds`、`operationIds`）。`packages/notemd-workflows/test/migration-fixture-adapters.ts` 现在拥有 14 个临时 workspace adapter，覆盖 19 个 executable observation。
- 契约纠偏均有运行证据：章节拆分记录 source-sibling `_chapters` manifest/chapters/TOC 集合；original-text 使用固定的 `_Extracted` sibling policy；translation 同时记录 language-folder policy 与 source revision；diagram 和 Slidev 输出使用确定性的 content-addressed artifact directory；duplicate diagnostic 与 dedupe 使用 operation-specific schema。
- conformance test 校验 included operation 完整覆盖、auxiliary operation 分离、adapter registry parity、operation-to-fixture 声明、source revision normalization、target path、citation 和 mutation precondition。expected 不从 adapter 结果或测试源码推导。
- focused 证据：`rtk proxy pnpm.cmd exec vitest run --config vitest.config.ts packages/notemd-workflows/test/migration-conformance.test.ts` 通过 1 个文件、2 个测试。
- Node `v22.19.0` / pnpm `10.7.1` 的完整证据：`pnpm test` 通过 48 个文件、185 个测试；`pnpm test:coverage` 通过，statement 77.63%、branch 72.35%、function 85.33%；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle`、`pnpm accept:dsh` 与 `git diff --check` 均通过。
- capability 边界：这些 adapter 证明确定性的 planner/renderer contract，不证明 live DSH provider 质量，也不宣称 Playwright/FFmpeg/Draw.io/Tectonic/Drawnix 已安装互操作；这些属于 Phase 13 optional-runtime 证据。
- 已拒绝方案：测试源码 proof-term 匹配、从 observed output 生成 expected、用共享 duplicate contract 隐藏 read-only 与 delete 语义，以及丢弃 lineage identity 的简化 artifact path。

## 9. 验证与发布

### Phase 15/16 release gate

- Node `v22.19.0` / pnpm `10.7.1` 严格执行 `test`、`test:coverage`、`build`、`pack:bundle`、`verify:bundle`、`accept:dsh`，最后的 `git diff --check` 也通过。
- Vitest 通过 52 个文件、203 个测试；coverage 为 statement 77.68%、branch 73.00%、function 85.21%。
- packed tarball 已验证并安装到 clean DeepSeek Harness profile；source-intake lock 与 workspace ownership 变更均通过 clean-profile acceptance。
- 发布：`f8de6de`（`feat: harden workspace ownership and lock source intake`）已以非强制方式推送到 `git@github.com:Jacobinwwey/dsh-NotEMD.git`；最终 fetch 确认 `origin/main...main = 0 0`，`git status --short --branch` 只报告 `## main`。

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

### Task 6 验证

- `DshResearchClient` 只调用 DSH provider-selecting seam `ctx.web.search()` 与 `ctx.web.fetch()`。durable catalog 在 `.notemd/research` 写入 discovery/evidence JSON，保留 final URL、非 2xx status、body kind、有界 content digest、truncation、retrieval time 和 citation。research Tool response 有意省略 fetched body text；synthesis 在内部通过 evidence id 解析 record，并将 body 作为不可信输入处理。
- Tool/job boundary 不再接收 `sources`。`notemd_research_discover`、`notemd_research_capture_evidence` 与 `notemd_plan_research_synthesis` 是独立操作；research batch job 仅持久化 `evidenceIds`。job runner 在调用 workflow planner 前即时解析这些 id，因此 checkpoint 仍只保留 proposal identity 与 evidence reference。
- 聚焦证据：`packages/notemd-research/test/dsh-research-client.test.ts` 通过 4 个测试；`packages/notemd-workflows/test/workflow-planning.test.ts` 通过 6 个；`packages/notemd-tools/test/tools.contract.test.ts` 通过 14 个；`packages/notemd-bundle/test/patch.contract.test.ts` 通过 4 个。Tool contract 已包含 DSH schema 精确单分支不变量的回归测试。
- Node `v22.19.0` / pnpm `10.7.1` 的新鲜 release evidence：`pnpm typecheck`、`pnpm test`（23 个文件、118 个测试）、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 均成功完成。clean-profile acceptance 安装无 provider 的 `WebRuntime`，并断言 `notemd_research_discover` 返回 `{ status: 'unavailable', code: 'capability-unavailable' }`。

### Task 7 验证

- `@notemd-harness/documents` 将 fence 外 heading 解析为不可变 section record，记录 source digest、重复安全的 stable anchor、breadcrumb、Markdown projection 与 search projection。chapter planning 在 manifest 记录 generated artifact hash，并在提出 write/delete 前拒绝已手工修改的受管文件和非受管输出冲突。
- `NotemdWorkflowPlanner` 暴露独立的 individual/merged original-text operation、确定性 folder batch、chapter split、duplicate diagnostic、需复核的 concept-delete proposal 和 extract-and-generate。original-text output path 是 policy object，不是 merged-mode switch；folder/job snapshot 均按字典序固化。
- `VaultKnowledgeIndex` 是派生且可重建的。它索引 section，支持 task root、top-k、current-file exclusion、adjacent section window、hit explanation 和如 `citation:notes/knowledge.md#canonical-lock-ordering` 的 citation。具名 DSH Tool 返回相同的封闭、带 citation 的 result contract。
- 在 Node `v22.19.0` / pnpm `10.7.1` 上的新鲜证据：`pnpm test` 通过 26 个文件、132 个测试；`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 均通过。packed tarball 包含 `@notemd-harness/documents`，clean-profile acceptance 成功。

### Task 8 验证

- renderer Tool contract 先观察到红态：Task 8 前 registry 只有 `notemd_artifact_render_status`、`notemd_artifact_export_status`、`notemd_plan_source_artifact` 与 cleanup。将该泛化 surface 替换为五组按 target 分离的 planning/status Tool 及 v2 source-bound specification 后，focused named-Tool test 通过。
- focused artifact 证据：`diagram-spec`、`svg-sanitizer`、lineage/manifest、五个 renderer 与 Tool suite 共 10 个文件、16 个测试通过。SVG sanitizer coverage 证明会删除 script、foreign content、event attribute、remote URL、JavaScript link 与危险 data URL，同时保留 local fragment 和 image reference。
- bundle verifier 先有意观察到红态：初始 renderer package 包含 source、test、map 和 build metadata。每个 renderer package 现在只发布编译后的 `.js` 与 `.d.ts`；`pnpm pack:bundle` 与 `pnpm verify:bundle` 均通过，且包含全部五个 renderer dependency。
- 最新全量证据：`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm test`（35 个文件、144 个测试）、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 均通过。clean-profile acceptance 调用 `notemd_mermaid_render_status` 与 `notemd_plan_mermaid_artifact`，确认安装后的 bundle 会创建 canonical `.mmd` source 与清洗后的 SVG preview proposal，同时不会虚称存在 document-export provider。

### Task 9 验证

- `@notemd-harness/process` 只暴露固定的 Draw.io SVG、稳定 Drawnix adapter SVG、Tectonic PDF、PDF-to-SVG 与 PDF-to-PNG profile。边界核验 resolved executable identity、精确 argv、staging containment、有界 input/output、环境 allowlist、timeout 与 caller cancellation、进程树 `waitForExit()` 和 owner disposal。聚焦 Windows suite 通过 1 个文件、7 个测试，覆盖缺 executable、非零退出、坏输出、字节上限、staging escape、timeout/cancellation 和 cleanup。
- `@notemd-harness/render-drawio`、`@notemd-harness/render-drawnix`、`@notemd-harness/render-circuitikz` 的 3 个 provider 文件、8 个测试通过。Draw.io XML 与 Drawnix semantic JSON 确定性且已转义；preview 明确 projection 语义；native failure 保持 unavailable/failed；取消不会被转换为成功。Circuitikz 只有在 process digest 与重算 digest 一致时才 stage PDF。
- artifact/Tool 集成通过：specialist lineage 3 个测试通过；named Tool contract 16 个测试通过，并包含六个新操作 `notemd_plan_drawio_artifact`、`notemd_drawio_render_status`、`notemd_plan_drawnix_artifact`、`notemd_drawnix_render_status`、`notemd_plan_circuitikz_artifact`、`notemd_circuitikz_render_status`。bundle 显式注入 DSH `subprocess`，组合 SVG 与 specialist planner，并通过异步 Cordis effect 等待 process quiescence。
- Node `v22.19.0` / pnpm `10.7.1` 上的新鲜 release evidence：root typecheck 与 lint 通过；`pnpm build`、`pnpm verify:bundle` 和 clean DSH acceptance 通过。全量 Vitest 现为 40 个文件、162 个测试通过。clean-profile acceptance 安装 packed bundle 与 DSH local subprocess runtime，执行三个 capability Tool，并生成 Draw.io canonical/projection plan，同时对可选 binary 的状态保持真实。

### Task 10 验证

- source preparation 是确定性且 source-bound 的：普通 Markdown 会生成稳定的 Slidev deck、section/closing slide 与 layout report；已有 Slidev deck 保留内容，同时将 `fonts.provider` 规范化为 `none` 以保证 offline。fork lock fixture 固定 origin `github:Jacobinwwey/slidev`、revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`、release asset 与 build options。
- `AllowlistedProcessBoundary` 拥有 HTML、PDF、PNG、PPTX、MP4 profile。HTML 同时校验 fork 输出的 `index-standalone.html` 与兼容性的 `index.html`；MP4 使用数字帧排序、FFmpeg `libx264`/`yuv420p`/`+faststart`、偶数尺寸 padding 和 staged output。native target 不会收到 SVG substitute。
- 具名 provider 通过 `DocumentExportPlanner` 生成 `slides.md`、`layout-report.json` 与 target-specific export；manifest 使用 v3，绑定 source/revision，记录 renderer/theme/font fingerprint 和 staged-byte digest。generic document-export Tool 已移除，改为六组封闭的具名 planning/status Tool。
- Task 10 新鲜证据（Task 11 新增测试前）：`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 均通过；Vitest 为 46 个文件、179 个测试。第一次 acceptance 有意暴露 DSH 不支持 `minimum` schema keyword，随后将范围检查移到 Tool edge runtime validator，在不削弱输入校验的前提下恢复 clean-profile acceptance。

### Task 11 验证

- `packages/notemd-workflows/test/migration-conformance.test.ts` 消费固定的 source matrix 与 conformance manifest，要求所有 included operation fixture，以及独立的 local-retrieval/diagram/slide fixture，都有现存测试 proof 和可运行的 `test(...)` contract。新增的 `extract-and-generate` 测试实际执行两步 LLM planning，并断言两个 absent-precondition 输出。
- `packages/notemd-bundle/test/runtime-boundary.test.ts` 证明五个 DSH runtime 是可移除的 optional peer，patch 会重述完整 replacement-row 配置，Cordis effect 负责 LLM、process 和 scanner dispose。process suite 现在证明 dispose 会 abort active tree、等待完成、删除 run directory，并在 dispose 后拒绝新任务；既有 DSH LLM route rejection 与 Web ambiguity 测试保持通过。
- Node `v22.19.0` / pnpm `10.7.1` 的最终 gate 证据：`pnpm typecheck`、`pnpm lint`、`pnpm test`（48 个文件、184 个测试）、`pnpm test:coverage`（statement 77.03%、branch 71.87%、function 84.54%）、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 全部通过。`git diff --check` 也通过；packed tarball 已安装到隔离 DSH profile，clean acceptance 成功完成。

### Task 11 最终发布

- 发布提交 `73480df`（`test: prove full NoteMD migration conformance`）包含 conformance 测试、runtime-boundary 检查、双语架构/计划/进度更新与 validation walkthrough。
- 该提交在新鲜 release gate 通过后，以非强制方式推送到 `git@github.com:Jacobinwwey/dsh-NotEMD.git`。推送前 fetch 的分歧为 `0 11`（远端没有领先提交）；推送后 `origin/main` 已解析为 `73480df`。

## 10. 当前状态审计（2026-08-17，历史快照）

此前的发布记录提交为 `488378fb6a1429683bf1789f418abca8992bd3a2`；配套的[当前架构审计](../specs/2026-08-17-dsh-notemd-current-state-architecture-audit.zh-CN.md)仍是架构记录，Phase 15/16 的完成证据见下文。

### 证据锁

- parity oracle 仍是 `obsidian-NoteMD_new` 的 `4168a51cd19ad8c3d1e05f604b50936255461a31`。源工作区随后已到 `5efd4285f2d1861e725f520cfa8a02d1bf898eb7`，并且处于 dirty 状态，包含 diagram-gallery、cache、render-target 与 Drawnix 相关变更；这些变更不属于本发布。
- 目标仓库有 26 个 workspace package，`notemd-bundle` 是 Cordis composition root，`notemd-vault-local` 是唯一 workspace mutation authority。DSH 的 LLM/Web/Tool 服务仍是由宿主拥有的 optional peer seam。
- 历史 Phase 12 release gate 证据为 Node `v22.19.0`、pnpm `10.7.1`、48 个 Vitest 文件和 185 个测试；当前 Phase 15/16 gate 已以 52 个文件、203 个测试（statement 77.68%、branch 73.00%、function 85.21%）取代。

### 对账与边界

- 迁移已在固定的非 Obsidian 宿主行为契约与 Phase 15/16 审计边界内完成。这不宣称每个部署都安装并互操作 Playwright、固定的 `github:Jacobinwwey/slidev` fork、FFmpeg、Draw.io、Tectonic 或可选 Drawnix adapter。
- Conformance 现为可执行的类型化 adapter gate：共享语义 fixture 仍避免为每个 source operation 构造单体调用，但每个 included operation 都有显式映射并被执行，auxiliary local retrieval 保持独立。这是验证质量边界，不是遗漏源操作。
- 工件版本有意分离：DiagramSpec/diagram lineage 为 `v2`，document export manifest 为 `v3`。下一阶段必须明确这个 family 边界，不应为统一版本号而合并。
- File-backed job 仅保证单 workspace process 安全。逐目标锁不能提供分布式调度，也不能阻止两个 DSH 进程重复 planning。

### 发布后延续（历史决策，现已实现）

1. Phase 12 已完成：用类型化、可执行的 fixture adapter 和显式 operation-to-fixture 映射替换自由文本 conformance proof。
2. Phase 13 已完成：optional-runtime 通道记录 executable fingerprint、原生工件、digest、取消和 staging 清理证据。
3. Phase 14 已完成：打包 registry 强制执行 DiagramSpec/lineage `v2` 与 export manifest `v3`。
4. Phase 15 已完成当前 single-process contract；只有真正需要多进程部署时才引入 durable lease。
5. Phase 16 已完成 audit-only source intake；Mermaid normalization 是下一候选，Drawnix 继续隔离。
6. 后续候选行为必须先提供独立 deterministic contract 与 fixture，再进入实现。

本审计不重新打开已完成的 Task 1-12；下一阶段从当前发布提交和固定 source lock 开始。
- 最终 fetch 确认 `origin/main...main = 0 0`；工作区只报告 `## main`，没有任何路径。Slidev lock 仍为 `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`。

## 12. Phase 13 验证

- 范围与 owner：`packages/notemd-process/src/allowlisted-process.ts` 拥有固定 executable profile 与 byte fingerprint；`packages/notemd-process/src/capability-lane.ts` 和 `scripts/optional-runtime-capability-lane.ts` 拥有 opt-in observation/report 协议。没有把 optional binary 加入 core dependency。
- Target lock：source oracle 仍为 `obsidian-NoteMD_new@4168a51cd19ad8c3d1e05f604b50936255461a31`；Slidev lock 仍为 `github:Jacobinwwey/slidev@bbcb2efae709c2ebaa96bda522cd6c192476817c`，必须由 `NOTEMD_SLIDEV_FORK_MANIFEST` 证明后才能报告 Slidev ready。
- Node `v22.19.0` / pnpm `10.7.1` 实测：`pnpm typecheck`、`pnpm lint`、`allowlisted-process.test.ts` 与 `capability-lane.test.ts` 的 Vitest 聚焦运行通过，共 2 files/15 tests；`git diff --check` 通过。
- Real lane report：fixture SHA-256 为 `0ddba517ff3630d3c1e84b54bb952a6d91a82d7550489e3805994e57a52d53d4`；staging cleanup 为 `true`；`pdf-to-svg` ready，native digest `2f74b912f9ad7bc30512d1de59457e665400ca590acfa03a886aee50ac3c87cb`；`pdf-to-png` ready，native digest `f2279ebd674c8dadc5f57e35ebeb0c7573ff953359b5703a42a33b292c9e4c70`。
- Capability 限制：Draw.io、Drawnix adapter、Tectonic、Slidev fork 与 Playwright/FFmpeg 路径缺失或未验证，结果为 `unavailable`；取消返回 `process-cancelled`。没有把 unavailable 转换为 preview/export success。
- 拒绝方案与风险：安装 global runtime、只 hash executable path、使用 upstream Slidev、把 strict native availability 设为必过均被拒绝。有文件时 hash executable bytes；deterministic fake 才回退 path fingerprint；strict native gate 仍由环境显式 opt-in。

## 13. Phase 14 验证

- 范围与 owner：`packages/notemd-artifacts/src/schema-registry.ts` 是唯一 family/version registry。`diagram-spec.ts`、`artifact-manifest.ts` 与 `document-export.ts` 各自拥有 payload validator 和生成 discriminator；bundle verification 校验打包后的 registry，而不是只校验 source 副本。
- 封闭组合：`diagram-spec@2`、`diagram-lineage@2`、`document-export@3`。`inspectArtifactSchema` 返回稳定的 `invalid-record`、`missing-family`、`unknown-family`、`missing-version`、`unknown-version`、`invalid-combination`、`invalid-metadata` diagnostic；`assertArtifactSchema` 另加 expected family/version mismatch diagnostic。
- 前向兼容：允许并冻结嵌套 JSON-safe `metadata`；未知 payload field 仍由 family validator 负责，并被现有 `assertKnownKeys` 拒绝。没有引入无界 top-level extension point。
- focused 证据：`schema-registry.test.ts` 通过 8 tests；artifact/renderer/tool focused gate 通过 17 files/38 tests；`pnpm typecheck` 与 `pnpm lint` 通过。canonical diagram artifact id 从 `notemd-artifact-9a9e469f716c93be0bbe` 变为 `notemd-artifact-ff9a6d55ec0208286fed` 后，完整 conformance 通过 1 file/2 tests。
- Packed verification contract：`scripts/verify-bundle.ts` 从解压 tarball 动态加载 `@notemd-harness/artifacts/lib/index.js`，接受三个合法 fixture，并要求 `diagram-spec@3` 返回结构化 `invalid-combination` diagnostic。
- 拒绝方案与风险：单一全局 version、静默 legacy-family 推断、top-level 任意 metadata 和纯字符串迁移错误均被拒绝。现有 version-1 cleanup 数据现在 fail closed 并附带 diagnostic，不会被当作当前 diagram lineage manifest。

## 14. Phase 15 验证

- Owner：`packages/notemd-vault-local/src/workspace-ownership.ts` 拥有 file-backed process guard；`packages/notemd-bundle/src/vault-local.ts` 在 `LocalVault.open()` 前 acquire，并通过 Cordis effect 异步 release。没有引入 scheduler 或 database。
- Lock contract：`.notemd/runtime/workspace-owner.json` 只包含 version、PID、process start token、canonical workspace root、owner revision、timestamps、recovery count 和可选 recovered revision；heartbeat 与 release 都要求 owner revision 匹配。
- 并发/恢复证据：`workspace-ownership.test.ts` 通过 5 个测试，覆盖 acquire/release、live second-owner rejection、dead stale recovery、坏 metadata fail-closed 和外部删除后的 unhealthy cleanup；既有 local-vault/mutation focused suite 通过 26 个测试。
- 被拒方案：SQLite、distributed lease、无条件 stale lock 删除，以及仅凭 stale heartbeat 回收 live PID。只有 PID dead 且 heartbeat expired 才可恢复；多进程 planning serialization 不在本阶段声明。

## 15. Phase 16 Source Intake 验证

- `fixtures/migration/source-intake-lock.json` 固定候选 `obsidian-NoteMD_new@cdf580c6c876190ecc1040caea08e5ba5bee004f`、parent `426d0e8d...` 与五个 dirty checkout path。候选 commit 可复现，但 dirty checkout 不作为 parity oracle。
- Registry 对比：baseline 与 candidate 都有 29 个 operation ID，没有新增或删除；唯一 schema delta 是移除 `diagram.generate.input.properties.drawnixKnowledgeMapDelivery`，该字段本来就不在 non-host matrix。
- Fixture 对比：target matrix 仍为 14 个 fixture ID，input hash 没有变化。candidate-only 的 `src/tests/fixtures/drawnixArchitectureDocumentTreeFixture.ts` 已明确 quarantine。
- 分类决策：diagram-gallery 延后为 source-side presentation/fixture governance；response-cache 因 DSH 拥有 provider endpoint/model policy 被拒绝；render-target descriptor 延后到具名 bundle adapter；Mermaid family/fence/ER normalization 只作为后续候选，不宣称当前已实现。
- Drawnix quarantine 同时列出 baseline exclusion、committed candidate path 与五个 dirty path；没有任何 Drawnix implementation 或 fixture 被复制进 bundle。
- 聚焦证据：`migration-source-intake.test.ts` 与 `migration-conformance.test.ts` 通过；typecheck、lint、52 文件/203 测试全量 suite、coverage、build、packed-bundle verification、clean DSH acceptance 与 `git diff --check` 均已在上方 release gate 通过。

## 16. Phase 17 远端 main parity review（2026-08-18）

- 比对锁定：DSH `main/origin/main` 为 `92479bc`；source oracle 为 `obsidian-NoteMD_new@6097ff1` 的 `origin/main`，相对行为契约基线 `4168a51cd19ad8c3d1e05f604b50936255461a31` 比较。
- source remote-main delta 为 17 个已提交 commit、194 个文件、9,434 行新增、6,770 行删除。source checkout 当前有 17 个未提交路径；全部排除 parity 且保持不动。
- 结果：固定非 host contract 仍为高质量（18/18 included operation、14 个 fixture、typed adapter、journaled mutation、DSH-owned LLM/Web），但当前 remote-main parity 仅部分完成。未表达的已提交 delta 包括三轴 diagram catalog 与新 semantic payload、确定性 Mermaid normalization、Drawnix/Circuitikz 收敛以及 gallery/consumer gate。
- 有意排除仍然有效：Obsidian host UI/lifecycle/provider profile 与 provider response-cache policy 不是迁移缺陷。SVG derivative 不是 native Drawnix/Circuitikz 或 PPTX/MP4 parity。
- 处置：本次审计没有接受任何 source 实现。Phase 17 后续必须在新 intake lock 中固定 `6097ff1`，更新 fixture/adapter contract，并通过 focused 与完整 bundle gate 后才能重新宣称 full parity。

## 18. Phase 18 npm 包标识与发布门禁（2026-08-21）

- 规范展示/仓库名称统一为 `dsh-NotEMD`；npm 短显示名为 `dsh-notemd`，规范 scoped package identity/安装标识为 `@jacobinwwey/dsh-notemd`。旧公开包标识已从 runtime import、Cordis patch row、profile manifest、验收脚本与文档中移除。
- `packages/notemd-bundle/package.json` 已声明 public registry 元数据、仓库链接、keywords 与 `publishConfig.access = public`。bundle 仍内嵌所有尚未发布的 `@notemd-harness/*` 包，tarball 继续作为可复现的离线路径。
- 已验证发行产物为 `artifacts/jacobinwwey-dsh-notemd-0.1.0.tgz`。它通过了 `pnpm pack:bundle`、`pnpm verify:bundle`、clean DSH profile 验收、typecheck、lint、coverage、build、capability lane 以及 52 个文件/203 个测试的全量 suite。
- npm dry-run 已通过并确认 25 个内部 bundled dependency。真实发布因维护者账号启用一次性验证码而返回 `EOTP`；仓库不会保存凭据，也不会在聊天中索取 OTP。完成 npm 2FA 后重新执行：`npm publish .\\artifacts\\jacobinwwey-dsh-notemd-0.1.0.tgz --access public --registry=https://registry.npmjs.org/`。
