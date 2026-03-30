# Contributing

感谢你愿意关注长布。

当前项目仍处在 MVP 快速迭代阶段，所以贡献方式以“小步、可验证、易回滚”为主。

## 开发环境

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm test
pnpm typecheck
pnpm build
```

## 提交前检查

请至少确保以下三项通过：

1. `pnpm test`
2. `pnpm typecheck`
3. `pnpm build`

## 代码约定

- 以 TypeScript 为主
- 渲染层通过 `window.changbu` 与主进程交互
- 数据层优先通过 SQLite 和显式 schema 落地
- 能用确定性代码解决的逻辑，尽量不要直接推给 LLM
- 不要把 API Key、测试密钥、个人数据提交进仓库

## 适合的贡献方向

- 时间轴、搜索、文档视图等桌面交互优化
- 标签引擎、检索排序、文档生成质量优化
- SQLite schema、附件管理、导入导出能力
- 测试覆盖率和稳定性提升
- 文档、使用说明、开源发布材料整理

## 暂不建议直接改动的内容

- 许可证文件
- 对外发布仓库地址
- 安全披露渠道

这些内容会涉及项目对外策略，建议先在 issue 或讨论里对齐。
