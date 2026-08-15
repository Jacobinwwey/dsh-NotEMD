# DSH NoteMD 全量迁移实施计划

> English version: [2026-08-15-dsh-notemd-full-migration.md](2026-08-15-dsh-notemd-full-migration.md)

> **面向执行 Agent：** 必须在当前会话逐任务使用 `superpowers:executing-plans`。本计划禁止委派子代理。

**目标：** 将范围内全部非 Obsidian 宿主的 NoteMD 行为契约交付为可独立运行的 DeepSeek Harness bundle，默认使用 DSH 管理的 LLM/Web，提供可恢复的工作区变更和真实的渲染/导出 provider。

**架构：** 保留已有的读取、审批、作业和增量索引基础，但以 journaled mutation protocol 替换纯文本写入路径。所有领域变换在产生可审查的 mutation proposal 前保持纯粹；LLM/Web 通过 DSH service seam 接入，格式保真或进程安全语义不同的目标使用具名 renderer provider。

**技术栈：** Node.js `>=22.19.0`、pnpm `10.7.1`、TypeScript strict、Vitest、Cordis、DSH LLM/Web/Tool service、MiniSearch、Markdown AST 工具，以及可选的 Slidev/Playwright/FFmpeg/Tectonic/Draw.io runtime。

## 全局约束

- `E:/convert/undo/obsidian-NoteMD_new` 的 `4168a51` 和 `ref/deepseek-harness` 的 `47f9438` 只读。
- 不迁移 Obsidian UI、编辑器选择、命令、modal、设置、直连 endpoint/key 配置，亦不迁移当前未提交的 Drawnix WIP。
- 默认模型与联网路径只能是 `ctx.llm` 与 `ctx.web`。OpenAI-compatible adapter 仅作为显式加载的 legacy adapter。
- 规划、审批、应用必须是分离的具名操作；禁止 `dryRun` flag 和 `notemd_run(type, options)`。
- 外部进程必须在 staging 以 allowlisted executable 和 argument vector 运行，禁止 shell，禁止直接写工作区。
- 每个任务后根据实测证据更新中英文进度文档。
- 每次提交前保持 worktree clean。远程为 `git@github.com:Jacobinwwey/dsh-NotEMD.git`；本计划不重命名 npm 包。

## 目标包图

```text
notemd-vault                 只读工作区事实
notemd-mutation              plan、staged asset、receipt、mutation contract
notemd-vault-local           本地 journal、锁、恢复、executor
notemd-llm-dsh               ctx.llm consumer bridge
notemd-research              ctx.web consumer 与持久 evidence
notemd-documents             AST 变换与稳定锚点
notemd-knowledge             scoped section retrieval 与 explanation
notemd-artifacts             DiagramSpec 与 artifact lineage
notemd-render-*              具名 SVG 或外部目标 provider
notemd-process               allowlisted、staging-only process contract
notemd-workflows             产生 proposal 的编排层
notemd-jobs                  持久规划与 checkpoint 编排
notemd-tools                 closed-schema 的具名 DSH 操作
notemd-bundle                Cordis service、schema config、bundle patch
```

### Task 1：冻结源行为契约

**文件：**
- 新建：`fixtures/migration/source-operation-matrix.json`
- 新建：`fixtures/migration/notes/`
- 新建：`packages/notemd-workflows/test/source-contracts.test.ts`
- 新建：`packages/notemd-artifacts/test/source-artifact-contracts.test.ts`
- 修改：两份 `docs/walkthroughs/2026-08-15-dsh-notemd-migration-progress.*.md`

- [x] 已提取源 registry 的 29 个 operation ID。矩阵含 18 个 `included` 与 11 个 `excluded-by-design` operation 行；只有四个固定的 Drawnix 工作树路径属于 `excluded-wip`。
- [x] 已固化 14 个确定性 fixture，覆盖章节拆分、原文抽取、链接、标题、翻译、概念、去重、公式、Mermaid、本地检索、图表 source 与 slide source preparation。
- [x] 已固定输入和 artifact 的 SHA-256，并断言 output schema、目标路径、citation、mutation precondition 与 artifact lineage，未对生成性 prose 做逐字快照。
- [x] 已断言完整的 included-fixture 覆盖、排除理由、精确 fixture 集合与精确 Drawnix WIP 隔离集合。
- [x] 已运行 focused source-contract 测试、完整 Vitest 与 strict TypeScript build verification。
- [x] 已在两份进度文档记录源提交、fixture 数、排除项和测试证据；提交 `test: characterize NotEMD migration behavior`。

### Task 2：引入类型化工作区 Mutation Proposal

**文件：**
- 新建：`packages/notemd-mutation/{package.json,tsconfig.json}`
- 新建：`packages/notemd-mutation/src/{mutation-plan.ts,staged-asset.ts,mutation-receipt.ts,index.ts}`
- 新建：`packages/notemd-mutation/test/mutation-plan.test.ts`
- 修改：`pnpm-workspace.yaml`、根 `package.json`、`pnpm-lock.yaml`

**核心接口：**

```ts
type WorkspaceMutation = WriteTextMutation | WriteBytesMutation | DeleteMutation

interface WorkspaceMutationPlan {
  readonly version: 1
  readonly id: string
  readonly digest: string
  readonly provenance: MutationProvenance
  readonly mutations: readonly WorkspaceMutation[]
}

interface WorkspaceMutationExecutor {
  apply(plan: WorkspaceMutationPlan, signal?: AbortSignal): Promise<WorkspaceMutationReceipt>
  recover(signal?: AbortSignal): Promise<readonly RecoveredMutation[]>
}
```

- [x] 已编写并观察到 plan digest、重复 destination、text/bytes digest、empty text payload、malformed JSON boundary value、delete precondition、staged reference、不可变快照和封闭 receipt state 的失败测试。
- [x] 已实现不可变的 discriminated mutation。每个 entry 拥有 destination、expected revision、provenance 与 reject conflict policy；写入变体额外拥有 canonical media type 和 content SHA-256。
- [x] 已实现 `StagedAssetRef`，仅携带 opaque identifier、byte length、media type 和 SHA-256；不含二进制 payload，且不能命名 staging path。
- [x] 已定义封闭 receipt vocabulary：`committed`、`conflict`、`rejected`、`cancelled`、`failed`、`recovered`；receipt entry 只复制 allowlisted metadata，绝不含 secret、prompt、text 或 bytes。
- [x] 已运行 mutation package test、根 project-reference TypeScript build 和 workspace test gate。
- [x] 已在进度文档记录 mutation boundary 与验证证据；提交 `feat: add typed workspace mutation proposals`。

### Task 3：实现本地 Journaled Mutation Executor

**文件：**
- 新建：`packages/notemd-vault-local/src/{local-mutation-executor.ts,local-mutation-journal.ts,staged-asset-store.ts}`
- 新建：`packages/notemd-vault-local/test/local-mutation-executor.test.ts`
- 修改：`packages/notemd-vault-local/src/{local-vault.ts,write-lock.ts,index.ts}` 与 `package.json`

**状态机：**

```text
prepared -> staged -> applying -> verified -> committed
prepared | staged | applying -> recovering -> committed | rolled-back | failed
```

- [ ] 针对每个状态转换注入崩溃；覆盖同目标冲突、规范锁顺序、路径逃逸、symlink/junction 复检、二进制写、quarantine delete、陈旧修订和幂等恢复。
- [ ] 在 `<workspace>/.notemd/staging/<plan-id>/` 保存资产，在 `<workspace>/.notemd/mutations/` 保存 journal；二者均排除 Markdown 索引。
- [ ] 先按规范顺序锁定全部目标，再检查修订；写入用同卷临时替换，删除在 commit cleanup 前使用可恢复 quarantine move。
- [ ] 替换后重算 SHA-256；平台支持时 fsync journal；失败留下可诊断状态。
- [ ] 调用方迁移后才移除 `LocalVault.apply(WritePlan)`，不能长期保留第二个公开 mutation path。
- [ ] 运行本地 vault 测试与 `rtk tsc`，更新进度并提交 `feat: journal local workspace mutations`。

### Task 4：将审批、事件、作业和 Tools 迁移到 Mutation Receipt

**文件：**
- 修改：`packages/notemd-tools/src/{write-tools.ts,approval-ledger.ts,notemd-services.ts,tool-contract.ts}`
- 修改：`packages/notemd-tools/test/{approval-ledger.test.ts,tools.contract.test.ts}`
- 修改：`packages/notemd-workspace-events/src/workspace-change-coordinator.ts`
- 修改：`packages/notemd-jobs/src/file-job-store.ts`
- 修改：`packages/notemd-bundle/src/{approval.ts,vault-local.ts,workspace-changes.ts,tools.ts}`

- [ ] 用逐 Tool 的封闭 schema 替换全局 `objectOutput`；每个结果只能是显式 success、conflict、rejected、unavailable、cancelled、failed 之一。
- [ ] 审批 receipt 绑定完整 mutation-plan digest 和 staged asset digest；过期、已消费或不匹配 receipt 不能进入 executor。
- [ ] 从已核验 mutation receipt 发布 workspace event，包含 delete；event 只带元数据，知识同步器必须重新读取文件。
- [ ] job checkpoint 保存 proposal id/digest 与 evidence reference；job 不能申请审批或应用 mutation。
- [ ] 测试 stale plan、staged asset 替换和 rejected delete 均不发布可索引变更。
- [ ] 运行 tools/events/jobs 测试与 typecheck，更新进度并提交 `refactor: route NoteMD writes through mutation receipts`。

### Task 5：以 DSH Consumer Bridge 替换默认 LLM Adapter

**文件：**
- 新建：`packages/notemd-llm-dsh/{package.json,tsconfig.json}`
- 新建：`packages/notemd-llm-dsh/src/{dsh-text-transformer.ts,index.ts}`
- 新建：`packages/notemd-llm-dsh/test/dsh-text-transformer.test.ts`
- 修改：`packages/notemd-bundle/src/{llm.ts,runtime-adapter.ts}`、`packages/notemd-bundle/cordis.patch.yml`、`profiles/notemd/cordis.patch.yml`、`packages/notemd-bundle/package.json`

**核心接口：**

```ts
interface NotemdLlmRoute {
  readonly provider: string
  readonly model: string
  readonly maxTokens?: number
}
```

- [ ] 显式 `inject: ['llm']`，用 DSH `StreamChunk` 组装文本；terminal error/aborted 转为 provider-neutral NoteMD error。
- [ ] route policy 只含 provider、model、output limit、prompt policy identifier；禁止 endpoint、API key、header、transport retry、model discovery。
- [ ] OpenAI-compatible 诊断/发现移入不出现在默认 patch 的独立 legacy plugin entry。
- [ ] 测试文本组装、usage 顺序、取消、异常 stream、route 选择和 HMR disposal。
- [ ] 运行 llm-dsh/bundle 测试与 typecheck，更新进度并提交 `feat: consume DSH LLM routes by default`。

### Task 6：通过 `ctx.web` 增加 Native Research Evidence

**文件：**
- 新建：`packages/notemd-research/{package.json,tsconfig.json}`
- 新建：`packages/notemd-research/src/{research-evidence.ts,dsh-research-client.ts,index.ts}`
- 新建：`packages/notemd-research/test/dsh-research-client.test.ts`
- 修改：`packages/notemd-workflows/src/index.ts`、`packages/notemd-bundle/src/{workflows.ts,tools.ts}`、`packages/notemd-tools/src/plan-tools.ts`

- [ ] 分离具名的 research discovery 与 research synthesis。synthesis 只消费 durable evidence id，不能消费未追踪的任意字符串。
- [ ] 用 `ctx.web.search()` 获取有限结果，再对选定来源使用 `ctx.web.fetch()`；保存 final URL、status、body kind、truncation 与 digest。
- [ ] DSH provider 缺失/歧义和不支持 PDF 时返回 `capability-unavailable`，不得重新引入 DuckDuckGo、Tavily 或 raw HTTP fallback。
- [ ] 测试 provider 选择错误、非 2xx fetch、截断、citation 对齐、evidence digest 变化和取消。
- [ ] 运行 research 测试和 typecheck，更新进度并提交 `feat: add DSH web research evidence`。

### Task 7：恢复文档语义与可解释知识检索

**文件：**
- 新建：`packages/notemd-documents/{package.json,src/markdown-document.ts,src/chapter-split.ts,src/original-text.ts,src/duplicate-reconciliation.ts}`
- 新建：`packages/notemd-documents/test/{chapter-split.test.ts,original-text.test.ts}`
- 修改：`packages/notemd-knowledge/src/{knowledge-index.ts,incremental-knowledge-synchronizer.ts}`
- 修改：`packages/notemd-workflows/src/{index.ts,plan-factory.ts}`、`packages/notemd-jobs/src/durable-workflow-runner.ts`

- [ ] 引入 AST-derived section、稳定 anchor、title/breadcrumb、text/search projection、source digest，供章节、知识与链接/概念复用。
- [ ] 章节拆分生成一个同时包含 writes 和 stale deletes 的 mutation proposal，带 manifest ownership 和手工编辑摘要冲突检测。
- [ ] 原文抽取拆为 `planOriginalTextExtraction` 与 `planMergedOriginalTextExtraction`，不能用 merged-mode flag。
- [ ] 增加确定性 folder selector、output-location policy 和具名 batch workflow，覆盖标题、翻译、链接、概念、去重、公式、Mermaid、章节和原文抽取。
- [ ] 恢复 task root、section window、top-k、current-file exclusion、hit explanation 与 citation metadata；索引必须可重建。
- [ ] 运行文档/工作流/知识测试与 typecheck，更新进度并提交 `feat: restore NoteMD document and knowledge semantics`。

### Task 8：建立 Diagram Spec、Artifact Lineage 与 SVG 目标 Renderer

**文件：**
- 修改：`packages/notemd-artifacts/src/{diagram-spec.ts,artifact-manifest.ts}`
- 新建：`packages/notemd-artifacts/src/svg-sanitizer.ts`、`packages/notemd-artifacts/test/svg-sanitizer.test.ts`
- 新建：`packages/notemd-render-{mermaid,vega-lite,json-canvas,html,editable-svg}/`
- 修改：`packages/notemd-bundle/src/artifacts.ts`、`packages/notemd-tools/src/artifact-tools.ts`

- [ ] `DiagramSpec` 按 canonical target source 使用 versioned discriminated contract，保存 structured graph/chart/circuit input、evidence ref、source revision、prompt/model provenance、renderer intent。
- [ ] source、preview、export 分别记录 MIME、SHA-256、parent artifact id、renderer/theme/font fingerprint 以及 `ready`/`unavailable`/`failed`。
- [ ] 实现具名 SVG-capable renderer；JSON Canvas 的 SVG 仅是标注清楚的 projection，不能替换 `.canvas`。
- [ ] 清洗持久化 SVG，测试 script、event attribute、remote URL、JavaScript link 与危险 data URL 被删除。
- [ ] 每个 target 一个具名 Tool，artifact 规划和应用分离，禁止 target selector 参数。
- [ ] 运行 renderer/artifact 测试、typecheck、pack，更新进度并提交 `feat: add artifact lineage and SVG-capable renderers`。

### Task 9：增加 Process-Gated Draw.io、稳定 Drawnix、Circuitikz Provider

**文件：**
- 新建：`packages/notemd-process/{package.json,src/allowlisted-process.ts,test/allowlisted-process.test.ts}`
- 新建：`packages/notemd-render-{drawio,drawnix,circuitikz}/`
- 修改：`packages/notemd-bundle/{cordis.patch.yml,src/artifacts.ts}`

- [ ] 为 Draw.io、Tectonic、PDF/PNG conversion、稳定 Drawnix 定义 command profile，在 provider 边界校验 executable identity、固定参数构造、output root、timeout、byte budget、环境 allowlist。
- [ ] 只迁移已提交的 Drawnix 行为。排除 `drawnixCrossRootRouter.ts`、`drawnixMindMapProjection.ts`、`drawnixRelationLaneLayout.ts`、其关联改动和未跟踪 fixture，直至未来源提交被固定。
- [ ] Draw.io XML、Drawnix source、Circuitikz `.tex` 为 canonical source，preview/export 只能经具名 provider 生成。
- [ ] 测试缺 executable、非零退出、坏输出、output path escape、timeout、取消以及 source/preview digest lineage。
- [ ] 在 Windows 运行 provider 测试，在未安装 optional binary 环境运行 unavailable 测试；更新进度并提交 `feat: add guarded specialist diagram providers`。

### Task 10：增加 Slidev 与媒体导出 Provider

**文件：**
- 新建：`packages/notemd-export-{slidev,pptx,media}/`
- 新建：`fixtures/migration/slides/` 下的 fixture deck
- 修改：`packages/notemd-artifacts/src/artifact-manifest.ts`、`packages/notemd-tools/src/artifact-tools.ts`、`packages/notemd-bundle/cordis.patch.yml`

- [ ] 先迁移 Slidev source preparation/layout validation，再调用进程；prepared Markdown 与 layout report 是 canonical artifact。
- [ ] HTML、PDF、PNG、PPTX、MP4 各自有具名 provider；SVG 绝不代替 PPTX 或 MP4。
- [ ] Slidev/Playwright/FFmpeg 全部在 staging 运行，返回 digest-verified staged asset，之后才允许审批门控 materialization。
- [ ] 测试每种输出的缺依赖路径、runtime 存在时的 fixture export、大小限制、清理和从 canonical source 重现。
- [ ] 更新进度并提交 `feat: add staged Slidev export providers`。

### Task 11：Conformance、HMR、文档与 Mainline 发布

**文件：**
- 修改：`scripts/{accept-dsh-profile.ts,verify-bundle.ts}`、`README.md`、`README.zh-CN.md`
- 修改：完整迁移架构、计划、进度的中英文文档对
- 新建：`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.{md,zh-CN.md}`

- [ ] 增加消费 `fixtures/migration/source-operation-matrix.json` 的 conformance test；任何 included capability 缺少 passing fixture 均失败。
- [ ] 测试依赖移除/重加、HMR dispose、timer/process/staging cleanup order、profile config replacement、`ctx.llm` route failure、`ctx.web` provider ambiguity、clean-profile 安装。
- [ ] 执行完整 release gate：

```powershell
rtk tsc
rtk lint
rtk proxy pnpm.cmd test
rtk proxy pnpm.cmd test:coverage
rtk proxy pnpm.cmd build
rtk proxy pnpm.cmd pack:bundle
rtk proxy pnpm.cmd verify:bundle
rtk proxy pnpm.cmd accept:dsh
rtk proxy git diff --check
```

- [ ] 每个已验证 phase 后更新双语进度文档；写入含精确命令证据、环境 provider 限制的双语 validation walkthrough。
- [ ] 确认 `main` 最新，将 `origin` 改为 `git@github.com:Jacobinwwey/dsh-NotEMD.git`，拉取远程 `main`，必要时 rebase，创建非强制提交并推送，最后运行 `rtk git status --short --branch` 证明 worktree clean。

## 计划复核

- 覆盖：Task 1-4 建立唯一安全 mutation path；Task 5-7 恢复 DSH-native 语义工作流；Task 8-10 完成 renderer/export 对齐；Task 11 证明并发布结果。
- 失败模型：fixture mismatch、DSH provider 缺失、renderer 缺失、陈旧修订和恢复转换均为显式测试，禁止隐藏 fallback。
- 范围控制：源 host UI、DSH Provider 配置、当前 Drawnix WIP 始终不进入 conformance matrix。
