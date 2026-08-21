# dsh-NotEMD

面向 DeepSeek Harness 的可移植、审批门控 NoteMD workflow provider。本包是可安装 bundle，完整说明见仓库的 [English README](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.md) 与 [中文 README](https://github.com/Jacobinwwey/dsh-NotEMD/blob/main/README.zh-CN.md)。

已发布包：[dsh-notemd](https://www.npmjs.com/package/dsh-notemd)。规范 npm 安装标识为 `dsh-notemd@0.1.0`。

## 安装

将已发布 package 安装到 Node workspace，再把同一版本加入 DSH profile：

```powershell
npm install --save-exact dsh-notemd@0.1.0
dsh plugin --profile notes add dsh-notemd@0.1.0
```

本包为无 scope 的 public package，并在 `publishConfig` 中固定 registry。npm 2FA 只影响维护者发布版本；普通使用者不需要维护者的登录或 OTP。

离线或未发布构建继续使用下面的 tarball 路径。

在仓库根目录构建 tarball，再添加到 DSH profile：

```powershell
pnpm install --frozen-lockfile
pnpm build
pnpm pack:bundle
dsh plugin --profile notes add .\artifacts\dsh-notemd-0.1.0.tgz
```

本包内嵌尚未发布的 `@notemd-harness/*` 实现包，并在 `package.json` 声明 `dsh.bundle.patch`。它刻意排除 Obsidian runtime；工作区写入绑定 revision，并且必须使用一次性 approval receipt。

## 运行边界

- DSH 负责 `llm`、`web`、凭据与 provider transport。
- NoteMD 负责工作区安全规划、审批绑定修改、持久化的仅规划作业、知识索引、图表 source/preview artifact 与具名 Slidev export provider。
- 可选 executable 缺失时返回 `unavailable`，不会替换成其他输出格式。

完整工具矩阵、profile patch 示例、开发门禁、发布清单与双语文档索引请参阅仓库 README。
