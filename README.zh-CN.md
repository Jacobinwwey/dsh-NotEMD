# NoteMD DeepSeek Harness Bundle

这是一个可安装的 DeepSeek Harness bundle，用于将 NoteMD 的笔记工作流语义从 Obsidian 宿主中迁出。它只面向显式配置的工作区根目录运行，不依赖 Obsidian API、编辑器状态或命令注册表。

架构取舍见[设计记录](docs/specs/2026-08-14-notemd-deepseek-harness-design.zh-CN.md)。英文版见 [README.md](README.md)。

## 运行时契约

| 关注点 | 运行时所有者 | 必须保持的约束 |
| --- | --- | --- |
| 工作区内容 | `notemdVault` | 规范化后的路径必须仍在配置根目录内；每次写入必须携带精确版本或 `absent` 前置条件。 |
| 计划 | `notemdWorkflows` 与 `notemdArtifacts` | 计划是不可变、内容寻址的值；规划不写入。 |
| 审批 | `notemdApprovalGate` 与 `notemdApprovalLedger` | 用户授权绑定到单一计划摘要，且只能消费一次；没有审批服务时必须拒绝。 |
| 修改 | `notemd_apply_approved_plan` | 每个目标都返回 `created`、`updated`、`skipped-stale`、`rejected`、`cancelled` 或 `failed`。 |
| 工作区变更 | `notemdWorkspaceChanges` | Vault 返回结果后，已批准写入才会发出仅含元数据的变更；周期性协调负责观察外部编辑。 |
| 派生状态 | `notemdKnowledge` | 索引消费工作区变更，并始终重新读取 Vault，绝不信任事件载荷中的内容。 |
| 持久化规划作业 | `notemdJobs` | 具名工作流将计划 checkpoint 写入 `<workspace>/.notemd/jobs/`；作业绝不应用计划。 |

该包刻意不是 Obsidian 兼容层。UI、预览、原生渲染器、Slidev/PPTX/PDF 导出、Tectonic 与桌面进程集成都属于独立的可选 provider。基线只生成可移植源工件，并对缺失的可选能力返回明确结果。

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
    endpoint: !!js process.env.NOTEMD_OPENAI_ENDPOINT ?? 'https://api.deepseek.com/v1/chat/completions'
    model: !!js process.env.NOTEMD_OPENAI_MODEL ?? 'deepseek-chat'
    apiKeyEnv: NOTEMD_API_KEY
    timeoutMs: 30000
```

`NOTEMD_API_KEY` 只会在执行需要模型的工作流时读取。公式规范化等确定性工作流不需要 LLM key。不要在 `cordis.patch.yml`、fixture 或工作区状态中保存密钥。

## Tool 调用序列

修改被刻意设计为三步协议：

```text
notemd_plan_* -> notemd_request_plan_approval -> notemd_apply_approved_plan
```

写入 Tool 会在应用已批准计划时再次校验版本。审批收据不是并发编辑的绕过通道：文件已改变时返回 `skipped-stale`，不会覆盖新内容。

## 运行语义

修改边界固定为：`read -> immutable WritePlan -> approval -> vault.apply -> workspace event -> index synchronization`。只有 Vault 成功返回的 `created` 与 `updated` 会产生已批准计划变更；`skipped-stale`、`rejected`、`cancelled` 与 `failed` 绝不能被伪装成可索引内容变更。

具名 `notemd_job_start_*` Tool 会持久化仅规划的作业，并异步调度新的工作。每个目标的 checkpoint 记录生成的计划，但不会授权或应用该计划。进程重启后，中断的 `running` 作业会转为 `queued`，并保持静止，直到显式调用 `notemd_job_resume`；终态作业不会重启。一个工作区只能运行一个 bundle 进程：当前文件型 store 没有跨进程 lease 协议。

`notemdWorkspaceChanges` 在初始化时捕获快照，之后通过有序轮询协调。默认 `5000` ms，合法范围为 `250` 至 `60000` ms。每次扫描要列出 Markdown 路径并读取 revision，成本与工作区 Markdown 文件规模成正比。它刻意不是文件系统 watcher，也不是分布式变更流。事件只携带路径、revision、来源、因果 id 与时间戳，绝不携带笔记内容或凭据。

`notemd_provider_diagnostic` 会发起最小的已配置 provider 请求，可能消耗 provider 配额。`notemd_provider_models` 只是 advisory：只有 completion endpoint 精确以 `/chat/completions` 结尾时才会推导 `/models`；否则必须配置 `modelsEndpoint`。发现结果为 `unavailable` 并不证明 completion 不可用。两个 Tool 都会脱敏凭据、query string、响应体与 completion 文本。

`notemd_artifact_render_status` 与 `notemd_artifact_export_status` 在核心 bundle 中返回结构化 `unavailable`。源工件仍然是可审查的计划；渲染器和导出器只能通过独立声明的 provider 安装。

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
