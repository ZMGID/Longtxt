# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**长布（Changbu）**：本地优先的 Electron 桌面笔记应用。核心链路是：时间轴记录块 → 标签/摘要补全 → 向量后台批处理 → 混合检索 → AI 流式生成文档。

## 技术栈

Electron · React 19 · TypeScript · Vite 8 · Tailwind CSS v4（零配置） · TanStack Query · better-sqlite3 · SQLite FTS5 + sqlite-vec（可选） · @node-rs/jieba（中文分词） · react-force-graph-2d（知识图谱） · CodeMirror（Markdown 编辑）

## 常用命令

```bash
pnpm install          # 安装依赖，并重建 better-sqlite3 等 Electron 原生模块
pnpm dev              # 启动完整开发环境（Vite + tsup watch + Electron）
pnpm test             # 在 Electron 进程内运行默认 Vitest 套件
pnpm test:watch       # 监听模式运行 Vitest
pnpm test:manual-live # 运行显式标记的 live/manual 测试
pnpm typecheck        # TypeScript 项目构建检查（tsc -b）
pnpm lint             # ESLint
pnpm build            # typecheck + Vite 构建 + tsup 打包主进程/预加载
pnpm package:dir      # 生成未打包目录
pnpm package:mac      # 构建 macOS 安装包
pnpm package:win      # 构建 Windows 安装包
pnpm rebuild:native   # 切换 Node / Electron 版本后重建原生模块
```

### 单测运行

```bash
cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run src/components/SettingsPanel.test.tsx
cross-env ELECTRON_RUN_AS_NODE=1 electron ./node_modules/vitest/vitest.mjs run electron/__tests__/ipc.test.ts -t "registers notebook handlers"
```

测试环境配置在 `vite.config.ts`：

- 使用 `jsdom`
- setup 文件是 `src/test/setup.ts`
- `**/*.temp.test.ts(x)` 默认从主测试套件排除
- 排查测试差异时要记住：这里不是标准 Node 进程，而是 `ELECTRON_RUN_AS_NODE=1 electron ...vitest.mjs`

## 路径别名与构建边界

TypeScript 和 Vite 共享以下别名：

- `@/*` → `src/`
- `@shared/*` → `shared/`
- `@electron/*` → `electron/`

主进程和预加载由 `tsup` 单独打包到 `dist-electron/*.cjs`，不经过 Vite。因此主进程代码改动时，要额外注意：

- `electron/main.ts` / `electron/preload.ts` 的构建语义以 `tsup.config.ts` 为准
- 主进程里使用路径别名时，要确认 tsup 能正确解析；不确定时优先相对路径
- `pnpm dev` 实际会并行启动 Vite、tsup watch、electronmon，Electron 会等待 `dist-electron/main.cjs` 和 `preload.cjs` 就绪后再启动

## 架构总览

### 进程边界

- **渲染进程**（`src/`）：React UI，只能通过 `window.changbu` 调主进程能力，禁止直接引入 Electron API。
- **预加载层**（`electron/preload.ts`）：唯一桥接层，暴露 `ChangbuApi`，并把主进程事件转发给渲染层。
- **主进程**（`electron/`）：负责数据库、AI、文件系统、附件、导入导出、后台任务与应用生命周期。
- **共享层**（`shared/`）：跨进程类型、IPC channel、默认设置与解析逻辑。

### 跨进程 API 改动链路

新增或修改桌面 API 时，通常要同时更新以下几处，缺一处就会断：

1. `shared/types.ts`
2. `shared/ipc.ts`
3. `electron/appContext.ts`
4. `electron/ipc/register.ts`
5. `electron/preload.ts`
6. `src/lib/changbu.ts`

### 主进程核心组织

- `electron/main.ts`：Electron 生命周期入口，创建窗口、注册 IPC、注册 `changbu-attachment://` 协议，并在退出前等待 `appContext.whenIdle()`，避免后台任务半途终止。
- `electron/appContext.ts`：主进程总编排层。数据库访问、AI provider、文档生成、标签补全、日历建议、附件、导入导出、向量队列都在这里汇合。
- `electron/db/`：按领域拆表和查询，重点是 `blocks.ts`、`search.ts`、`vectors.ts`、`notebooks.ts`、`snapshots.ts`、`calendar.ts`、`graph.ts`。
- `electron/services/`：承载跨表逻辑，主要包括 `ai.ts`、`tagger.ts`、`docgen.ts`、`attachments.ts`、`importExport.ts`。

### 渲染层状态模型

- `src/App.tsx` 是前端状态编排中心：切换 timeline / search / graph / snapshots / settings / notebook / calendar 等视图，并处理文档流式生成状态。
- 渲染层数据访问主要放在 `src/hooks/`，底层依赖 TanStack Query。
- `src/lib/queryKeys.ts` 定义统一查询 key；`src/lib/changbu.ts` 是渲染层访问 `window.changbu` 的唯一薄封装。
- 实时刷新不是到处手动同步本地 state：主进程发送事件 → preload 转发 → `src/components/ChangbuEventBridge.tsx` 统一失效 query cache。文档流式 token 是例外，直接在 `App.tsx` 中消费。

### 搜索、AI 与后台任务主链路

块被创建或编辑后，不会同步完成全部 AI 工作，而是分阶段推进：

1. `blocks` 记录先落库。
2. `tagger` 生成分类标签、细节标签和摘要，并优先把块状态推进到 `ready`。
3. 向量任务写入 `pending_block_vectors` 持久化队列。
4. `scheduleReindex()` 以单飞方式批量 drain，embedding provider 再把向量写入 `sqlite-vec`。
5. 完成后通过事件回推渲染层，搜索结果再由标签 + FTS + 向量三路融合增强。

这里有几个容易漏掉的约束：

- 异步写回必须防止旧任务覆盖新内容，也要防止块删除后晚到任务继续写状态/标签/向量。
- 检索不是单一路径，`electron/db/search.ts` 会融合 **标签匹配 + FTS5 trigram + 向量召回**，不要只改其中一层。
- AI 只有在“配置存在 + 探测成功 + 当前配置指纹与上次探测一致”时才进入 `live`；否则统一退回 `mock`。
- 向量维度不是写死的，会根据 embedding 探测结果或真实返回值动态调整 schema，并可能触发全量重建。

### Notebook / Snapshot / Calendar / 导入导出

这是第二条最容易低估复杂度的主线：

- `notebook_items` 是 notebook 的真实内容模型，支持 `block`、`heading`、`divider`、`note`、`todo` 混排。
- `notebook_reference_reviews` 保存引用块的 `excluded` / `locked` / `pinned` 审核状态；生成 notebook 文档时，这部分状态会参与引用块筛选。
- `snapshots` 可以挂到 notebook 上。
- 导入导出和附件读写都走主进程，不是前端直接读写文件；Markdown 导入还会把图片引用重写进本地附件体系。
- 日历不是孤立模块：`calendar.ts` 同时处理手动条目、AI 建议，以及与 block 时间轴联动的热力图/日详情。

### 图谱与附件

- 知识图谱由 `electron/db/graph.ts` 基于 `block_tags` 按需聚合，不做增量缓存。
- 本地图片通过 `changbu-attachment://` 自定义协议暴露；主进程会校验路径必须落在附件目录内，不能把任意本地路径直接暴露给渲染层。

## 设置与存储

- 数据默认放在 Electron `userData/data` 目录下，主库文件是 `changbu.sqlite3`。
- `shared/config.ts` 维护默认设置、边界值和解析逻辑；改设置项时，通常要同时检查设置页 UI、shared parser/normalizer、主进程读写链路。
- `ai_config`、AI 探测结果、block/doc/calendar/ui 设置会额外落到 `changbu-settings.json`（`electron/settingsFile.ts`），不是只存数据库。
- `sqlite-vec` 加载失败时应用仍可运行，只是向量检索降级；不要把“向量不可用”当成“应用不可启动”。

## 关键约束

- `src/` 中禁止直接使用 Electron API。
- 修改 IPC 或 preload 暴露面时，必须完整检查共享类型、channel 常量、主进程 handler、preload 桥接和渲染层封装。
- `notebook_items` 已取代旧的 `notebook_blocks` 作为 notebook 内容源；涉及 notebook 结构时要保留迁移语义。
- 涉及 AI 配置门控、向量 schema、附件路径、数据库迁移、设置持久化的改动都属于高风险区域，先读完整链路再动手。
- 注释使用简体中文，UTF-8（无 BOM）。
