# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目简介

**长布（Changbu）**：本地优先的 Electron 桌面笔记应用。核心流程：用户在时间轴记录块 → 自动生成标签与向量 → 混合检索 → AI 流式生成文档。

## 常用命令

```bash
pnpm install          # 安装依赖并重建原生模块（better-sqlite3）
pnpm dev              # 启动开发环境（Vite + Electron 并发）
pnpm test             # 运行 Vitest
pnpm test:watch       # 监听模式运行测试
pnpm typecheck        # tsc -b 类型检查
pnpm lint             # ESLint
pnpm build            # typecheck + vite build + tsup
pnpm package:mac      # 打包 macOS 安装包
pnpm rebuild:native   # 重建 Electron 原生模块（切换 Node/Electron 版本后需执行）
```

测试运行在 Electron 进程内（`cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs`），不是标准 Node 环境。

## 架构概览

### 进程边界

- **渲染进程**（`src/`）：React UI，只能通过 `window.changbu`（`ChangbuAPI` 接口）与主进程通信，禁止直接引入 Electron API。
- **主进程**（`electron/`）：所有数据库、AI、文件系统操作均在此执行。
- **共享层**（`shared/`）：`types.ts` 定义跨进程类型，`ipc.ts` 定义 IPC channel 常量，`config.ts` 存放共享配置常量。

### 主进程内部层次

```
electron/
  main.ts          — Electron 生命周期，挂载 ipc/register.ts
  preload.ts       — contextBridge 将 window.changbu 暴露给渲染层
  appContext.ts    — 核心服务组装，所有业务方法的实现入口
  db/              — SQLite 访问层（blocks, tags, vectors, search, snapshots, settings, graph, migrations）
  ipc/register.ts  — 将 AppContext 方法映射为 IPC handler
  services/
    ai.ts          — LLM / Embedding provider 工厂，支持 live/mock 两种模式
    tagger.ts      — 规则优先 + LLM 兜底自动标签引擎
    docgen.ts      — 流式文档生成（基于召回块）
    attachments.ts — 图片保存、孤儿清理、索引重建
    importExport.ts — Markdown / JSON 导入导出
```

### AI 模式切换

`appContext.ts` 维护 `live` / `mock` 两套 provider。只有在 AI 配置存在、`probeAiConfig` 探测成功，且配置指纹与上次测试结果匹配时，才切换到 `live` 模式；否则使用 mock。`AppMeta.activeAiMode` 反映当前状态。

### 数据库

使用 `better-sqlite3` + SQLite FTS5 + `sqlite-vec`（向量搜索）。向量维度在首次配置 Embedding 时自适应写入 schema（`db/vectors.ts`）。Schema 迁移通过 `db/migrations.ts` 顺序执行。数据文件存放于 Electron `userData` 目录（macOS: `~/Library/Application Support/Electron/data/changbu.sqlite3`）。

### 渲染层

```
src/
  App.tsx          — 顶层路由与布局
  components/      — Timeline, BlockCard, InputBar, SearchPanel, SettingsPanel, GraphView, SnapshotsView 等
  hooks/
    useBlocks.ts   — 块列表、分页、乐观更新
    useTags.ts     — 标签列表与操作
  lib/             — 高亮、格式化等纯函数工具
```

## 关键约束

- `src/` 中禁止直接使用 Electron API，所有跨进程调用通过 `window.changbu`。
- 修改 `preload.ts` 暴露面、IPC channel、附件路径处理、SQLite migration 时需特别谨慎。
- 原生模块（`better-sqlite3`、`sqlite-vec`）切换环境后需执行 `pnpm rebuild:native`。
- 注释使用简体中文，UTF-8（无 BOM）。
