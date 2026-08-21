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
- 每次提交前保持 worktree clean。远程为 `git@github.com:Jacobinwwey/dsh-NotEMD.git`；公开 npm 标识为 `dsh-notemd`（npm 包名必须使用小写）。

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

- [x] 已为每个持久化状态转换编写崩溃注入测试，覆盖同目标冲突、规范锁、路径逃逸、symlink/junction 复检、二进制写、quarantine delete、陈旧修订、重试保护、取消、staging 完整性、外部改写保护和幂等恢复。
- [x] plan payload 保存在 `<workspace>/.notemd/staging/<plan-id>/`，opaque asset 保存在 `.notemd/staging/assets/`，content-free journal 保存在 `<workspace>/.notemd/mutations/`；`.notemd` 仍被 Markdown 索引排除，空闲 executor 构造不再创建工作区状态。
- [x] 已在 preflight 前按规范字典序获取锁，并与 legacy `LocalVault` 路径共享。写入使用同卷 staged replacement；删除在核验 commit 前使用可恢复 quarantine move。
- [x] 替换后重算 SHA-256，journal 替换前 fsync 文件内容，以已记录 digest 保护 backup/quarantine 数据，失败保留可诊断 journal state，并在 terminal mutation state 后单独记录 cleanup-completion fact。
- [x] `LocalVault.apply(WritePlan)` 仅作为临时兼容 surface 保留。`applyMutationPlan()` 与 `recoverIncompleteMutationPlans()` 共享其 target lock；调用方迁移和 legacy public write path 的移除归 Task 4 负责。
- [x] 已在 Windows 运行 `rtk proxy pnpm.cmd --filter @notemd-harness/vault-local test`、`pnpm typecheck` 与 `pnpm lint`。
- [x] 已用恢复证据更新成对进度文档。本阶段提交为 `feat: journal local workspace mutations`。

### Task 4：将审批、事件、作业和 Tools 迁移到 Mutation Receipt

**文件：**
- 修改：`packages/notemd-tools/src/{write-tools.ts,approval-ledger.ts,notemd-services.ts,tool-contract.ts}`
- 修改：`packages/notemd-tools/test/{approval-ledger.test.ts,tools.contract.test.ts}`
- 修改：`packages/notemd-workspace-events/src/workspace-change-coordinator.ts`
- 修改：`packages/notemd-jobs/src/file-job-store.ts`
- 修改：`packages/notemd-bundle/src/{approval.ts,vault-local.ts,workspace-changes.ts,tools.ts}`

- [x] 已用逐 Tool 的封闭 DSH author schema 替换全局 `objectOutput`。必填输出字段使用属性级 `required: true`，可通过真实 `defineTool()` 编译；每个结果都有显式 success、conflict、rejected、unavailable、cancelled 或 failed 变体。
- [x] approval receipt 已绑定 canonical mutation-plan digest 和排序后的 staged-asset digest。过期、已消费、畸形或不匹配 receipt 均不会调用 executor。
- [x] workspace change 只从匹配的 committed mutation receipt 发布，包含仅元数据的 delete；rejected、conflict、cancelled、failed 或不一致 receipt 均不发布可索引 event，知识同步器会重新读取变更的 Markdown。
- [x] durable checkpoint 只保存 proposal id、proposal digest 与 evidence reference。规划 job 可以产生 proposal，但没有申请审批或应用 mutation 的权限。
- [x] 已增加 Tool contract 覆盖 stale proposal、staged-asset substitution、rejected delete、unavailable/rejected/cancelled approval decision 与 invalid approval consumption；legacy 测试和 clean-profile runner 已从 `WritePlan` 迁移到 mutation plan/receipt 语义。
- [x] 已运行 strict typecheck、lint、完整 Vitest（21 文件、97 测试）、build、packed-bundle verification 与 clean DSH-profile acceptance。package boundary 现排除 stale build output、source map、build-info 和非分发 mutation 内容。
- [x] 已更新成对进度文档，并准备阶段提交 `refactor: route NoteMD writes through mutation receipts`。

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

- [x] 显式注入 `llm`。`DshTextTransformer` 组装 DSH `StreamChunk` text block，并将 terminal error/aborted 映射为 provider-neutral NoteMD failure。
- [x] 将 route policy 封闭为 provider、model、`maxTokens` 与 `promptPolicyId`；运行时校验会拒绝未知 legacy transport field，而非静默丢弃。
- [x] 将 OpenAI-compatible diagnostic/discovery 移至显式 `./llm-openai-compatible-legacy` entry；它不出现在默认 patch。
- [x] 已测试 text assembly、usage、cancellation、malformed/post-terminal stream、route selection 与 owner disposal of active consumer。
- [x] 已在 Node `v22.19.0` / pnpm `10.7.1` 上运行 strict TypeScript、完整 Vitest（22 files、109 tests）、ESLint、package build、bundle pack/verify 与 clean DSH-profile acceptance。
- [x] 已更新成对 progress record，并以 `feat: consume DSH LLM routes by default` 提交 Task 5。

### Task 6：通过 `ctx.web` 增加 Native Research Evidence

**文件：**
- 新建：`packages/notemd-research/{package.json,tsconfig.json}`
- 新建：`packages/notemd-research/src/{research-evidence.ts,dsh-research-client.ts,index.ts}`
- 新建：`packages/notemd-research/test/dsh-research-client.test.ts`
- 新建：`packages/notemd-tools/src/research-tools.ts`、`packages/notemd-bundle/src/research.ts`
- 修改：`packages/notemd-workflows/src/index.ts`、`packages/notemd-jobs/{package.json,tsconfig.json}`、`packages/notemd-bundle/src/{jobs.ts,workflows.ts,harness-types.d.ts,index.ts,tools.ts}`
- 修改：`packages/notemd-tools/src/{index.ts,notemd-services.ts,plan-tools.ts,job-tools.ts}`、包 manifest、project reference、Cordis patch、bundle verification/acceptance script

- [x] 已实现具名 discovery、evidence capture 和 synthesis 操作。synthesis 经 `notemdResearch` 解析 durable evidence id；Tool 与 durable job 均不再接收任意 source passage。
- [x] `DshResearchClient` 只调用有上限的 `ctx.web.search()`，再调用选定来源的 `ctx.web.fetch()`。catalog 在 `.notemd/research` 持久化 final URL、非 2xx status、body kind、truncation、digest、retrieval time 与对齐 citation。
- [x] 缺失/歧义 DSH Web provider 和不支持的 body kind 均映射为 `capability-unavailable`；没有增加 DuckDuckGo、Tavily、raw HTTP 或 transport fallback。Tool output 仅暴露 evidence metadata，不暴露 fetched body text。
- [x] 已增加 provider-selection、非 2xx 保留、truncation、citation 对齐、evidence identity、cancellation、closed schema、durable-job input、packed bundle 与 clean-profile acceptance 覆盖。
- [x] 已运行 focused research/workflow/Tool/bundle 测试、strict TypeScript、完整 Vitest、ESLint、build、packed-bundle verification 与 clean DSH-profile acceptance。
- [x] 已用实测 Task 6 证据更新成对 progress record。

### Task 7：恢复文档语义与可解释知识检索

**文件：**
- 新建：`packages/notemd-documents/{package.json,src/markdown-document.ts,src/chapter-split.ts,src/original-text.ts,src/duplicate-reconciliation.ts}`
- 新建：`packages/notemd-documents/test/{chapter-split.test.ts,original-text.test.ts}`
- 修改：`packages/notemd-knowledge/src/{knowledge-index.ts,incremental-knowledge-synchronizer.ts}`
- 修改：`packages/notemd-workflows/src/{index.ts,plan-factory.ts}`、`packages/notemd-jobs/src/durable-workflow-runner.ts`

- [x] 已引入结构化 Markdown section、稳定 anchor、title/breadcrumb、text/search projection 与 source digest。章节规划、知识检索、wiki-link prompt 和 concept prompt 共用该语义表示。
- [x] 已实现单一章节 mutation proposal，包含 chapter/TOC/manifest writes 与 stale delete。manifest 记录 content hash；受管文件被手工修改或输出位置存在非受管文件时，规划会拒绝而非覆盖。
- [x] 已实现独立的 `planOriginalTextExtraction` 和 `planMergedOriginalTextExtraction`，包含对应的具名 folder workflow 和 Tool；不存在选择行为的 merged-mode flag。
- [x] 已增加按字典序固化的 folder target snapshot、output-location policy object 和具名 batch workflow，覆盖 title、translation、link、concept、formula/Mermaid repair、chapter 及两种 original-text extraction；durable job target 也以规范字典序持久化。
- [x] 已恢复可重建的 section-level local knowledge：task root、section window、top-k、current-file exclusion、hit explanation 与 `citation:<path>#<anchor>` metadata。
- [x] 已运行 focused documents/workflow/knowledge/Tool/durable-job 测试；在 Node `v22.19.0` / pnpm `10.7.1` 上，完整 `pnpm test`（26 files、132 tests）、`pnpm typecheck`、`pnpm lint`、`pnpm build`、`pnpm pack:bundle`、`pnpm verify:bundle` 与 `pnpm accept:dsh` 均通过。
- [x] 已更新双语进度记录；本阶段提交为 `feat: restore NoteMD document and knowledge semantics`。

### Task 8：建立 Diagram Spec、Artifact Lineage 与 SVG 目标 Renderer

**文件：**
- 修改：`packages/notemd-artifacts/src/{diagram-spec.ts,artifact-manifest.ts}`
- 新建：`packages/notemd-artifacts/src/svg-sanitizer.ts`、`packages/notemd-artifacts/test/svg-sanitizer.test.ts`
- 新建：`packages/notemd-render-{mermaid,vega-lite,json-canvas,html,editable-svg}/`
- 修改：`packages/notemd-bundle/src/artifacts.ts`、`packages/notemd-tools/src/artifact-tools.ts`

- [x] `DiagramSpec` 已按 canonical target source 使用 versioned discriminated contract，保存 structured graph/chart/circuit input、evidence ref、source revision、prompt/model provenance、renderer intent。
- [x] source、preview、export 已分别记录 MIME、SHA-256、parent artifact id、renderer/theme/font fingerprint 以及 `ready`/`unavailable`/`failed`。
- [x] 已实现具名 SVG-capable renderer；JSON Canvas 的 SVG 仅是标注清楚的 projection，不能替换 `.canvas`。
- [x] 已在持久化前清洗 SVG，并验证 script、event attribute、remote URL、JavaScript link 与危险 data URL 被删除。
- [x] 每个渲染 target 均有具名 planning/status Tool；artifact 规划仍与既有 approval-gated application Tool 分离，且没有 target selector 参数。
- [x] 已运行 renderer/artifact 测试、严格 TypeScript、lint、全量测试、bundle 打包/校验与 clean-profile DSH 验收。
- [x] 已更新配对进度记录并提交 `feat: add artifact lineage and SVG-capable renderers`。

### Task 9：增加 Process-Gated Draw.io、稳定 Drawnix、Circuitikz Provider

**文件：**
- 新建：`packages/notemd-process/{package.json,src/allowlisted-process.ts,test/allowlisted-process.test.ts}`
- 新建：`packages/notemd-render-{drawio,drawnix,circuitikz}/`
- 修改：`packages/notemd-bundle/{cordis.patch.yml,src/artifacts.ts}`

- [x] 为 Draw.io、Tectonic、PDF/PNG conversion、稳定 Drawnix 定义 command profile，在 provider 边界校验 executable identity、固定参数构造、output root、timeout、byte budget、环境 allowlist。
- [x] 只迁移已提交的 Drawnix 行为。排除 `drawnixCrossRootRouter.ts`、`drawnixMindMapProjection.ts`、`drawnixRelationLaneLayout.ts`、其关联改动和未跟踪 fixture，直至未来源提交被固定。
- [x] Draw.io XML、Drawnix source、Circuitikz `.tex` 为 canonical source，preview/export 只能经具名 provider 生成。
- [x] 测试缺 executable、非零退出、坏输出、output path escape、timeout、取消以及 source/preview digest lineage。
- [x] 在 Windows 运行 provider 测试，在未安装 optional binary 环境运行 unavailable 测试；更新进度并提交 `feat: add guarded specialist diagram providers`。

### Task 10：增加 Slidev 与媒体导出 Provider

**文件：**
- 新建：`packages/notemd-export-{slidev,pptx,media}/`
- 新建：`fixtures/migration/slides/` 下的 fixture deck
- 修改：`packages/notemd-artifacts/src/artifact-manifest.ts`、`packages/notemd-tools/src/artifact-tools.ts`、`packages/notemd-bundle/cordis.patch.yml`

- [x] 先迁移 Slidev source preparation/layout validation，再调用进程；prepared Markdown 与 layout report 是 canonical artifact。
- [x] HTML、PDF、PNG、PPTX、MP4 各自有具名 provider；SVG 绝不代替 PPTX 或 MP4。运行时固定为 `github:Jacobinwwey/slidev` fork 的 revision `bbcb2efae709c2ebaa96bda522cd6c192476817c`。
- [x] Slidev/Playwright/FFmpeg 全部在 staging 运行，返回 digest-verified staged asset，之后才允许审批门控 materialization；fork standalone archive 接受 `index-standalone.html`，同时兼容 legacy `index.html`。
- [x] 已测试每种输出的缺依赖路径、fixture-success fake、大小限制、清理、取消/进程失败映射、数字帧顺序和从 canonical source 重现；真实 optional binary 继续按 capability 如实报告。
- [x] 已更新进度并提交 `feat: add staged Slidev export providers`。

### Task 11：Conformance、HMR、文档与 Mainline 发布

**文件：**
- 修改：`scripts/{accept-dsh-profile.ts,verify-bundle.ts}`、`README.md`、`README.zh-CN.md`
- 修改：完整迁移架构、计划、进度的中英文文档对
- 新建：`docs/walkthroughs/2026-08-15-dsh-notemd-full-migration-validation.{md,zh-CN.md}`

- [x] 已增加消费 `fixtures/migration/source-operation-matrix.json` 与 conformance manifest 的测试；任何 included operation fixture 或必需 semantic fixture 缺少可运行的 passing proof 均失败。
- [x] 已测试可移除 optional DSH peer、完整 profile replacement row、Cordis effect dispose、timer/process/staging cleanup order、`ctx.llm` route failure、`ctx.web` provider ambiguity 与 clean-profile 安装。
- [x] 已执行完整 release gate：

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

- [x] 已在每个已验证 phase 后更新双语进度文档，并写入含精确命令证据与环境 provider 限制的双语 validation walkthrough。
- [x] 已确认 `main` 最新，fetch 远程 `main` 且无远端领先提交；`73480df` 已以非强制方式推送到 `origin/main`，并确认推送后 worktree clean。

## 计划复核

- 覆盖：Task 1-4 建立唯一安全 mutation path；Task 5-7 恢复 DSH-native 语义工作流；Task 8-10 完成 renderer/export 对齐；Task 11-12 证明并发布结果。
- 失败模型：fixture mismatch、DSH provider 缺失、renderer 缺失、陈旧修订和恢复转换均为显式测试，禁止隐藏 fallback。
- 范围控制：源 host UI、DSH Provider 配置、当前 Drawnix WIP 始终不进入 conformance matrix。

## 发布后延续计划（2026-08-17）

Task 1-12 已由已发布版本关闭，不重新打开。本节从目标提交 `488378fb6a1429683bf1789f418abca8992bd3a2` 继续执行，source oracle 仍固定为 `4168a51cd19ad8c3d1e05f604b50936255461a31`。

### Phase 12：可执行 Conformance Adapter

- 在 `fixtures/migration`、`packages/notemd-workflows/test` 与 `packages/notemd-artifacts/test` 中，用类型化 fixture adapter 和显式 operation-to-fixture 映射替换自由文本 proof-term 匹配。
- 保留共享语义 fixture 的显式关系；每个 included source operation 至少执行一个映射 adapter；excluded operation 未附 reason 重新进入时必须 fail closed。
- 退出证据：删除映射、跳过 adapter 或改变 fixture digest 时，conformance suite 必须给出 operation ID 和 fixture ID 并失败。
- [x] 已实现 manifest v2，包含 `adapterId`、`sourceOperationIds` 和可执行 `operationIds`；`testPath`/`proofTerms` 不再是 conformance 机制。
- [x] 已增加 14 个临时 workspace adapter，覆盖 19 个 observation，包括 auxiliary `knowledge.retrieve`、真实 workflow/artifact/Slidev source planner 执行、source revision normalization 和 `finally` 清理。
- [x] 已根据源行为纠正 fixture contract：chapter `_chapters` ownership、`_Extracted` original-text output、language-folder translation、content-addressed artifact lineage、source binding 和 operation-specific duplicate schema。
- [x] 退出 gate 已通过：focused conformance 1 文件/2 测试；完整 Vitest 48 文件/185 测试；statement 77.63%、branch 72.35%、function 85.33%；typecheck、lint、build、bundle verification、clean DSH acceptance 和 diff check 均通过。

### Phase 13：真实 Optional Runtime Capability Lane

- 增加固定 `github:Jacobinwwey/slidev` fork、Playwright、FFmpeg、Draw.io、Tectonic 与稳定 Drawnix adapter 的 opt-in 通道；这些 binary 不能成为 core install 依赖。
- 为每个 capability 记录 executable fingerprint、原生输出 digest、staging 清理、取消行为和有意缺失时的 unavailable 结果。
- 退出证据：每个已安装 capability 都能从确定性 fixture 产生原生工件；移除 executable 时只返回 `unavailable`，不削弱 portable-core gate。
- [x] 已增加 `@notemd-harness/process` 的 PDF-to-SVG/PDF-to-PNG capability profile，以及覆盖 fork、specialist exporter 和 cancellation 的 opt-in `capability:lane` script。
- [x] 可用时 fingerprint 对 executable bytes 做 hash；仅 deterministic fake runtime 无实际文件时才回退到 resolved path；每个 observation 都记录 native output digest。
- [x] Windows lane 实测 `pdftocairo` 产生 ready PDF-to-SVG（`2f74b912...`）与 PDF-to-PNG（`f2279ebd...`）；Draw.io、Tectonic、Drawnix、Slidev/Playwright 和 FFmpeg 缺失路径保持 `unavailable`。
- [x] Slidev manifest 在结果 ready 前强制校验 fork；本次为 `slidev-fork-unverified`。取消探针返回 `process-cancelled`，staging cleanup 成功完成。
- [x] focused gate 通过：`typecheck`、`lint`、2 files/15 tests、capability lane 与 `git diff --check`。strict native availability 仍为 opt-in，不削弱 portable-core acceptance。

### Phase 14：工件 Schema Registry 与迁移策略

- 在 `packages/notemd-artifacts` 建立 family discriminator 与 registry，明确 DiagramSpec/diagram lineage `v2` 和 document export manifest `v3` 的归属。
- 在外部 consumer 依赖 manifest 前，定义未知 family/version 拒绝、前向兼容 metadata 规则和迁移工具。
- 退出证据：packed-bundle verification 接受合法 v2/v3 工件，并以结构化诊断拒绝未知组合。
- [x] 为 `diagram-spec@2`、`diagram-lineage@2` 与 `document-export@3` 增加 `schemaFamily` discriminator；生成的 manifest 和 source validator 现在强制闭合的 family/version 组合。
- [x] 增加 `artifactSchemaRegistry`、`inspectArtifactSchema` 与 `assertArtifactSchema`。未知 family、未知 version、已知但非法组合、缺失 family/version 和坏 metadata 均返回带稳定 code 的结构化 diagnostic。
- [x] 前向兼容字段只能放在 JSON-safe `metadata` 对象内；payload validator 仍拒绝不支持的 top-level field。`ArtifactSchemaError`、`DiagramSpecError` 与 `ArtifactManifestError` 会保留 diagnostic。
- [x] schemaFamily 进入 canonical spec identity 后，已更新 diagram fixture 的 content-addressed 路径（`9a9e...` -> `ff9a...`）；conformance 通过 1 文件/2 测试。
- [x] focused registry/artifact gate 通过 17 files/38 tests，typecheck 与 lint 通过。packed-bundle verifier 现在加载打包后的 registry，接受三个合法 fixture，并以 `invalid-combination` 拒绝 `diagram-spec@3`。

### Phase 15：Workspace Operation 加固（当前 single-process contract 已实现）

- 只有多进程部署成为要求时，才在明确的 single-process guard 与 durable workspace lease/job backend 之间做选择；逐目标文件锁不是调度语义。
- 增加生命周期诊断、恢复计数和 cleanup-health fact，不预先引入数据库。
- 退出证据：并发进程要么被明确诊断拒绝，要么由经过测试的 lease 串行化；不得静默重复 model planning。
- [x] 根据当前部署契约选择显式 single-process guard；没有引入 SQLite 或 distributed lease。
- [x] `WorkspaceOwnershipGuard` 拥有 `.notemd/runtime/workspace-owner.json`、allowlisted metadata（`pid`、process start token、workspace root、owner revision、heartbeat、recovery count）、exclusive create、heartbeat、owner-matched release 与 cleanup-health fact。
- [x] live owner 返回 `workspace-process-already-owned`；坏或不可读 lock metadata fail closed。自动恢复要求 PID dead 且 heartbeat 过期，然后增加 durable recovery counter 并记录 recovered owner revision。
- [x] `NotemdVaultLocalService` 在 `LocalVault.open()` 前 acquire guard，并通过 Cordis effect release；vault open 失败时先释放 guard 再传播错误。
- [x] focused 证据通过：ownership tests 5/5，既有 local-vault/mutation tests 26/26，typecheck、lint 与 bundle lifecycle boundary 检查均通过。除非需要 durable lease，多进程串行化仍明确不在范围内。

### Phase 16：Source Intake 与 Drawnix Review

- 在消费 `4168a51` 之后的任何变化前，先固定新的 source commit，并相对现有 matrix 比较 registry ID、语义 fixture 和 output policy。
- 分别分类 diagram-gallery、response-cache、render-target 与 Drawnix 变更。每条当前 Drawnix WIP 路径都绑定到已提交 source contract 前保持排除。
- 退出证据：新的 source lock 与 matrix/fixture 更新必须同批落盘后才能实现；被拒绝的 WIP 继续被命名并隔离。
- [x] 固定候选 source commit `cdf580c6c876190ecc1040caea08e5ba5bee004f`，并在 `fixtures/migration/source-intake-lock.json` 记录其 dirty checkout 状态。
- [x] 确认 29 个 operation ID 未变化、迁移 fixture hash 没有漂移，且只有一个 Drawnix-only schema 被移除；在不推进 behavior contract commit 的前提下，从 `source-operation-matrix.json` 链接 intake lock。
- [x] 分别分类 diagram-gallery、response-cache、render-target 和 Mermaid normalization 变化。Provider cache 与 host preview/gallery 行为因 DSH/Obsidian 边界被拒绝；Mermaid normalization 仅作为后续候选接受。
- [x] 在 quarantine 记录中逐项列出已提交和 dirty 的 Drawnix 路径。dirty checkout 中没有任何 source implementation 或 fixture 进入 bundle。
- [x] intake 聚焦关口通过：typed source-intake lock test、migration conformance test、typecheck、lint 与 `git diff --check`。
- [x] Phase 15/16 完整 release gate 通过：Vitest 52 files/203 tests，coverage statement 77.68%/branch 73.00%/function 85.21%，build、packed-bundle verification、clean DSH acceptance 与最终 `git diff --check` 均通过。

### Phase 17：远端 main parity review（2026-08-18）

本阶段是审计与 source-intake 重置，不会把 source-main 行为静默提升为 bundle 能力。

#### 比对锁定

- 目标：`notemd-deepseek-harness` 的 `92479bc`（`main` 与 `origin/main`），工作区 clean。
- 源 oracle：`obsidian-NoteMD_new` 的 `6097ff1`（`origin/main`），相对旧行为契约基线 `4168a51cd19ad8c3d1e05f604b50936255461a31` 比较。
- 排除的 source checkout 状态：`docs/`、`package.json`、Drawnix adapter/test 与 `scripts/run-drawnix-consumer-gate.mjs` 下共 17 个未提交路径。它们只作为 dirty checkout 证据，不作为 parity 输入。
- 已提交 source delta 为 194 个文件、9,434 行新增、6,770 行删除。因此本次覆盖的是远端 main 的已提交漂移，不是本地 Drawnix 工作树。

#### 能力矩阵与质量判断

| 能力 | source remote-main | DSH bundle | 迁移判断 |
| --- | --- | --- | --- |
| Registry/workflow contract | 29 个 operation ID；移除一个 Drawnix-only input field | 18/18 个 baseline included operation 经 typed adapter 执行；11 个 host/design exclusion 仍显式存在；14 个 fixture、19 个 observation | 基线契约迁移完整且证据充分，但不能证明新增图表契约的当前语义 parity。 |
| Obsidian host surface | command、editor state、modal/settings、provider profile 与 vault UI | 按边界有意不包含；runtime composition 与 `ctx.llm`/`ctx.web` 由 DSH 拥有 | 边界正确。重新引入 host API 会破坏 standalone bundle ownership。 |
| Mutation 与恢复 | host-local write flow | typed proposal、approval receipt、journaled executor、recovery、ownership guard、receipt-derived event | DSH 在失败隔离和审计性上更强；未发现 portable workflow contract 的实质回归。 |
| 文档与知识 | 基线语义加 source-host presentation | AST section、稳定 anchor、chapter manifest、两种 original-text mode、scoped retrieval 与 citation | 基线 parity 高；当前 source-main delta 不否定该模型。 |
| LLM/Web 与 cache | provider/model/transport policy 加 5 分钟 response cache | DSH-owned `ctx.llm` 与 `ctx.web`；不迁移 provider cache | 有意不迁移。cache key 包含 provider endpoint/model policy，属于 DSH ownership；复制会产生第二套 routing authority。 |
| 图表 taxonomy | 三轴（semantic type、render target、export format）、13 个 semantic type，以及 `timeline`、`swimlane`、`quadrant` payload | 有 versioned `DiagramSpec`、lineage、具名 renderer，但没有等价的三轴 catalog 和三类 specialized payload contract | 部分迁移。当前 target-oriented contract 安全，但表达能力落后于 source-main。 |
| Mermaid normalization | 确定性 family detection、fence 提取/规范化、ER repair、family-aware legacy stage | LLM-backed Mermaid repair 与通用 fence transform | 部分迁移。确定性 normalization 应位于 LLM repair 之前，保证可复现和稳定的失败分类。 |
| Drawnix/Circuitikz | remote-main 已提交 cross-root routing、reserved lane、geometry/text layout、target-aware routing 与 native Circuitikz compile boundary 收敛 | 具名 provider、canonical source、标注 SVG projection、staging/process 控制和如实 unavailable | 部分迁移。provider 安全性已迁移，但新 source 行为与 consumer evidence 尚未迁移。SVG preview 不是 native Drawnix/Circuitikz parity。 |
| Gallery 与 consumer evidence | 生成 SVG/PNG gallery、capability manifest、fixture-driven docs、Draw.io/Drawnix/Circuitikz 外部 gate | artifact manifest、capability lane、确定性 subprocess fake；没有等价 gallery 或真实 external-consumer gate | 部分迁移。portable manifest/fixture 概念存在，但视觉 gallery 与 consumer acceptance 尚未迁移。 |
| Export | source-main export dimension 已进入 diagram target dispatch；host preview/gallery flow 仍属本地 | 具名 Slidev fork HTML/PDF/PNG/PPTX/MP4 provider 与 SVG-capable diagram derivative | portable export 覆盖良好，但 source-main target-dispatch parity 不完整。SVG 仍只能是 preview derivative。 |

#### 评估结论

- **架构安全性：高。** ownership boundary、closed Tool schema、staging process、mutation receipt、DSH service injection 与 fail-closed capability reporting 均强于 source host composition。
- **固定基线契约覆盖：高。** 18 个 included operation 全部映射到可执行 adapter；11 个 exclusion 显式记录而非隐藏。
- **当前 `origin/main` 语义 parity：部分。** source 在旧 intake candidate 之后已提交 diagram/catalog、Mermaid、Drawnix/Circuitikz 与 gallery 变化；DSH 当前 source lock 和 conformance fixture 尚未表达这些变化。
- **用户可见 host parity：按范围有意排除。** Obsidian UI、editor lifecycle、settings 与 provider profile 不应成为迁移质量失败指标。
- **总体结论：不能宣称与 source `origin/main` 全量 parity。** 准确发布标签是“固定非 host 契约的高质量 standalone migration，并带有已记录的 remote-main delta backlog”。

#### 重新宣称 parity 前的必要工作

1. 在新的 source-intake lock 中固定 `6097ff1`，把 17 个 dirty path 记录为 checkout evidence；更新 operation/fixture diff，不覆盖旧 oracle。
2. 增加 versioned 三轴 diagram catalog 与类型化 `timeline`/`swimlane`/`quadrant` payload。semantic type、render target、export format 必须是独立字段；禁止 generic renderer selector 或 mode flag。
3. 增加确定性 Mermaid normalization package 与 family detection、fence、ER repair fixture。它必须先于 LLM repair 执行，并保留 unsupported family diagnostic。
4. 通过 clean source contract 对齐已提交 Drawnix/Circuitikz 行为：cross-root relation routing、reserved lane、geometry/text layout、target-aware routing、native compile boundary。仅在 runtime 安装时增加 consumer gate，否则如实返回 `unavailable`。
5. 决定是否需要 portable gallery/manifest。需要时实现为 DSH artifact/fixture service，不复制 Obsidian webview/UI ownership；SVG-by-default preview 只能作为显式标注的 derivative。
6. response-cache policy 继续由 DSH 拥有。若新增 cache，必须在 DSH provider layer 定义 credential-free key、bounded TTL/entries、cancellation 与 invalidation test。

#### 退出证据与拒绝捷径

- 退出必须包含新的 source lock、更新后的 fixture hash、每个 accepted delta 的 typed adapter coverage 与 focused test、完整 bundle/type/lint gate 以及 clean DSH worktree。dirty source checkout 永远不能作为 acceptance oracle。
- 拒绝整体复制 source gallery、把 SVG 当 native Drawnix/Circuitikz 输出、把 provider cache policy 导入 NoteMD，或用单一 selector 隐藏 semantic/render/export 差异。这些捷径会抹平 Phase 1-16 已建立的 ownership 与 fidelity boundary。

### 执行顺序与记录协议

Phase 12-16 已在固定的非 Obsidian 宿主 contract 范围内完成。Phase 17 记录当前 source remote-main 已超出该 oracle；它是审计结果，不是实现声明。Phase 15 仍是当前 bundle 的显式 single-process hardening 选择，Phase 16 的旧 candidate 仅作历史记录。任何新的 parity 声明都必须针对新固定 source commit 执行 Phase 17 后续工作，并同步更新两份 progress 文档，记录 source/target lock、变更文件与 owner、实测测试、capability 限制、拒绝方案、风险与退出证据。
