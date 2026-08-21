# Notemd DeepSeek Harness Bundle 实施计划（中文）

> 英文原版：[2026-08-14-notemd-deepseek-harness-bundle.md](./2026-08-14-notemd-deepseek-harness-bundle.md)。本文件是独立可读的中文镜像；代码标识符、包名与命令保持原样，避免翻译改变接口含义。

**目标：** 交付可独立安装的 DeepSeek Harness bundle，迁移 Notemd 的可移植笔记工作流语义，而不是携带 Obsidian 运行时。

**架构：** Vault 合约与本地实现、持久任务、派生知识、只产出计划的工作流、源产物和 OpenAI 兼容适配器各自拥有边界。Harness 桥层仅负责 Cordis 服务和按权限拆分的 Tool，发布包只承载 patch 与运行时适配。

**技术栈：** Node.js 22.19.0+、pnpm 10、TypeScript、Vitest、MiniSearch、原生 Node 文件系统 API、DeepSeek Harness `0.1.0-rc.5` 源码契约、Cordis 与 `@deepseek-ai/dsh-tools`。

## 全局约束

- 只修改本仓库；`E:/convert/undo/obsidian-NoteMD_new` 永远只读。
- `ref/` 必须被忽略；DSH 集成基准是 `ref/deepseek-harness` 的 `47f943859bef60e4160492346772ded9b24f765a`。
- 所有 pnpm 命令使用已激活 `fnm` 的 Node `>=22.19.0`。
- `@deepseek-ai/cordis` 参考版本为 `4.0.1`，`@deepseek-ai/dsh-tools` 为 `0.1.0-rc.5`。两者作为运行时 peer 仅在本地 DSH 源码验收中验证；上游公开 registry 未可用时，不宣称普通 registry 安装成功。
- 生产包不得导入 `obsidian`、`App`、`TFile`、`Notice`、编辑器状态或命令注册 API。
- 路径只在 Vault 边界校验一次；所有写入必须指定精确 revision，或明确使用 `absent` 前置条件。
- 可变工作区状态只能写入 `.notemd/`；机器级状态只能位于 `DSH_HOME/data/notemd/`。
- 读取、规划、写入、产物和任务观察必须是独立 Tool。写入只消费绑定到不可变计划 digest 的一次性批准。
- 基线产物是可移植源文件和 manifest。浏览器预览、Slidev、PPTX、PDF、SVG/PNG 渲染、原生进程执行和 Tectonic 都是可选 provider，不能成为基线依赖。
- 不提交密钥、访问令牌、绝对机器路径或 `ref/` 内容。
- 每个行为遵守 red-green-refactor：先写失败测试并观察预期失败，再写最小实现，通过聚焦测试后再跑包级测试。

## 包职责

| 包 | 唯一职责 |
| --- | --- |
| `@notemd-harness/vault` | revision、文档、写入计划与结果合约 |
| `@notemd-harness/vault-local` | 路径包含检查、原子落盘与每文件串行化 |
| `@notemd-harness/jobs` | 幂等、可持久、可取消的有界任务执行 |
| `@notemd-harness/knowledge` | 从 Vault 重建的 MiniSearch 派生索引 |
| `@notemd-harness/workflows` | 只生成 `WritePlan` 的笔记转换与修复 |
| `@notemd-harness/artifacts` | DiagramSpec 与受 manifest 约束的源产物 |
| `@notemd-harness/llm-openai-compatible` | fetch、SSE、缓存、诊断和稳定 LLM 错误 |
| `@notemd-harness/tools` | Cordis 服务适配和 DSH Tool 注册 |
| `@jacobinwwey/dsh-notemd` | 可发布 bundle、patch、profile 示例与运行时 glue |

---

## 任务 1：建立可复现工作区

**文件：** 根 `package.json`、`pnpm-workspace.yaml`、`tsconfig.base.json`、`vitest.workspace.ts`、`.npmrc`；每个包的 `package.json` 与 `tsconfig.json`；`fixtures/workspace/notes/architecture.md`；`packages/notemd-vault/test/revision.contract.test.ts`。

**交付：** 声明全部九个包名的 `workspacePackageNames()`，根脚本包含 `typecheck`、`test`、`test:coverage`、`lint`、`build`、`pack:bundle` 与 `verify:bundle`。启用 TypeScript strict、NodeNext 和 pnpm workspace 协议。

**红绿证据：** 先让 `revision.contract.test.ts` 因缺少包和模块失败；加入最小 package-name 模块与 fixture 后运行：

```powershell
pnpm --filter @notemd-harness/vault test -- revision.contract.test.ts
pnpm install
```

锁文件不得引入私有 DSH registry 依赖。

## 任务 2：定义 Vault 合约和安全本地实现

**文件：** `packages/notemd-vault/src/index.ts`、`revision.ts`；`packages/notemd-vault-local/src/local-vault.ts`、`path-boundary.ts`、`write-lock.ts`；各自的 contract/local-vault 测试。

**接口不变量：** `Revision` 是内容 UTF-8 SHA-256；`ExpectedRevision = Revision | 'absent'`；`NotemdVault` 只公开 `listMarkdown`、`read`、`apply`。`WriteResult` 必须明确为 `created`、`updated`、`skipped-stale`、`rejected`、`cancelled` 或 `failed`。

**实现要求：**

- 在任何文件系统访问前拒绝绝对路径、空段、NUL 与 `..`；解析真实 root 与已有目标或父目录，阻止符号链接越界。
- 每个 canonical target 只有一条 promise-chain lock。
- 临时文件必须与目标同目录，保留已有文件 mode；锁内重新读取预期 revision；以有限重试处理 `EPERM`、`EACCES`、`ENOTEMPTY` 的 rename。
- 替换失败只能返回带诊断的 `failed`，绝不能回退为会截断目标的直接写入。

**红绿证据：** 先验证 symlink escape、absent 创建、stale 拒绝、并发写入与临时文件清理失败，再运行：

```powershell
pnpm --filter @notemd-harness/vault-local test -- local-vault.test.ts
pnpm --filter @notemd-harness/vault-local typecheck
```

## 任务 3：增加持久任务与派生知识

**文件：** `packages/notemd-jobs/src/{index,file-job-store,bounded-runner}.ts`；`packages/notemd-knowledge/src/{index,knowledge-index}.ts`；对应测试。

**实现要求：** 任务记录放在 `workspace/.notemd/jobs/`，以 idempotency key 返回同一记录，写入前克隆输入，绝不持久化函数、signal、密钥或可变调用方对象。runner 限制活跃 promise 数并将 `AbortSignal` 传给尚未开始的目标，保证每个目标恰好一个终态。知识索引只接收 `VaultDocument`，字段是 path、title 和去 Markdown 的 body；每次 rebuild 先清空，缓存路径丢失视为 stale miss。

**验证：** 先让 jobs/knowledge 测试因模块不存在失败；再运行：

```powershell
pnpm --filter @notemd-harness/jobs test
pnpm --filter @notemd-harness/knowledge test
```

覆盖恢复、取消、并发上界、rebuild、upsert、delete 与排序。

## 任务 4：将工作流迁成只规划操作

**文件：** `packages/notemd-workflows/src/{index,plan-factory,markdown-transforms,concepts,mermaid,formulas}.ts` 与两组测试。

**接口：** `WorkflowPlanner` 公开 `planWikiLinks`、`planTranslation`、`planTitleGeneration`、`planResearchSynthesis`、`planConceptExtraction`、`planMermaidRepair`、`planFormulaRepair`，返回不可变 `WritePlan`；模型边界是 `TextTransformer.complete()`。

**实现要求：**

- 所有 planner 从 `NotemdVault` 读取，模型只处理确实需要模型的转换。
- Formula repair 完全确定；Mermaid 仅把 code fence body 交给模型，围栏外文字保持原样。
- 概念提取解析文档化 JSON 对象，畸形结构直接拒绝，不能猜测；重复分析只能产出无写入的诊断计划。
- canonical digest 只包括 path、expectedRevision、content，按 path 排序后 SHA-256；id 为 `notemd-plan-` 加 digest 前 20 位。

**验证：** 先观察 Mermaid 与 concept golden 测试失败，然后：

```powershell
pnpm --filter @notemd-harness/workflows test
```

覆盖 links、标题、翻译、研究综合、概念、Mermaid、公式和重复分析，且不使用 Obsidian mock。

## 任务 5：增加源产物和 OpenAI 兼容适配器

**文件：** `packages/notemd-artifacts/src/{index,diagram-spec,artifact-manifest}.ts`；`packages/notemd-llm-openai-compatible/src/{index,sse,error,cache}.ts`；对应测试。

**实现要求：** DiagramSpec 必须校验后才生成 JSON/Markdown companion plan。版本化 manifest 必含 source path、revision、renderer 和 exact owned paths；cleanup 仅能返回位于 `.notemd/artifacts/` 且 manifest 明确拥有的路径。适配器以 fetch 和 `AbortSignal` 处理 JSON/SSE，增量解析帧边界，保留 text/tool-call delta，在唯一 finish 前输出 usage；把 HTTP、畸形流、超时、取消和 transport 错误归一为带 code 的 `LlmError`。缓存键是 canonical request digest + TTL，只缓存成功完整响应。

**验证：** 先观察缺模块的 artifact/SSE 测试失败，再运行：

```powershell
pnpm --filter @notemd-harness/artifacts test
pnpm --filter @notemd-harness/llm-openai-compatible test
```

覆盖 fragmented SSE、tool calls、usage 顺序、AbortSignal、retryability 和 cache。

## 任务 6：绑定批准并公开 DSH 服务与 Tool

**文件：** `packages/notemd-tools/src/{index,approval-ledger,notemd-services,read-tools,plan-tools,write-tools,job-tools,dsh-shims}.ts` 与 authority/contract 测试。

**接口：** `ApprovalLedger.issue(plan)` 返回 `{ planId, digest, approvalId }`，`consume(plan, approvalId)` 只能为同一未过期、未消费 digest 返回 true。`NotemdServices` 只聚合 vault、jobs、knowledge、workflows、artifacts。

**实现要求：** 批准记录只在 `.notemd/approvals/` 保存 plan id、digest、时间、过期时间和 consumed 状态，不重复保存计划内容。写工具先经 Harness 用户批准桥接，再消费完全匹配的批准，任何重用、过期、未知或 digest 不匹配都在 `vault.apply` 前被拒绝。使用 Cordis 的 `inject` 与 DSH `defineTool` 契约注册独立的 read、plan、write、artifact、job-status、job-cancel 工具；每个输出是带 per-file status 的 canonical object。核心包不把 DSH runtime 当作普通 registry 依赖，实际 import 由 bundle peer 和本地 DSH 验收覆盖。

**验证：** 先让变异计划/工具分离测试失败，再运行：

```powershell
pnpm --filter @notemd-harness/tools test
```

验证一次注册、批准消费、生命周期 dispose、各 Tool 参数接受/拒绝。

## 任务 7：组装可安装 bundle 与 profile 契约

**文件：** `packages/notemd-bundle/package.json`、`cordis.patch.yml`、`src/{index,vault-local,jobs,knowledge,tools,harness-types}.ts`；`profiles/notemd/{package.json,cordis.patch.yml}`；`scripts/verify-bundle.ts`；两组 bundle 测试。

**实现要求：** bundle 只导出 index、vault-local、jobs、knowledge、artifacts、llm、tools；`dsh.bundle.patch` 指向 `./cordis.patch.yml`。peer 版本为 `@deepseek-ai/cordis: ^4.0.1` 与 `@deepseek-ai/dsh-tools: 0.1.0-rc.5`。patch 为每一行提供完整 config，profile 只以相对 DSH 表达式指向 fixture，绝不含 key 或绝对路径；文档给出完整 override，因为 DSH patch 的 config 是整体替换而非 deep merge。

**验证：** 先观察 manifest/export 测试失败，再运行：

```powershell
pnpm pack:bundle
pnpm verify:bundle
```

tarball 必含编译模块、types、`package.json`、patch，且不含测试、`ref/`、密钥和 mutable state。

## 任务 8：干净 profile 验收与文档收尾

**文件：** 双语 validation walkthrough、`README.md`、`README.zh-CN.md`、`scripts/accept-dsh-profile.ts`。

**执行：** 在 `ref/deepseek-harness` 的固定 commit 下安装其依赖并运行源码 CLI。将本地 tarball 安装进临时 DSH_HOME/profile，检查解析后的 patch，执行读取 fixture、计划公式修复、签发并消费批准、应用计划、再验证 stale plan 被拒绝。删除临时 profile，只保留无密钥日志。实际 CLI 交互若在该 DSH release 没有稳定的非交互入口，则以真实 Cordis bundle 装载和 Tool execute 合约代替，不伪造交互成功。

**最终质量门：**

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm pack:bundle
pnpm verify:bundle
pnpm tsx scripts/accept-dsh-profile.ts
git diff --check
```

所有命令必须本次执行并退出 `0`。walkthrough 记录命令、包版本、DSH reference commit、测试数量及可选能力排除项。仅当本地 `main` 已基于或可快进 `origin/main` 时，创建文档提交并以非 force 方式推送。

## 计划审查结论

- 覆盖范围包括全部基线包、权限拆分 Tool、生命周期服务、工作区状态边界、OpenAI 兼容流、源产物和 bundle/profile 组合。
- 有意排除 Obsidian UI/runtime、预览与渲染进程栈、非 OpenAI 传输和 Tectonic；缺失可选能力应明确报告，不能静默模拟。
- 关键数据流为 `Vault -> WritePlan -> digest/approval -> Vault.apply -> explicit WriteResult`；workflow/artifact 只能产出 plan，不能绕过批准写入。
- 上游 package 公开发布状态是外部风险。此仓库的可验证承诺是“本地固定 DSH 源码可装载并运行”，不是“公开 registry 已可安装”。
