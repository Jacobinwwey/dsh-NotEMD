# dsh-NotEMD

[![npm](https://img.shields.io/npm/v/dsh-notemd?logo=npm&label=npm)](https://www.npmjs.com/package/dsh-notemd)
[![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-bundle-0f766e)](https://github.com/deepseek-ai/deepseek-harness)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.19-3c873a)](https://nodejs.org/)
[![Repository](https://img.shields.io/badge/repository-dsh--NotEMD-181717?logo=github)](https://github.com/Jacobinwwey/dsh-NotEMD)

面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的可移植、审批门控 NoteMD 工作流 bundle。它针对显式工作区根目录运行，将 canonical source 与派生 artifact 统一管理，不依赖 Obsidian API、编辑器状态、命令或 UI 宿主。

[English](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.md) | [简体中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.zh-CN.md)

**当前版本：** [`dsh-notemd@0.1.1`](https://www.npmjs.com/package/dsh-notemd/v/0.1.1) · [GitHub 仓库](https://github.com/Jacobinwwey/dsh-NotEMD)

## 安装

支持的验收基线：

| 前提 | 版本或策略 |
| --- | --- |
| Node.js | `>=22.19.0` |
| pnpm | `10.7.1`（workspace 的 `packageManager`） |
| DeepSeek Harness | `0.1.0-rc.5` 验收基线 |
| Cordis | `@deepseek-ai/cordis` `4.0.1` 验收基线 |

从公共 npm registry 安装，并将同一版本加入 DSH profile：

~~~
npm install --save-exact dsh-notemd@0.1.1
dsh plugin --profile notes add dsh-notemd@0.1.1
~~~

`npm install` 让 Node workspace 可以解析该包；`dsh plugin ... add` 才会把 bundle patch 激活到指定 profile。只执行前者不会启用 DSH 插件。

离线或未发布构建使用已验证的 tarball：

~~~
git clone git@github.com:Jacobinwwey/dsh-NotEMD.git
cd dsh-NotEMD
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add ./artifacts/dsh-notemd-0.1.1.tgz
~~~

`pnpm pack:bundle` 会内嵌尚未发布的 `@notemd-harness/*` 实现包；`minisearch` 保持普通 runtime dependency，由 profile 包管理器解析。打包校验要求 `artifacts/` 下恰好有一个 `.tgz`，反复打包前请清理旧 tarball。

仓库中的 fixture profile 是 [`profiles/notemd`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/profiles/notemd)，仅用于验收，不代替部署方自己的 profile。安装后可检查最终生效配置：

~~~
dsh --profile notes --dump-config
~~~

## 快速使用

bundle 首先暴露规划工具。典型请求：

~~~
读取 notes/architecture.md。分别生成 wiki-link 与 Mermaid 修复的不可变计划。
展示受影响路径和 revision。请求审批；只有 revision 仍匹配的计划才允许应用。
~~~

写入协议固定且可审计：

~~~
read -> immutable WorkspaceMutationPlan -> approval -> apply -> committed receipt -> workspace event -> index update
~~~

只有匹配的 `committed` receipt 才会生成工作区变更事件。`conflict`、`rejected`、`cancelled`、`failed`、`recovered` 以及不一致 receipt 都不会被当作可索引内容变化。

## 能力矩阵

| 区域 | 面向模型的入口 | 契约 |
| --- | --- | --- |
| 工作区 | `notemd_workspace_list`、`notemd_workspace_read` | 工作区相对 Markdown 路径、根目录 containment、不可变 revision。 |
| 知识索引 | `notemd_knowledge_search`、`notemd_knowledge_retrieve` | 只读派生索引；检索重新读取 Vault 并返回 citation。 |
| 笔记工作流 | `notemd_plan_*` | Wiki-link、标题生成、翻译、概念提取、Mermaid/公式修复、章节拆分、原文提取、文件夹批处理、重复检查与人工确认去重；规划不写入。 |
| 联网研究 | `notemd_research_discover`、`notemd_research_capture_evidence`、`notemd_plan_research_synthesis` | 使用 DSH `web`；持久化 evidence 只保存身份、citation 与 digest，不把不可信工具输出作为事实。 |
| 修改 | `notemd_request_plan_approval`、`notemd_apply_approved_plan` | 一个 plan digest、一个 approval receipt、一次消费；精确 revision 前置条件；陈旧 plan fail closed。 |
| 持久化作业 | `notemd_job_start_*`、`notemd_job_resume`、`notemd_job_status`、`notemd_job_cancel` | 异步、仅规划 checkpoint，位于 `<workspace>/.notemd/jobs/`；作业绝不应用 plan。 |
| 图表与预览 | `notemd_plan_mermaid_artifact`、`notemd_plan_vega_lite_artifact`、`notemd_plan_json_canvas_artifact`、`notemd_plan_html_artifact`、`notemd_plan_editable_svg_artifact` | canonical source 加显式标记的 SVG preview。 |
| 专用图形 | `notemd_plan_drawio_artifact`、`notemd_plan_drawnix_artifact`、`notemd_plan_circuitikz_artifact` | canonical source 加 SVG projection；native export 受 capability 门控，不会静默替换。 |
| Slidev | `notemd_plan_slidev_source`、`notemd_plan_slidev_*_export` | source、standalone HTML、PDF、PNG、native PPTX、MP4 是独立具名 provider。 |
| 能力状态 | `*_render_status`、`*_export_status` | Playwright、FFmpeg、Draw.io、Tectonic 或 adapter 缺失时返回带结构化诊断的 `unavailable`。 |

刻意不存在 generic renderer 或 export selector。不同 target 的保真、进程 allowlist、staging 与失败语义不同，单一多态开关会隐藏关键契约。

## Profile 配置

bundle patch 默认把有状态 provider 指向 `process.cwd()`。部署 profile 覆盖某一行时必须替换完整 `config` 对象；DSH patch 不会深度合并。请保留完整字段集：

~~~yaml
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
~~~

默认 `notemd-llm` provider 注入 DSH `llm`。其封闭 route policy 只接受 `provider`、`model`、`maxTokens`、`promptPolicyId`。endpoint、key、header、transport retry 与 model discovery 会被拒绝，不会被忽略。凭据、adapter 与 provider 选择由 DSH 配置；NoteMD 不会读取或持久化它们。

显式的 `dsh-notemd/llm-openai-compatible-legacy` entry 仅供迁移期使用，为尚不能使用 DSH routing 的部署提供旧 OpenAI-compatible diagnostic 与 model-discovery 工具。使用时必须替换默认 `notemd-llm` row，不能同时加载，因为两者都提供 `notemdTextTransformer`。

## 图表与导出

由于 DSH 没有 Obsidian preview host，SVG 是默认 preview derivative。这是预览策略，不代表每个 target 都有等价的 SVG export：

- Mermaid、Vega-Lite、JSON Canvas、HTML、editable SVG 保留 canonical source，并生成带标签的 SVG preview。
- Draw.io、Drawnix、Circuitikz 保留 canonical source；只有受控 executable 或 adapter 可用时才暴露 native SVG 或 PDF。
- Slidev source preparation 是确定性的，并强制 offline fonts。HTML、PDF、PNG、PPTX、MP4 是 approval-gated planner 后的独立 provider。
- 外部进程在 request-scoped staging 目录执行，返回 digest-verified staged asset，绝不直接写工作区。

接受的 Slidev runtime 是 [NoteMD fork](https://github.com/Jacobinwwey/slidev)，不是 upstream Slidev：

~~~
origin: github:Jacobinwwey/slidev
revision: bbcb2efae709c2ebaa96bda522cd6c192476817c
package: @slidev/cli@52.16.0
~~~

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
| Bundle manifest 与 patch | [`packages/notemd-bundle`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-bundle) |
| Tool 注册 | [`packages/notemd-tools/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-tools/src) |
| Workflow planner | [`packages/notemd-workflows/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-workflows/src) |
| Artifact provider | [`packages/notemd-artifacts/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-artifacts/src)、[`packages/notemd-export-slidev/src`](https://github.com/Jacobinwwey/dsh-NotEMD/tree/main/packages/notemd-export-slidev/src) |
| 已安装 profile 验收 | [`scripts/accept-dsh-profile.ts`](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/scripts/accept-dsh-profile.ts) |
| 打包 bundle 校验 | [`scripts/verify-bundle.ts`](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/scripts/verify-bundle.ts) |

先运行聚焦门禁，再运行发行门禁：

~~~powershell
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
~~~

`accept:dsh` 会创建隔离的 `DSH_HOME`，通过固定版本 source DSH CLI 安装打包 tarball，启动已安装的 ToolRuntime，检查审批与陈旧 revision 行为、仅规划作业、research fail-closed，以及图表/Slidev capability surface；记录证据后删除临时 profile 与 fixture workspace。

新增 capability 时，应同时定义 service contract、provider 与 consumer。面向模型的行为通过 `ctx.tools` 注册，使用 DSH 的 `llm`/`web`/`subprocess` seam，不创建私有 transport，并增加真实安装产物的验收断言。可选 executable 必须显式表达：缺失是 capability 结果，不能变成格式替换。

## 发布

公共 npm 包为无 scope、public package。维护者应只发布通过安装态 profile 验收的同一个 tarball：

~~~powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm accept:dsh
npm publish ./artifacts/dsh-notemd-0.1.1.tgz --access public --registry=https://registry.npmjs.org/
~~~

包内发布的 `README.md` 是 npm canonical README。同一份中文文档会以 `docs/README.zh-CN.md` 发布，并继续由 canonical 文档链接；它不放在包根目录，以避免 npm 把它选为 `readmeFilename`。

维护者账号启用 npm 2FA 时，`npm publish` 可能暂停等待 OTP；普通使用者不需要维护者的 npm 登录或 OTP。

发布后验证 registry 元数据：

~~~powershell
npm view dsh-notemd version --registry=https://registry.npmjs.org/
npm view dsh-notemd@0.1.1 readmeFilename --registry=https://registry.npmjs.org/
~~~

预期值是 `0.1.1` 与 `README.md`。

## 文档与外部契约

主页只保留可执行的使用与开发信息；架构与验收证据放在仓库双语文档中：

- [架构规范（English）](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.md) · [中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/specs/2026-08-15-dsh-notemd-full-migration-architecture.zh-CN.md)
- [验收证据（English）](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.md) · [中文](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.zh-CN.md)
- [DeepSeek Harness architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [DeepSeek Harness development guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/development.md)
- [DeepSeek Harness capability seams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md)
- [DeepSeek Harness testing policy](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/testing.md)
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)

## 状态

本仓库是 developer-preview bundle。公共契约是打包 tarball 与最终生效的 DSH profile patch，不是 Obsidian plugin API。DSH 仍处于 1.0 之前，后续版本可能需要兼容性更新。
