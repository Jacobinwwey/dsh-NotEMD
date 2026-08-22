# NoteMD Harness 下一层运行时实施计划

> **面向 agentic worker：** 必须使用 `superpowers:executing-plans` 子技能逐任务执行本计划。步骤使用 checkbox（`- [x]`）追踪。

**目标：** 在不削弱审批门控写入边界的前提下，让 NoteMD DeepSeek Harness bundle 具备可靠运行能力。

**架构：** 独立 workspace-events 包拥有有序、仅元数据的变更和 Vault 快照协调。持久化作业拥有检查点与显式恢复；bundle 将持久化 workflow 名称映射到仅规划的工作流执行器。OpenAI 兼容适配器在既有配置 Provider 服务之后暴露诊断与建议性模型发现。

**技术栈：** Node.js 22.19.0+、pnpm 10.7.1、TypeScript strict mode、Vitest、DeepSeek Harness 0.1.0-rc.5 源码契约、Cordis 和 `@deepseek-ai/dsh-tools`。

## 全局约束

- 仅在本仓库工作；`E:/convert/undo/obsidian-NoteMD_new` 与 `ref/deepseek-harness` 始终是只读参考。
- 保持审批门控的 `WritePlan` 为唯一变更路径。持久化作业只规划。
- 不添加 `notemd_run`、不安全写 Tool、Obsidian import、浏览器/原生渲染依赖或 Provider 专用传输注册表。
- 事件载荷只包含路径、revision、来源、因果 id 和时间戳；绝不包含笔记内容、API key、headers、提示词、响应体或审批密钥。
- 工作区扫描基于轮询且有序；它不是分布式文件系统 watcher。
- 每个行为都遵循红绿重构，并保留每种失败模式的聚焦测试。
- `docs/` 下的设计、计划与验证文档必须同时维护英文和中文版本。

---

### 任务 1：增加工作区变更契约与增量索引同步

**文件：**
- 新建：`packages/notemd-workspace-events/src/index.ts`
- 新建：`packages/notemd-workspace-events/src/workspace-change-coordinator.ts`
- 新建：`packages/notemd-workspace-events/package.json`
- 新建：`packages/notemd-workspace-events/tsconfig.json`
- 新建：`packages/notemd-workspace-events/test/workspace-change-coordinator.test.ts`
- 新建：`packages/notemd-knowledge/src/incremental-knowledge-synchronizer.ts`
- 修改：`packages/notemd-knowledge/src/index.ts`
- 修改：`packages/notemd-knowledge/test/knowledge-index.test.ts`
- 修改：`packages/notemd-vault/src/workspace-package-names.ts`
- 修改：pnpm 所需的 workspace manifest 与 lockfile

**契约：**

```ts
export type WorkspaceChangeOrigin = 'notemd-approved-plan' | 'external-scan'
export interface WorkspaceChange { path: string; kind: 'created' | 'updated' | 'deleted'; revision?: Revision }
export interface WorkspaceChangeEvent { id: string; occurredAt: string; origin: WorkspaceChangeOrigin; causationId: string; changes: readonly WorkspaceChange[] }
export interface WorkspaceChangeSource { subscribe(listener: (event: WorkspaceChangeEvent) => void): () => void }
export class WorkspaceChangeCoordinator implements WorkspaceChangeSource {
  async captureSnapshot(signal?: AbortSignal): Promise<void>
  async recordApprovedPlan(plan: WritePlan, results: readonly WriteResult[]): Promise<WorkspaceChangeEvent | undefined>
  async scan(signal?: AbortSignal): Promise<WorkspaceChangeEvent | undefined>
}
```

- [x] **步骤 1：编写失败的事件与索引同步测试**

```ts
test('publishes only successful approved writes with plan causation', async () => {
  await coordinator.captureSnapshot()
  const events: WorkspaceChangeEvent[] = []
  coordinator.subscribe((event) => events.push(event))
  await coordinator.recordApprovedPlan(plan, [{ path: 'notes/a.md', status: 'updated', revision: 'rev-b' }])
  expect(events).toMatchObject([{ origin: 'notemd-approved-plan', causationId: plan.id }])
})
```

- [x] **步骤 2：运行聚焦测试并观察缺失模块失败**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/workspace-events test -- workspace-change-coordinator.test.ts`

预期：因 event 与 synchronizer 模块不存在而失败。

- [x] **步骤 3：实现协调器与内存订阅边界**

`recordApprovedPlan()` 仅把带 revision 的 `created` 与 `updated` 结果变为 `notemd-approved-plan` 事件。`captureSnapshot`、`recordApprovedPlan` 与 `scan` 经同一 promise tail 串行化。`scan` 比较 `{ path, revision }` 快照，并在一个生成的 scan id 下发布新增、更新和删除。

- [x] **步骤 4：实现知识订阅**

订阅者对事件逐个重新读取受影响路径；删除直接 `remove`，读取得到 `VAULT_NOT_FOUND` 时也执行 `remove`。它必须暴露 `dispose()` 和 `whenIdle()`。

- [x] **步骤 5：验证 Task 1**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/workspace-events test`

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/knowledge test`

运行：`rtk tsc`

预期：事件有序、无变化写入不发布事件、外部新增/更新/删除可协调，索引读取最新 Vault 内容。

### 任务 2：让作业具备检查点、恢复与显式继续能力

**文件：**
- 修改：`packages/notemd-jobs/src/file-job-store.ts`
- 修改：`packages/notemd-jobs/src/bounded-runner.ts`
- 新建：`packages/notemd-jobs/src/durable-workflow-runner.ts`
- 修改：`packages/notemd-jobs/src/index.ts`
- 修改：`packages/notemd-jobs/test/bounded-runner.test.ts`
- 新建：`packages/notemd-jobs/test/durable-workflow-runner.test.ts`

**契约：**

```ts
export interface JobTargetResult { target: string; status: 'completed' | 'cancelled' | 'failed'; detail?: string; checkpoint?: JsonValue }
export type JobState = 'queued' | 'running' | 'cancelling' | 'completed' | 'cancelled' | 'failed'
export interface JobRecord<I extends JsonValue> { workflow: string; attempt: number }
export interface WorkflowJobExecutor<I extends JsonValue> {
  readonly workflow: string
  execute(input: Readonly<I>, target: string, signal: AbortSignal): Promise<JobTargetResult>
}
```

- [x] **步骤 1：编写失败的恢复与检查点测试**

```ts
test('recovers interrupted work and executes only targets without checkpoints', async () => {
  const first = await store.start({ workflow: 'formula-repair', idempotencyKey: 'f1', input: {}, targets: ['a.md', 'b.md'] })
  await store.markRunning(first.id)
  await store.recordTargetCheckpoint(first.id, { target: 'a.md', status: 'completed' })
  await store.recoverInterrupted()
  await runner.resume(first.id)
  expect(executed).toEqual(['b.md'])
})
```

- [x] **步骤 2：运行聚焦测试并观察失败**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/jobs test -- durable-workflow-runner.test.ts`

预期：因 checkpoint、recovery 与 durable runner API 缺失而失败。

- [x] **步骤 3：扩展持久化状态机，不引入通用 update API**

添加具名操作 `recordTargetCheckpoint`、`recoverInterrupted`、`beginExecution`、`finishExecution`。在 `start` 边界校验 workflow，一次性 clone JSON checkpoint，并原子写入每个 checkpoint。`running` 变 `queued`；`cancelling` 变 `cancelled`；终态不可变。

- [x] **步骤 4：实现带有界结果观察的持久化执行**

`BoundedJobRunner.run()` 保持可用并委托给 `runWithObserver()`。observer 必须在 worker 领取下一目标前完成，以确保它是真正的完成检查点而不是末尾汇总。

- [x] **步骤 5：验证 Task 2**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/jobs test`

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/jobs typecheck`

预期：幂等性、有界并发、检查点持久化、中断恢复、取消、失败目标和终态不可变全部通过。

### 任务 3：将具名规划作业与工作区事件接入 Bundle

**文件：**
- 新建：`packages/notemd-bundle/src/workspace-changes.ts`
- 修改：`packages/notemd-bundle/src/jobs.ts`
- 修改：`packages/notemd-bundle/src/knowledge.ts`
- 修改：`packages/notemd-bundle/src/tools.ts`
- 修改：`packages/notemd-bundle/cordis.patch.yml`
- 修改：`packages/notemd-bundle/package.json`
- 修改：`packages/notemd-tools/src/notemd-services.ts`
- 修改：`packages/notemd-tools/src/job-tools.ts`
- 修改：`packages/notemd-tools/src/write-tools.ts`
- 修改：`packages/notemd-tools/src/index.ts`
- 修改：对应 Tool 与 bundle 测试

- [x] **步骤 1：编写失败的 bundle Tool 测试**

测试须断言存在 `notemd_job_start_formula_repair`、`notemd_job_resume`，不存在 `notemd_run`，并且成功应用计划返回 `notemd-approved-plan` 变更元数据。

- [x] **步骤 2：运行 Task 3 的红灯测试**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/tools test -- tools.contract.test.ts`

运行：`rtk proxy pnpm.cmd --filter dsh-notemd test -- patch.contract.test.ts`

预期：因具名作业和 workspace changes 未注入或注册而失败。

- [x] **步骤 3：实现仅规划执行器策略与显式 Tools**

每个 bundle method 单独构造已校验输入并调用唯一对应的 `WorkflowPlanner` 方法。成功规划的后台 checkpoint 仅保存 `{ plan }`。`resume(id)` 通过私有执行器 map 解析已持久化 workflow 名称；未知名称返回稳定的 JobStore error。启动 Tool 立即返回持久化记录；恢复只在显式请求后开始。

- [x] **步骤 4：实现具生命周期感知的变更服务**

变更服务 init 时捕获基础快照。知识服务重建、订阅，然后启动周期扫描。写 Tool 仅在 Vault 返回结果后调用 `recordApprovedPlan()`，并只把返回元数据放入响应。

- [x] **步骤 5：验证 Task 3**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/tools test`

运行：`rtk proxy pnpm.cmd --filter dsh-notemd test`

运行：`rtk tsc`

预期：Cordis patch 在 knowledge/tools 前注入 workspace changes；具名 job Tool 不会应用计划；计划应用会发布可索引变更。

### 任务 4：增加 Provider 诊断、模型发现与显式可选能力

**文件：**
- 修改：`packages/notemd-llm-openai-compatible/src/error.ts`
- 修改：`packages/notemd-llm-openai-compatible/src/index.ts`
- 新建：`packages/notemd-llm-openai-compatible/test/provider-observability.test.ts`
- 修改：`packages/notemd-bundle/src/runtime-adapter.ts`
- 修改：`packages/notemd-bundle/src/llm.ts`
- 新建：`packages/notemd-tools/src/provider-tools.ts`
- 修改：artifact、Tool、patch 与对应测试

- [x] **步骤 1：编写失败的可观测性与能力测试**

测试必须验证：成功诊断返回安全端点和模型；标准模型发现返回 model id；序列化后的不可用结果不包含 secret；Artifact 能力返回 `unavailable`。

- [x] **步骤 2：运行 Task 4 的红灯测试**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/llm-openai-compatible test -- provider-observability.test.ts`

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/artifacts test -- artifact-manifest.test.ts`

预期：因诊断、发现和能力方法不存在而失败。

- [x] **步骤 3：实现脱敏 Provider 操作**

复用 timeout/cancellation 路径。报告端点时去掉凭据、query 和 fragment。`LlmError` 不包含 HTTP 响应体，只报告状态码。只有补全端点以 `/chat/completions` 结尾时才推导 `/models`，否则要求显式 `modelsEndpoint`。只解析 string model id 与可选 string `owned_by`。

- [x] **步骤 4：暴露独立 Provider 和能力 Tools**

注册 `notemd_provider_diagnostic`、`notemd_provider_models`、`notemd_artifact_render_status` 与 `notemd_artifact_export_status`。它们没有会选择传输或渲染行为的参数，只返回结构化数据。

- [x] **步骤 5：验证 Task 4**

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/llm-openai-compatible test`

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/artifacts test`

运行：`rtk proxy pnpm.cmd --filter @notemd-harness/tools test`

预期：错误被脱敏、发现失败诚实地成为 `unavailable`，package graph 中没有渲染依赖。

### 任务 5：验证发布 Bundle、记录操作方式并推送 Main

**文件：**
- 修改：`docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.md`
- 修改：`docs/walkthroughs/2026-08-14-notemd-deepseek-harness-validation.zh-CN.md`
- 修改：`README.md`
- 修改：`README.zh-CN.md`
- 修改：`scripts/accept-dsh-profile.ts`

- [x] **步骤 1：扩展干净 profile 验收覆盖**

断言已解析配置含 `notemd-workspace-changes`、`notemd_provider_diagnostic` 与 `notemd_job_start_formula_repair`。

- [x] **步骤 2：运行验收**

运行：`rtk proxy pnpm.cmd accept:dsh`

预期：打包 tarball 在隔离 DSH profile 中解析 workspace-change、jobs、knowledge、LLM 和 Tool 服务。

- [x] **步骤 3：在双语 walkthrough 中记录操作与已知排除项**

记录显式恢复、扫描间隔成本、模型发现的建议性语义、审批边界、单进程工作区限制以及结构化不可用的渲染/导出结果。不要把不支持的 renderer 安装描述为已可用行为。

- [x] **步骤 4：运行完整发布门禁**

运行：`rtk tsc`

运行：`rtk lint`

运行：`rtk proxy pnpm.cmd test`

运行：`rtk proxy pnpm.cmd test:coverage`

运行：`rtk proxy pnpm.cmd build`

运行：`rtk proxy pnpm.cmd pack:bundle`

运行：`rtk proxy pnpm.cmd verify:bundle`

运行：`rtk proxy pnpm.cmd accept:dsh`

运行：`rtk proxy git diff --check`

预期：全部命令退出码为零，bundle 内容保持自包含，干净 profile 接受打包 bundle。

- [x] **步骤 5：提交并推送已验证的 main**

运行：`rtk proxy git add packages docs README.md README.zh-CN.md scripts pnpm-lock.yaml`

运行：`rtk proxy git commit -m "feat: add reliable harness runtime services"`

运行：`rtk proxy git -c "core.sshCommand=ssh -o ControlMaster=no -o ControlPath=none" fetch origin main`

运行：`rtk proxy git -c "core.sshCommand=ssh -o ControlMaster=no -o ControlPath=none" push origin main`

预期：所有门禁通过后，非 force push 将远端 `main` 快进。

## 计划审查

- 覆盖性：任务 1-3 实现可靠性和增量同步边界；任务 4 实现 Provider/能力透明度；任务 5 验证打包 DSH artifact 并记录运行限制。
- 权限：所有自动化直到既有审批门控写 Tool 执行前都只是规划。没有 job 或 event service 能变更工作区内容。
- 可靠性权衡：扫描优先可靠协调，而不是低延迟、平台专用的 watcher 行为；它受配置限制且不发布内容。
- 兼容性：模型发现是可选且建议性的，适配省略 `/models` 的 OpenAI 兼容部署。
- 明确风险：在真正的跨进程 lease backend 到位前，共享工作区的多进程作业执行刻意不受支持。

## 实测收尾（2026-08-22）

- Task 1-4 已在提交 `6672f54` 实现：workspace change coordinator 与增量知识同步、带 checkpoint 的 durable job、bundle 生命周期绑定，以及脱敏 Provider observability/optional capability 边界。
- focused re-verification 通过 8 个文件 / 48 个测试，覆盖 workspace-events、knowledge、jobs、Provider observability、artifacts、Tools 与 bundle patch/runtime boundary。
- 并行运行全包 suite 时出现的仅是测试资源争用：`migration-conformance` 与 composite approval 在并行 package fan-out 下可能超过默认 10 秒，且一次运行留下临时 `.notemd/mutations` 目录忙碌；相同 focused contract 串行通过。release verification 必须使用 root command、适当 timeout，禁止并行 package fan-out。
- 下一 parity phase 是确定性 Mermaid normalization 与 versioned semantic/render/export diagram catalog；Drawnix、Provider cache policy 与 Obsidian host gallery 继续排除。
