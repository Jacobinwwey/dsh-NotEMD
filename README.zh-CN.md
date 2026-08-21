# dsh-NotEMD

[![DSH bundle](https://img.shields.io/badge/DeepSeek%20Harness-bundle-0f766e)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-3c873a)](https://nodejs.org/)
[![Repository](https://img.shields.io/badge/repository-dsh--NotEMD-181717?logo=github)](https://github.com/Jacobinwwey/dsh-NotEMD)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可移植、审批门控 NoteMD 工作流 bundle。它针对显式工作区根目录运行，将 canonical source 与派生 artifact 统一管理，不依赖 Obsidian API、编辑器状态、命令或 UI 宿主。

[English](README.md) | [简体中文](README.zh-CN.md)

## 30 秒安装

当前交付单元同时支持 npm registry package 与 DSH bundle。普通安装使用 registry：

```powershell
npm install --save-exact @jacobinwwey/dsh-notemd@0.1.0
dsh plugin --profile notes add @jacobinwwey/dsh-notemd@0.1.0
```

`dsh` 命令会把包安装到指定 profile；当 bundle 被其他 Node workspace 消费时才需要单独执行 `npm install`，它不能替代加入 DSH profile。

离线或未发布构建使用打包 tarball：

前提条件：

| 前提 | 版本或策略 |
| --- | --- |
| Node.js | `>=22.19.0` |
| pnpm | `10.7.1`（workspace 的 `packageManager`） |
| DeepSeek Harness | `0.1.0-rc.5` 验收基线 |
| Cordis | `@deepseek-ai/cordis` `4.0.1` 验收基线 |

构建并安装打包 bundle：

```powershell
git clone git@github.com:Jacobinwwey/dsh-NotEMD.git
cd dsh-NotEMD
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\jacobinwwey-dsh-notemd-0.1.0.tgz
```

`pnpm pack:bundle` 会内嵌所有尚未发布的 `@notemd-harness/*` workspace 包。`minisearch` 保持普通 runtime dependency，由 profile 包管理器解析。`verify:bundle` 要求 `artifacts/` 下恰好存在一个 `.tgz`；本地反复打包时应先处理旧 tarball。

本仓库使用的 source profile 位于 [`profiles/notemd`](profiles/notemd)。它是 fixture profile，不是生产部署 profile 的替代品。安装后执行 `dsh --profile <name> --dump-config`，检查实际生效的 Cordis tree 与 bundle rows。

## 包含的能力

| 能力 | 面向模型的入口 | 契约 |
| --- | --- | --- |
| 工作区 | `notemd_workspace_list`、`notemd_workspace_read` | 工作区相对 Markdown 路径、根目录 containment、不可变 revision。 |
| 知识索引 | `notemd_knowledge_search`、`notemd_knowledge_retrieve` | 只读派生索引；检索重新读取 Vault 并返回 citation。 |
| 笔记工作流 | `notemd_plan_*` | Wiki-link、标题生成、翻译、概念提取、Mermaid/公式修复、章节拆分、原文提取、文件夹批处理、重复检查与人工确认去重；规划不写入。 |
| 联网研究 | `notemd_research_discover`、`notemd_research_capture_evidence`、`notemd_plan_research_synthesis` | 使用 DSH `web`；持久化 evidence 只保存身份、citation 与 digest，不把工具输出当作可信内容。 |
| 修改 | `notemd_request_plan_approval`、`notemd_apply_approved_plan` | 一个 plan digest、一个 approval receipt、一次消费；精确 revision 前置条件；陈旧 plan fail closed。 |
| 持久化作业 | `notemd_job_start_*`、`notemd_job_resume`、`notemd_job_status`、`notemd_job_cancel` | 异步、仅规划的 checkpoint，位于 `<workspace>/.notemd/jobs/`；作业绝不应用 plan。 |
| 图表与预览 | `notemd_plan_mermaid_artifact`、`notemd_plan_vega_lite_artifact`、`notemd_plan_json_canvas_artifact`、`notemd_plan_html_artifact`、`notemd_plan_editable_svg_artifact` | canonical source 加显式标记的 SVG preview。 |
| 专用图形 | `notemd_plan_drawio_artifact`、`notemd_plan_drawnix_artifact`、`notemd_plan_circuitikz_artifact` | canonical source 加 SVG projection；native export 受 capability 门控，不会静默替换。 |
| Slidev | `notemd_plan_slidev_source`、`notemd_plan_slidev_*_export` | source、standalone HTML、PDF、PNG、native PPTX、MP4 是独立具名 provider。 |
| 能力状态 | `*_render_status`、`*_export_status` | Playwright、FFmpeg、Draw.io、Tectonic 或 adapter 缺失时返回带结构化诊断的 `unavailable`。 |

刻意不存在 generic renderer 或 export selector。不同 target 的保真、进程 allowlist、staging 与失败语义不同，单一多态开关会隐藏关键契约。

## 安全使用

DSH 通过标准 tool 与 approval surface 暴露这些操作。可以从以下请求开始：

```text
读取 notes/architecture.md。分别生成 wiki-link 与 Mermaid 修复的不可变计划。
展示受影响路径和 revision。请求审批；只有 revision 仍匹配的计划才允许应用。
```

写入协议固定为：

```text
read -> immutable WorkspaceMutationPlan -> approval -> apply -> committed receipt -> workspace event -> index update
```

只有匹配的 `committed` receipt 才会生成工作区变更事件。`conflict`、`rejected`、`cancelled`、`failed`、`recovered` 与不一致 receipt 都不会被当作可索引内容变化。

## Profile 配置

bundle patch 默认把有状态 provider 指向 `process.cwd()`。部署 profile 覆盖某一行时必须替换完整 `config` 对象；DSH patch 不会深度合并。请保留完整字段集：

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

- id: notemd-research
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-artifacts
  config:
    workspaceRoot: !!js process.env.NOTEMD_WORKSPACE_ROOT

- id: notemd-llm
  config:
    provider: deepseek
    model: deepseek-chat
    maxTokens: 4096
    promptPolicyId: notemd.default.v1
```

默认 `notemd-llm` provider 注入 DSH `llm`。其封闭 route policy 只接受 `provider`、`model`、`maxTokens`、`promptPolicyId`。endpoint、key、header、transport retry 与 model discovery 会被拒绝，不会被忽略。凭据、adapter 与 provider 选择由 DSH 配置；NoteMD 不会读取或持久化它们。

显式的 `@jacobinwwey/dsh-notemd/llm-openai-compatible-legacy` entry 仅供迁移期使用，为尚不能使用 DSH routing 的部署提供旧 OpenAI-compatible diagnostic 与 model-discovery 工具。使用时必须替换默认 `notemd-llm` row，不能同时加载，因为两者都提供 `notemdTextTransformer`。

## 图表与导出策略

由于 DSH 没有 Obsidian preview host，图表默认生成 SVG preview derivative。它不代表每个 target 都有等价的 SVG export：

- Mermaid、Vega-Lite、JSON Canvas、HTML、editable SVG 保留 canonical source，并生成带标签的 SVG preview。
- Draw.io、Drawnix、Circuitikz 保留 canonical source；只有受控 executable 或 adapter 可用时才暴露 native SVG 或 PDF。
- Slidev source preparation 是确定性的，并强制 offline fonts。HTML、PDF、PNG、PPTX、MP4 是 approval-gated planner 后的独立 provider。
- 外部进程在 request-scoped staging 目录执行，返回 digest-verified staged asset，绝不直接写工作区。

接受的 Slidev runtime 是 NoteMD fork，不是 upstream Slidev：

```text
origin: github:Jacobinwwey/slidev
revision: bbcb2efae709c2ebaa96bda522cd6c192476817c
package: @slidev/cli@52.16.0
```

该 fork 的 standalone HTML 输出为 `index-standalone.html`。PPTX 保持 native OOXML；MP4 是 Slidev PNG frames 加 FFmpeg。SVG 不会被宣传为 PPTX 或 MP4 的 fallback。

## 运行边界

- bundle 不是 Obsidian 兼容层。UI、编辑器选区、命令、modal 与 preview hosting 仍由宿主负责。
- `notemdWorkspaceChanges` 首次捕获 snapshot，之后通过有序轮询协调。默认间隔 `5000` ms，合法范围 `250` 到 `60000`；扫描成本与工作区 Markdown 规模成正比。
- 事件只携带路径、revision、origin、causation id 与时间戳，不携带笔记内容或凭据。
- 中断的 `running` 作业恢复为静止的 `queued` record。`notemd_job_resume` 是显式继续操作，不是写入授权或任意重放。
- 文件型 store 没有跨进程 lease；一个工作区只运行一个 bundle 进程。
- 默认 DSH route 不注册 `notemd_provider_diagnostic` 或 `notemd_provider_models`；它们只存在于显式 legacy transport entry。
- `@deepseek-ai/*` API 以验收使用的固定 DSH source 为准；未来 DSH 版本可能需要兼容性更新。
- 第三方 DSH plugin 会在宿主进程执行代码。生产 profile 只安装可信包，并在启动前检查实际生效的 patch。

## 开发

代码遵循 DSH/Cordis composition model：每个 provider 负责一个 service 或 capability，注册是可逆 effect，面向模型的 tool 消费稳定 seam（`llm`、`web`、`subprocess`、`tools`）。不要把 Obsidian 或第二套宿主 loop 引入 bundle。

关键入口：

| 区域 | 源码 |
| --- | --- |
| Bundle manifest 与 patch | [`packages/notemd-bundle/package.json`](packages/notemd-bundle/package.json)、[`packages/notemd-bundle/cordis.patch.yml`](packages/notemd-bundle/cordis.patch.yml) |
| Tool 注册 | [`packages/notemd-tools/src`](packages/notemd-tools/src) |
| Workflow planner | [`packages/notemd-workflows/src`](packages/notemd-workflows/src) |
| Artifact provider | [`packages/notemd-artifacts/src`](packages/notemd-artifacts/src)、[`packages/notemd-export-slidev/src`](packages/notemd-export-slidev/src) |
| 已安装 profile 验收 | [`scripts/accept-dsh-profile.ts`](scripts/accept-dsh-profile.ts) |
| 打包 bundle 校验 | [`scripts/verify-bundle.ts`](scripts/verify-bundle.ts) |

先运行聚焦门禁，再运行发行门禁：

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
pnpm capability:lane
git diff --check
```

`accept:dsh` 会创建隔离的 `DSH_HOME`，通过固定版本 source DSH CLI 安装打包 tarball，启动已安装的 ToolRuntime，检查审批与陈旧 revision 行为、仅规划作业、research fail-closed，以及图表/Slidev capability surface；记录证据后删除临时 profile 与 fixture workspace。

新增 capability 时，应同时定义 service contract、provider 与 consumer。面向模型的行为通过 `ctx.tools` 注册，使用 DSH 的 `llm`/`web`/`subprocess` seam，不创建私有 transport，并增加真实安装产物的验收断言。可选 executable 必须显式表达：缺失是 capability 结果，不能变成格式替换。

## 发布清单

1. 更新 `packages/notemd-bundle/package.json` 中的 bundle 版本，并保持 lockfile 一致。
2. 公共行为或安装方式变化时，同时更新根目录两份 README 与 package 两份 README。
3. 检查 Slidev fork lock 与可选 runtime allowlist。
4. 在 clean worktree 上运行开发门禁中的全部命令。
5. 确认 tarball 包含 `dsh.bundle.patch`、编译产物、所有 bundled internal package 与两份语言 README；`pnpm verify:bundle` 负责校验发行契约。
6. 将同一个 tarball 安装到干净 DSH profile，发布或分享前执行 `dsh --profile <name> --dump-config` 检查最终配置。
7. 使用 `npm publish .\\artifacts\\jacobinwwey-dsh-notemd-0.1.0.tgz --access public --registry=https://registry.npmjs.org/` 发布同一个已验证 tarball；npm 账号启用 2FA 时，此命令可能要求一次性验证码。

当前支持的发布路径是 npm registry package 或把 tarball 添加到 DSH profile。npm package 为 public scoped package，发布元数据位于 `packages/notemd-bundle/package.json`；tarball 仍是可复现的离线回退方案。

## 文档索引

| 主题 | English | 中文 |
| --- | --- | --- |
| 架构 | [`docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md`](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md) | [`docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md`](docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md) |
| 实施计划 | [`docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.md`](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.md) | [`docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md`](docs/superpowers/plans/2026-08-15-dsh-notemd-full-migration.zh-CN.md) |
| 迁移进度 | [`docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md`](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.md) | [`docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md`](docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.zh-CN.md) |
| 验收证据 | [`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md`](docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md) | [`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md`](docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md) |

外部契约：

- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [DeepSeek Harness development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [DeepSeek Harness capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- [DeepSeek Harness testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

## 状态

本仓库是 developer-preview bundle。公共契约是打包 tarball 与最终生效的 DSH profile patch，不是 Obsidian plugin API。DSH 仍处于 1.0 之前，后续可能存在 breaking change。
