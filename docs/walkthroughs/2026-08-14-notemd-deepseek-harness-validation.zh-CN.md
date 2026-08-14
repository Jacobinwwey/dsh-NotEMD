# NoteMD DSH Bundle 验证记录

## 范围

本记录针对固定在 `47f943859bef60e4160492346772ded9b24f765a` 的 DeepSeek Harness source checkout 验证 NoteMD 发行包。它记录可复现的发布门禁，不声称未来上游版本仍然兼容。

## 环境

| 组件 | 已验证版本 |
| --- | --- |
| Node.js | `22.19.0` |
| workspace pnpm | `10.7.1` |
| Vitest 测试套件 | `13` 个测试文件 / `39` 个测试 |
| DeepSeek Harness | `0.1.0-rc.5` source checkout |
| DSH 安装器 pnpm | `11.7.0` |
| Cordis peer 契约 | `@deepseek-ai/cordis` `4.0.1` |
| DSH Tool peer 契约 | `@deepseek-ai/dsh-tools` `0.1.0-rc.5` |

## 命令

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

`pnpm test:coverage` 只采集可发布的 `packages/**/src/**/*.ts`；固定的 `ref/` checkout 与发布脚本被有意排除。

DSH source runtime 只在 `ref/deepseek-harness` 内准备：

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm dsh --help
```

引用 checkout 保持源码干净；生成依赖和构建产物不属于项目改动。

## 验收证据

`pnpm accept:dsh` 使用全新的临时 `DSH_HOME` 和独立复制的 fixture 工作区执行以下流程：

1. 构建并打包 bundle，验证 tarball 含有编译后的 bridge 模块、DSH patch 和所有未发布内部 workspace 依赖，同时排除源码、测试、map、构建元数据、状态和环境文件。
2. 在固定 DSH source checkout 中执行 `pnpm dsh plugin --profile notemd-acceptance add <tarball>`。
3. 写入仅属于 profile 的 overlay，通过 `NOTEMD_ACCEPTANCE_WORKSPACE` 提供完整 vault、job 和 approval 配置。
4. 执行 `pnpm dsh --profile notemd-acceptance --dump-config`，断言 vault、Tool 与 workflows 行均从已安装 bundle 解析。
5. 通过真实 Cordis 和 `ToolRuntime` 加载已安装 bundle，读取 `notes/architecture.md`，生成确定性公式修复计划，请求一次性审批，应用计划并验证规范化结果。
6. 再生成一份计划，在规划后修改其源文件，批准旧计划，并验证写入结果为 `skipped-stale`，且新内容保持不变。
7. 在 `finally` 块中删除临时 DSH home 与工作区。

测试中的自动审批 provider 只返回 `allowed-once`，用于验证 DSH 审批 seam，而不把交互浏览器会话设为 CI 前置条件。它还验证 bundle 的审批原因没有暴露计划内容。交互式 answerer 行为仍由 DSH 部署负责。

## 刻意排除项

- 不包含 Obsidian 宿主、UI、编辑器状态或命令面板集成。
- 不包含浏览器预览、桌面进程执行、Tectonic、Slidev、PPTX、PDF、SVG/PNG 渲染或原生渲染器验收。
- 不发起真实 LLM 请求。公式修复是确定性的；LLM adapter 另有测试验证缺失 API key 时会在传输前失败。
- 不声称与未固定的未来 DSH/Cordis 版本兼容。

## 发布结论

只有所有列出的命令均成功时才能发布。覆盖配置时必须完整重述被替换行的 `config`。生产凭据只能存在于部署层 secret 输入，绝不提交到 bundle，也不写入工作区状态。
