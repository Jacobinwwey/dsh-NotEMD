# DSH NoteMD 全量迁移进度

> English version: [2026-08-15-dsh-notemd-migration-progress.md](2026-08-15-dsh-notemd-migration-progress.md)

**状态：** standalone bundle 与 next-level runtime 基础已实现。全量迁移架构与可执行计划已记录；十一项全量迁移能力任务均尚未开始实现。

## 1. 范围基线

- 源基线：`E:\convert\undo\obsidian-NoteMD_new`，提交 `4168a51cd19ad8c3d1e05f604b50936255461a31`。
- 目标基线：`E:\convert\undo\notemd-deepseek-harness`，`main` 上的提交 `6672f54def2b05e1628786ace97ab73649edab74`。
- 范围内：全部非 Obsidian 宿主的 NoteMD 工作流，包括文档、知识库、研究、图表、工件导出、批处理和稳定 Drawnix 能力。
- 明确排除：Obsidian UI 与宿主 API、直连 Provider 配置，以及源工作树中尚未提交的 Drawnix WIP。

## 2. 已核验基础

- 目标已具备审批门控、修订感知的文本 `WritePlan` 路径，持久化的只规划作业，工作区变更对账，以及增量 MiniSearch 索引。
- 当前运行时已使用 Cordis `Service`、显式 `inject` 依赖，并通过 `ctx.effect()` 管理轮询扫描器和知识订阅清理。
- 本文档更新前目标工作树处于 clean 状态。

## 3. 已完成的代码审计

源 registry 暴露 29 个 operation。宿主/Provider/profile surface 按已批准边界排除，余下的文档、知识、图表和导出行为均在范围内。源工作树在 Drawnix 区域故意保持 dirty。迁移基线不含未提交的 cross-root router、mind-map projection、relation-lane layout、其关联改动和未跟踪 fixture。

| 当前目标区域 | 已确认现状 | 架构影响 |
| --- | --- | --- |
| `packages/notemd-vault/src/revision.ts` | `WritePlan` 只包含文本写入。 | 无法表达二进制 source visual、renderer output 或 managed delete。 |
| `packages/notemd-vault-local/src/local-vault.ts` | 有逐路径锁和原子替换，但通过 `Promise.all()` 应用写入。 | 良好的单文件基础必须演化为 journaled、canonical-order 多目标 mutation executor。 |
| `packages/notemd-bundle/src/runtime-adapter.ts` 与 `cordis.patch.yml` | 默认直连 OpenAI-compatible endpoint/API key。 | 默认所有权必须转移到 DSH `ctx.llm` seam；旧传输降为 opt-in。 |
| `packages/notemd-workflows/src/index.ts` | research synthesis 接受调用方提供的文本。 | 未实现 `ctx.web` evidence consumer 前没有 native research。 |
| `packages/notemd-knowledge/src/knowledge-index.ts` | 按整文件 MiniSearch 索引。 | 缺少源任务路径、section window、当前文件排除和检索解释。 |
| `packages/notemd-artifacts/src/artifact-manifest.ts` | 仅 source JSON/README，`renderer: source`，render/export 始终 unavailable。 | artifact lineage 与具名 renderer/export provider 是核心缺口。 |
| `packages/notemd-tools/src/tool-contract.ts` | 全部 Tool 共用宽松的 `objectOutput` schema。 | 扩展能力前必须形成封闭 canonical DSH Tool 结果。 |
| `packages/notemd-jobs` 与 `packages/notemd-workspace-events` | Durable planning/checkpoint 和 metadata-only change reconciliation 已可用。 | 应保留，然后将 checkpoint/event 从 `WritePlan` 迁移到 mutation receipt。 |

## 4. 与先前方案的对账

先前方案并未被推翻。它们建立了正确的独立运行、生命周期、审批和打包基础，但尚未建立对源插件的行为契约对齐；其中两项早期默认决策需要有意地被新的架构边界取代。

| 先前要求 | 当前证据 | 全量迁移处置 |
| --- | --- | --- |
| 独立 DSH bundle，显式工作区根目录、Cordis service、profile patch 与 clean-profile 验收。 | `notemd-bundle`、profile patch 和 `pnpm accept:dsh` 已存在且通过。 | 已交付并保留。新增包必须维持显式 inject、Fiber-owned effect、完整 patch config 和 packed-bundle 验收。 |
| 修订绑定、审批门控的文本 `WritePlan` 是唯一工作区变更路径。 | `notemd-vault` 与 `LocalVault` 已约束文本修订、同目录原子替换和审批消费。 | 保留权限边界，但以一个 mutation protocol 替换纯文本公共契约。长期并存 `WritePlan` 与 `WorkspaceMutationPlan` 会形成两个可变更权威。 |
| 持久化的只规划作业、仅元数据的工作区事件和可重建的增量知识索引。 | `notemd-jobs`、`notemd-workspace-events` 和 `notemd-knowledge` 已实现 checkpoint、显式恢复、扫描和 fresh-read 索引更新。 | 保留服务；将 checkpoint 与 causation payload 从 write plan 迁移到 mutation proposal/receipt，不能把事件误做 event-sourcing 日志。 |
| 通用 OpenAI-compatible adapter 默认拥有 endpoint/key 配置、诊断和模型发现。 | `ConfiguredTextTransformer` 与默认 `cordis.patch.yml` 持有 `endpoint`、`apiKeyEnv` 和 `model`。 | 默认设计已被取代。它应降为 opt-in legacy entry；正常路径消费 DSH `ctx.llm.stream()`，绝不读取传输凭据。 |
| portable core 只需 source artifact 和真实的 unavailable render/export 状态。 | `SourceArtifactPlanner` 持久化 JSON/README 并永久返回 `unavailable`。 | 诚实但不完整。演化为版本化 source/preview/export lineage，并加入具名 capability-gated provider；不得将 SVG 称作非 SVG 目标的等价替代物。 |
| baseline workflow planner 已覆盖可移植笔记语义。 | 已有链接、标题、翻译、概念、公式、Mermaid 和由字符串提供输入的研究摘要。 | 仅部分完成。源行为仍缺章节拆分、原文抽取、文件夹策略、协调、任务范围检索、DSH-native 研究证据以及全部真实渲染/导出 provider。 |

架构修正刻意保持窄范围：保留已经可靠的机制，只替换会错误表达所有权或无法承载 artifact/mutation 需求的契约。

## 5. 全量迁移阶段账本

下表记录代码现状，而不是计划完成度。既有 release gate 通过只证明 bundle 可安装，并不证明某个能力族已经迁移。

| 任务 | `6672f54` 时的状态 | 离开该状态的关口 |
| --- | --- | --- |
| 1. 源行为契约 | 未开始。尚无 operation matrix 或迁移 fixture。 | 29 个源 operation ID 均有分类和原因；每个范围内条目都有确定性 fixture。 |
| 2. 类型化 mutation proposal | 未开始。`notemd-mutation` 尚不存在。 | 不可变 text/bytes/delete plan、staged asset reference、digest 和封闭 receipt 通过契约测试。 |
| 3. 本地 journaled executor | 未开始。本地写入是彼此独立的 `Promise.all()` 操作，没有 batch journal 或恢复。 | 在 Windows 上通过崩溃点、规范锁、二进制、delete/quarantine、路径边界和幂等恢复测试。 |
| 4. 审批、事件、作业与 Tool receipt | 未开始。审批、checkpoint、event 和开放 Tool schema 仍以 `WritePlan` 为中心。 | 审批绑定 plan/asset digest；只有已验证 receipt 能发布 metadata-only change；每个具名 Tool 有封闭结果 schema。 |
| 5. DSH LLM consumer bridge | 未开始。`notemd-llm-dsh` 不存在，直连 OpenAI-compatible adapter 仍为默认。 | `ctx.llm.stream()` 路由组装、取消、终止失败和 HMR disposal 测试通过；legacy transport 不出现在默认 patch。 |
| 6. DSH web research evidence | 未开始。研究摘要消费调用方字符串，且没有 durable evidence 包。 | 具名 discovery/synthesis 使用 `ctx.web`，保留类型化 evidence/citation，并在无 provider 时返回 capability-unavailable 而非自建 fallback。 |
| 7. 文档语义与知识检索 | 未开始。没有 documents 包，索引仍是整文件 MiniSearch。 | AST section、稳定锚点、章节/原文/协调 proposal、文件夹策略、scope window 和可解释命中通过特征化 fixture。 |
| 8. Artifact lineage 与 SVG renderer | 未开始。artifact 仅有 source JSON/README，尚无 renderer 包。 | 版本化 spec 与 source/preview/export lineage 仅通过独立具名 provider 为适用目标支持 sanitized SVG。 |
| 9. Draw.io、稳定 Drawnix 与 Circuitikz provider | 未开始。没有 staging-only process boundary 或专用 renderer 包。 | allowlisted process 测试和 provider-specific canonical source 通过，且只使用固定来源中已提交的 Drawnix 基线。 |
| 10. Slidev 与媒体导出 | 未开始。没有 Slidev/PPTX/media provider 或 staged export contract。 | prepared slide source 与每个具名 exporter 证明 capability、cleanup、字节上限和可复现性。 |
| 11. Conformance、HMR 与发布 | 仅具备前置条件。既有 bundle release gate 已通过，但没有 source-matrix conformance suite 或全量迁移 HMR 覆盖。 | 全部 included matrix 行通过，依赖/HMR/进程清理测试通过，且 clean DSH profile 能安装最终 packed bundle。 |

## 6. 已记录方向

- [权威架构](../specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md) 定义了符合 DSH/Koishi/Cordis 的 service graph，并修正旧文档中默认 Provider 与 source-only artifact 的结论。
- [可执行实施计划](../superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md) 将迁移拆为 11 个可独立测试的任务。
- 第一实现关口是特征化 fixture。它阻止看似完成的重写静默丢失章节 manifest cleanup、原文抽取、任务级检索或按目标导出等源语义。

## 7. 后续推进方向

1. 从任务 1 开始。没有源 operation matrix，“全量迁移”不可测试，后续 fixture 会把偶然的目标行为错误固化为源契约。
2. 将任务 2-4 视为一段权限迁移。不要把章节清理、二进制 artifact 或 exporter output 先移到 `WritePlan`；那会造成二次重写并削弱审批因果关系。
3. 在 proposal contract 可用后完成任务 5-6。LLM/Web bridge 必须先成为 DSH consumer，工作流才能安全持久化生成或研究结果。
4. 在扩展 renderer 宽度前完成任务 7。文档结构和检索证据是图表、引用和 artifact provenance 的上游输入。
5. 任务 8-10 必须按目标类别实现，不能使用 target selector。先实现 SVG-capable renderer；随后仅在具备显式 capability test 时加入 process-gated Draw.io/Drawnix/Circuitikz 和 Slidev/media exporter。
6. 将任务 11 留给证明，而不是乐观判断：在实现任务全部完成后运行 source-matrix conformance、生命周期/HMR 失败路径、隔离 bundle 验收和完整 release gate。

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

文档提交、canonical remote 更新、非强制推送和最终 clean-worktree 检查会在实际执行发布命令后记录。它们与实现账本严格分离：发布本架构不会推进任何能力任务。
