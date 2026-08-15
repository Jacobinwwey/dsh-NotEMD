# NoteMD Harness 下一层运行时设计

**状态：** 已批准实施

## 目标

为独立 bundle 补齐持久化、具名的“规划型”作业，显式恢复，增量知识索引同步，通用 OpenAI 兼容 Provider 可观测性，以及诚实的可选能力状态。现有权限边界保持不变：

```text
读取快照 -> 不可变 WritePlan -> 用户审批 -> 单文件原子应用 -> 变更通知 -> 索引同步
```

作业绝不应用计划。完成的作业可以保存一个或多个不可变计划，但每个计划仍必须单独经过审批，并由 `notemd_apply_approved_plan` 调用。

## 非目标

- 迁移 Obsidian 命令、UI 状态、`TFile`、编辑器状态或 `requestUrl` 传输层。
- 提供通用的 `notemd_run(type, options)` 入口或文件系统写入 Tool。
- 重启后自动恢复并发起模型调用。
- 未显式安装 Provider 时，宣称已支持浏览器、原生渲染器、Slidev、PPTX、PDF、SVG/PNG 或 Tectonic。
- 把内存通知总线冒充为可审计的持久化事件溯源。

## 运行时拓扑

```text
notemdWorkspaceChanges
  |-- WorkspaceChangeCoordinator（快照、有序发布、外部扫描）
  |-- WorkspaceChangeBus
  `-- bundle service 所属的周期扫描

notemdKnowledge
  |-- VaultKnowledgeIndex
  `-- IncrementalKnowledgeSynchronizer <- WorkspaceChangeBus

notemdJobs
  |-- FileJobStore（记录、检查点、恢复）
  `-- 具名规划执行器 -> WorkflowPlanner -> 不可变 WritePlan 检查点

notemdTextTransformer
  `-- OpenAiCompatibleAdapter（complete、diagnose、discoverModels）
```

`notemd_apply_approved_plan` 是唯一的变更路径。它返回 `created` 或 `updated` 结果后，以计划 id 和 digest 作为因果元数据发布 `notemd-approved-plan` 变更。协调器更新快照并发布事件。知识同步器重新读取受影响文档后执行 `upsert` 或 `remove`，绝不把事件载荷当作内容来源。

外部编辑通过周期性 Vault 扫描协调。这里刻意选择轮询而非 `fs.watch`：后者在跨平台、编辑器保存模式下没有足以承载安全边界的投递保证。扫描成本是每轮 O(Markdown 笔记数)，因此默认间隔保守，并作为部署配置，而不是面向用户的 Tool 开关。

## 持久化具名作业

`FileJobStore` 记录经过校验的 `workflow` 名称、目标检查点、尝试次数和生命周期状态。检查点只会在目标完成规划后产生，并可保存 JSON 安全的不可变 `WritePlan`。生命周期如下：

```text
queued -> running -> completed | failed
                 -> cancelling -> cancelled
running（进程中断） -> queued
cancelling（进程中断） -> cancelled
```

服务启动时，`recoverInterrupted()` 只将中断记录转为可显式恢复状态，不会调用 Provider 或自动执行作业。调用方必须调用 `notemd_job_resume`，避免重启时产生费用、未预期的模型调用或意外写入。

bundle 为公式修复、Mermaid 修复、翻译、Wiki 链接规划、标题规划、研究综合和概念提取暴露独立启动操作。服务内部可以使用执行器对象注册表恢复持久化工作，但任何公开 Tool 都不接受会选择行为的 `type` 参数。作业结果仅含计划和状态，不可携带审批回执，也不能触发 Vault 变更。

该 Store 支持单个工作区进程，不是分布式调度器。两个 DSH 实例同时指向同一工作区仍不受支持，因为 JSON 文件替换无法提供跨主机执行租约。这个限制会被明确记录，而不是伪装成乐观锁的保证。

## 变更语义

```ts
export type WorkspaceChangeOrigin = 'notemd-approved-plan' | 'external-scan'

export interface WorkspaceChange {
  readonly path: string
  readonly kind: 'created' | 'updated' | 'deleted'
  readonly revision?: Revision
}

export interface WorkspaceChangeEvent {
  readonly id: string
  readonly occurredAt: string
  readonly origin: WorkspaceChangeOrigin
  readonly causationId: string
  readonly changes: readonly WorkspaceChange[]
}
```

已审批写入的 `causationId` 是计划 id，外部变更的 `causationId` 是生成的扫描 id。事件中不包含笔记内容、API Key、审批密钥、提示词或 agent 对象。持久化审批账本仍负责审批消费审计；事件投递有意保持尽力而为，并通过下一轮扫描协调。

## Provider 可观测性

OpenAI 兼容适配器新增两个独立操作：

- `diagnoseProvider()`：发送一次有界的纯文本补全，报告端点（去除凭据、query 和 fragment）、配置模型、耗时、规范化错误码、可重试性以及可用时的用量。不会返回或存储补全文本。
- `discoverModels()`：仅在配置了 `modelsEndpoint`，或补全端点以 `/chat/completions` 结尾时，发起标准 OpenAI 兼容的 `GET /models`。不支持、未授权、格式错误或不可用的发现会成为结构化 `unavailable` 结果，而不是虚假的能力声明。

HTTP 诊断不再把响应体放进 `LlmError`，从而封住当前错误归一化路径的凭据和 Provider 调试信息泄露风险。

模型发现仅供参考。运行时不会因为 `/models` 被禁用或不完整而拒绝一个已配置的模型。

## 可选 Artifact 能力

源 Artifact 生成保持完整可用。渲染与导出状态通过独立操作暴露；未安装 Provider 时返回稳定的 `unavailable` 对象。它们不会引入浏览器、原生进程或渲染依赖。这是刻意的设计：核心 bundle 必须保持可移植和确定性。

## 验收规则

1. 中断中的规划作业在服务恢复后变为 queued，保留完成检查点，并且仅在显式请求后恢复剩余目标。
2. 运行中的已取消作业记录取消状态，绝不应用计划。
3. 已审批写入只发布成功文件变更，知识索引增量读取这些变更。
4. 一次外部创建、更新或删除在扫描后成为带来源标记的变更，并更新索引。
5. Provider 诊断和模型发现不暴露 API Key、Authorization header、响应体、URL query 参数或补全文本。
6. 打包 bundle 的 profile 暴露新服务和 Tools，同时保留干净 profile 的 DSH 验收。

## 被拒绝的替代方案

| 替代方案 | 拒绝原因 |
| --- | --- |
| 复用 Obsidian 批处理进度 Store | 它会吞掉 I/O 失败，生命周期状态不完整，并依赖 Obsidian runtime。 |
| 允许后台作业调用 `vault.apply` | 这会破坏审批因果链，也允许重启时写入。 |
| 只使用 `fs.watch` | 其在目标操作系统和编辑器保存模式上的行为不可靠。 |
| 复制源项目的 Provider 注册表 | 源项目支持多种传输层；本 bundle 有意只拥有通用 OpenAI 兼容边界。 |
| 把 `/models` 失败视为配置无效 | 很多兼容 Provider 禁用发现，但已配置模型仍能正常工作。 |
