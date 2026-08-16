# NoteMD DeepSeek Harness Bundle

这是一个可安装的 DeepSeek Harness bundle，用于将 NoteMD 的笔记工作流语义从 Obsidian 宿主中迁出。它只面向显式配置的工作区根目录运行，不依赖 Obsidian API、编辑器状态或命令注册表。

当前运行时基线见[原设计记录](docs/specs/2026-08-14-notemd-deepseek-harness-design.zh-CN.md)。已批准的[全量迁移架构](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md)、[实施计划](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md)和[进度记录](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md)定义后续方向。英文版见 [README.md](README.md)。

## 运行时契约

| 关注点 | 运行时所有者 | 必须保持的约束 |
| --- | --- | --- |
| 工作区内容 | `notemdVault` | 规范化后的路径必须仍在配置根目录内；每次写入必须携带精确版本或 `absent` 前置条件。 |
| 计划 | `notemdWorkflows` 与 `notemdArtifacts` | 计划是不可变、内容寻址的值；规划不写入。 |
| 审批 | `notemdApprovalGate` 与 `notemdApprovalLedger` | 用户授权绑定到单一计划摘要，且只能消费一次；没有审批服务时必须拒绝。 |
| 修改 | `notemd_apply_approved_plan` | 应用产生封闭且绑定 revision 的 `WorkspaceMutationReceipt`；它是唯一的本地工作区写入 authority。 |
| 工作区变更 | `notemdWorkspaceChanges` | 只有匹配的 `committed` receipt 才会发出仅含元数据的变更；周期性协调负责观察外部编辑。 |
| 派生状态 | `notemdKnowledge` | 索引消费工作区变更，并始终重新读取 Vault，绝不信任事件载荷中的内容。 |
| 持久化规划作业 | `notemdJobs` | 具名工作流将计划 checkpoint 写入 `<workspace>/.notemd/jobs/`；作业绝不应用计划。 |
| LLM 路由 | DSH `llm` | NoteMD 只提供 provider/model route policy；凭据、adapter 与 transport 由 DSH 所有。 |

该包刻意不是 Obsidian 兼容层。UI、编辑器选区、命令、modal 与预览宿主仍在 bundle 之外。可移植的文档/图表语义在 bundle 内；具名 render/export provider 生成 canonical source 与真实派生物。可选 executable 缺失时返回 `unavailable`，不会静默替换成另一种格式。

## 导出目标

Slidev source preparation 是确定性的，并强制 offline fonts。HTML、PDF、PNG、PPTX、MP4 是同一 approval-gated artifact planner 后的独立具名 provider。所有外部进程都在每次请求的 staging 目录运行，并返回 digest-verified staged asset；provider 不会直接写工作区。

唯一接受的 Slidev runtime 是 NoteMD fork：

```text
origin: github:Jacobinwwey/slidev
revision: bbcb2efae709c2ebaa96bda522cd6c192476817c
package: @slidev/cli@52.16.0
```

该 fork 的 standalone HTML build 输出 `index-standalone.html`。PPTX 保持 native OOXML，MP4 保持 Slidev PNG 加 FFmpeg pipeline；SVG 绝不会被宣传为二者的等价 fallback。Playwright 与 FFmpeg 是可选 capability，缺失时会显式分类。

## 安装

前提条件：

- Node.js `>=22.19.0`
- pnpm `10.7.1`
- DeepSeek Harness `0.1.0-rc.5`，并使用 `@deepseek-ai/cordis` `4.0.1`

生成发行 tarball，再添加到 DSH profile：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\jacobinwwey-notemd-deepseek-harness-0.1.0.tgz
```

bundle 内嵌所有未发布的 `@notemd-harness/*` workspace 包。`minisearch` 保持为普通公开运行时依赖，由 profile 的包管理器在安装时解析。

## Profile 配置

bundle 默认把 `process.cwd()` 作为工作区根目录。生产 profile 必须完整替换每个拥有工作区状态的行配置，因为 DSH patch 层会替换整个 `config`，不会深度合并。

```yaml
- id: notemd-vault
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-jobs
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT
    concurrency: 2

- id: notemd-workspace-changes
  config:
    scanIntervalMs: 5000

- id: notemd-approval
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT
    approvalTtlMs: 300000

- id: notemd-llm
  config:
    provider: deepseek
    model: deepseek-chat
    maxTokens: 4096
    promptPolicyId: notemd.default.v1
```

默认 `notemd-llm` entry 注入 DSH 的 `llm` service。其封闭 route policy 只允许 `provider`、`model`、`maxTokens` 与 `promptPolicyId`；endpoint、key、header、transport retry 或 model-discovery field 会被拒绝，不会被静默忽略。凭据、provider adapter 与 provider 选择应在 DSH 中配置；NoteMD 不会读取或持久化它们。

`@jacobinwwey/notemd-deepseek-harness/llm-openai-compatible-legacy` 是仅供迁移期使用的显式 entry，面向暂时不能使用 DSH LLM routing 的部署。它拥有旧的 OpenAI-compatible diagnostic/discovery 行为。legacy profile 必须以此模块替换默认 `notemd-llm` entry，不能并存加载，因为两者都提供 `notemdTextTransformer`。默认 bundle patch 不会加载 legacy entry。

## Tool 调用序列

修改被刻意设计为三步协议：

```text
notemd_plan_* -> notemd_request_plan_approval -> notemd_apply_approved_plan
```

写入 Tool 会在应用已批准计划时再次校验版本。审批收据不是并发编辑的绕过通道：文件已改变时返回 `skipped-stale`，不会覆盖新内容。

## 运行语义

修改边界固定为：`read -> immutable WorkspaceMutationPlan -> approval -> mutation executor -> matching committed receipt -> workspace event -> index synchronization`。conflict、rejected、cancelled、failed、recovered 或不一致 receipt 绝不能被伪装成可索引内容变更。

具名 `notemd_job_start_*` Tool 会持久化仅规划的作业，并异步调度新的工作。每个目标的 checkpoint 记录生成的计划，但不会授权或应用该计划。进程重启后，中断的 `running` 作业会转为 `queued`，并保持静止，直到显式调用 `notemd_job_resume`；终态作业不会重启。一个工作区只能运行一个 bundle 进程：当前文件型 store 没有跨进程 lease 协议。

`notemdWorkspaceChanges` 在初始化时捕获快照，之后通过有序轮询协调。默认 `5000` ms，合法范围为 `250` 至 `60000` ms。每次扫描要列出 Markdown 路径并读取 revision，成本与工作区 Markdown 文件规模成正比。它刻意不是文件系统 watcher，也不是分布式变更流。事件只携带路径、revision、来源、因果 id 与时间戳，绝不携带笔记内容或凭据。

默认 DSH route 不会注册 `notemd_provider_diagnostic` 或 `notemd_provider_models`，因为 DSH 拥有 provider configuration 与 observability。这两个迁移期 Tool 只在显式 legacy transport entry 替换默认 LLM entry 后才会出现。

Artifact Tool 按 target 分离：`notemd_plan_mermaid_artifact`、Draw.io/Drawnix/Circuitikz planning/status 对，以及六组 `notemd_plan_slidev_*` 与 status 对。不存在 generic renderer/export selector，因为不同 target 的保真、进程 allowlist 和失败语义有实质差异。

## 开发门禁

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
git diff --check
```

`accept:dsh` 会创建临时 `DSH_HOME`，通过固定版本 source DSH CLI 安装 tarball，导出解析后的 profile，并在已安装 Tool 上执行读取、provider fail-closed、能力状态、具名公式规划作业、审批、应用、工作区变更与陈旧计划保护。它会在记录结果后删除临时 profile 与工作区。

## 运行边界

- `@deepseek-ai/*` API 以验收所用的 DSH source 引用为准，不假设未来版本保持兼容。
- 审批依赖 DSH 的 `approval` 服务和 agent 上下文。缺失时拒绝，绝不默认放行。
- bundle 负责文件工作流语义，不负责视觉渲染或桌面生命周期。新增这些能力时，应通过声明式可选服务接入，而不是把宿主 API 引入本包。
- 轮询是可靠性与扫描成本之间的显式权衡；它不能替代跨进程协调或远程文件系统通知。
- `notemd_job_resume` 是中断作业的显式操作，不是任意重放或写入授权。
- 工作区根目录是部署层授权边界，不是方便性的默认参数。
