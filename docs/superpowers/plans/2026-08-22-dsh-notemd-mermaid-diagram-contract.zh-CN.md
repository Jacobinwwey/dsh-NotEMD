# DSH NoteMD Mermaid 与图表契约阶段

> English version: 2026-08-22-dsh-notemd-mermaid-diagram-contract.md

**目标：** 在不迁入 Obsidian 宿主行为、Provider cache policy 或 native renderer ownership 的前提下，补齐 Phase 17 审计识别出的非 Drawnix 语义 parity 缺口。

**源锁：** `ref/obsidian-NotEMD@07c629c6f99a1171a6a63eaf50ddb0dce0f5fed5`；可迁移源路径为 `src/diagram/adapters/mermaid/normalize.ts`、`src/diagram/adapters/mermaid/validator.ts`、`src/diagram/diagramTypeCatalog.ts` 以及 timeline/swimlane/quadrant Mermaid adapter。源工作区只读，所有 Drawnix 路径继续排除。

**架构：** `@notemd-harness/mermaid` 负责确定性 Mermaid normalization、closed-fence extraction、family detection、ER repair 与 semantic source rendering；`@notemd-harness/artifacts` 负责 versioned three-axis diagram catalog 与 intent payload validation。既有 `DiagramSpec/v2`、renderer package、approval 与 DSH provider seam 继续作为 authority。

## Task 1：锁定可迁移源语义

- [x] 增加 `fixtures/migration/mermaid-normalization-lock.json`，记录 source commit、接受语义、排除项与 fixture path。
- [x] 增加 ER brace-less fixture，并测试 BOM/换行、fence、family、ER repair 与 unclosed-fence diagnostic。
- [x] 排除 source Mermaid runtime initialization、legacy LLM/debug stage、Obsidian preview 与 Drawnix 行为。

## Task 2：实现确定性 normalization

- [x] 增加 `packages/notemd-mermaid` 严格 TypeScript package boundary。
- [x] 规范化 BOM 与换行、保留 prose、只提取 closed block、报告 unclosed fence、识别源 family 集合、修复 brace-less ER entity 与 truncated cardinality，并对 unknown family 保持显式状态。
- [x] 将 deterministic normalization preflight 接入 `planMermaidRepair` 与 `planBatchMermaidRepair`；只有 normalized content 无法通过校验时才调用 LLM repair。
- [x] 保留 approval-gated mutation path；确定性写入使用 `mermaid.normalize` provenance。

## Task 3：实现 three-axis diagram contract

- [x] 在 `packages/notemd-artifacts/src/diagram-catalog.ts` 增加 `diagram-catalog@1` 与 `diagram-intent@1` contract。
- [x] semantic type、render target、export format 保持独立字段；不兼容组合、unknown field、空 payload、非法 quadrant coordinate 与 malformed timeline/swimlane/quadrant payload 均拒绝。
- [x] 将 `svg-preview` 记录为显式 derivative；绝不当作 native Draw.io、Drawnix、Circuitikz、PPTX 或 MP4 output。

## Task 4：增加可执行 semantic source adapter

- [x] 增加 `renderMermaidIntent()`，为 validated timeline、swimlane、quadrant payload 生成确定性 source，并进行 sanitization 与稳定 identifier 分配。
- [x] 保持既有 `@notemd-harness/render-mermaid` graph renderer 与 `DiagramSpec/v2` 不变；新 adapter 是 source contract boundary，不是第二 renderer authority。
- [x] 增加 source output、collision-safe identifier 与显式 SVG derivative contract 的 focused tests。

## Task 5：发布证据

- [x] 新鲜串行执行 root typecheck、lint、full test、coverage、build、packed-bundle verify、clean DSH acceptance 与 diff check。
- [x] 更新双语 architecture audit、implementation plan 与 migration progress，写入精确 source lock、变更文件、测试、限制与拒绝方案。
- [ ] 非强制提交并推送 `main`；确认 local/remote SHA parity 与 clean worktree。

## 被拒方案

- 不整体复制 `mermaidProcessor.ts` legacy stage；它混合宿主/runtime 与 LLM/debug 行为。
- 不增加 generic renderer selector 或 mode flag；render target 与 export format 必须是独立的 validated field。
- 不把 SVG 变成通用 fidelity claim；它只能是明确标注的 preview derivative。
- 本阶段不实现 Drawnix、Provider response cache 或 Obsidian gallery/preview。
