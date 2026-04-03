# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**长布（Changbu）**：本地优先的 Electron 桌面笔记应用。核心链路是：时间轴记录块 → 标签/摘要即时补全 + 向量后台批处理补齐 → 混合检索 → AI 流式生成文档。

## 技术栈

Electron · React 19 · TypeScript · Vite 8 · Tailwind CSS v4（零配置） · better-sqlite3 · SQLite FTS5 + sqlite-vec（可选） · react-virtuoso · react-markdown · @node-rs/jieba（中文分词） · CodeMirror（Markdown 编辑）

## 常用命令

```bash
pnpm install          # 安装依赖，并重建 better-sqlite3 等 Electron 原生模块
pnpm dev              # 启动完整开发环境（Vite + tsup watch + Electron）
pnpm test             # 在 Electron 进程内运行全部 Vitest
pnpm test:watch       # 监听模式运行 Vitest
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

测试环境配置在 `vite.config.ts`，使用 `jsdom` 环境，setup 文件是 `src/test/setup.ts`（仅引入 `@testing-library/jest-dom/vitest`）。测试不是在标准 Node 环境里跑，而是通过 `ELECTRON_RUN_AS_NODE=1 electron ...vitest.mjs` 执行；排查测试差异时要按这个前提理解。

## 路径别名

TypeScript 和 Vite 配置了统一的路径别名：

- `@/*` → `src/`
- `@shared/*` → `shared/`
- `@electron/*` → `electron/`

tsup 构建主进程时不经过 Vite，所以主进程代码中的别名需要使用相对路径或确保 tsup 不需要解析它们。

## 架构总览

### 进程边界

- **渲染进程**（`src/`）：React UI，只能通过 `window.changbu` 调主进程能力，禁止直接引入 Electron API。使用 Tailwind CSS v4（零配置，无 tailwind.config 文件）。
- **预加载层**（`electron/preload.ts`）：唯一的桥接层，把 `ChangbuApi` 暴露给渲染进程，并转发主进程事件。
- **主进程**（`electron/`）：负责数据库、AI、文件系统、导入导出、附件处理。通过 tsup 打包为 CJS 格式输出到 `dist-electron/`。
- **共享层**（`shared/`）：`types.ts` 定义跨进程类型（含完整的 `ChangbuApi` 接口），`ipc.ts` 定义 channel 常量，`config.ts` 定义共享默认值和设置解析。

### 跨进程 API 改动链路

新增或修改桌面 API 时，通常要同时更新以下几处，缺一处就会断：

1. `shared/types.ts`
2. `shared/ipc.ts`
3. `electron/appContext.ts`
4. `electron/ipc/register.ts`
5. `electron/preload.ts`
6. `src/lib/changbu.ts`

### 主进程组织方式

- `electron/main.ts`：Electron 生命周期入口，创建窗口、组装 `AppContext`、注册 IPC，并把块变化/文档流式输出推送回渲染层。
- `electron/appContext.ts`：主进程业务总入口。这里把 DB 层、AI provider、标签、文档生成、附件、导入导出全部编排成一组高层方法，并维护后台任务队列（如块补全、向量重建、流式生成）。
- `electron/db/`：SQLite 访问层，按领域拆分模块：
  - `index.ts`：初始化连接、运行迁移、加载 sqlite-vec。
  - `migrations.ts`：全部 DDL（建表、FTS5 虚拟表、sqlite-vec 虚拟表）。
  - `blocks.ts` / `tags.ts` / `notebooks.ts` / `snapshots.ts` / `settings.ts` / `graph.ts`：对应领域的 CRUD。
  - `search.ts`：混合检索入口（标签 + FTS5 trigram + 向量），使用 `@node-rs/jieba` 做中文分词，结果以 reciprocal-rank 融合排序。
  - `vectors.ts`：向量写入与最近邻查询，维度动态适配。
- `electron/services/`：跨表/跨模块业务逻辑，重点包括：
  - `ai.ts`：OpenAI 兼容接口适配，维护 live/mock provider、配置指纹、探测与 token 统计。
  - `tagger.ts`：规则优先，LLM 兜底的标签与摘要生成。
  - `docgen.ts`：参考块筛选与流式文档生成。
  - `attachments.ts`：图片落盘、块附件索引同步、孤儿附件清理。
  - `importExport.ts`：Markdown / JSON 导入导出。

### 事件推送

主进程通过 `BrowserWindow.webContents.send()` 向渲染层推送实时事件，预加载层转发，渲染层在 `App.tsx` 中统一监听：

- `events:block-changed`：块补全（标签/向量/摘要）完成后推送
- `events:doc-stream`：文档流式生成的增量 token
- `events:doc-stream-end`：文档流式生成结束
- `events:task-queue-status`：后台任务队列状态变化

### 搜索与 AI 主链路

块被创建或编辑后，不会一次性同步完成全部 AI 处理，而是先落库为 `pending`，再由后台任务分阶段补全：

1. `blocks` 记录先写入数据库。
2. `tagger` 生成分类标签、细节标签和摘要，并优先把块状态推进到 `ready`。
3. 向量任务写入 `pending_block_vectors` 持久化队列。
4. `scheduleReindex()` 以单飞方式驱动批量 drain，embedding provider 再把向量写入 `sqlite-vec` 表。
5. 完成后通过 `events:block-changed` 推送块状态变化到渲染层；检索会先依赖标签 + FTS，随后被向量召回增强。

异步写回必须同时防止两类竞争：同一块的旧 enrich 任务覆盖新内容，以及块删除后晚到任务继续写标签、状态或向量。

检索不是单一路径：`electron/db/search.ts` 融合 **标签匹配 + FTS5 trigram + 向量召回**，再用 reciprocal-rank 方式合并排序。改搜索相关逻辑时，要把这三路一起看，不要只改某一层。

### AI 模式切换

AI 只在“配置存在 + 探测成功 + 当前配置指纹与上次探测一致”时进入 `live`；否则统一退回 `mock`。这个门控逻辑在 `electron/appContext.ts`，不要只改设置页而忽略运行时判定。

另外，向量维度不是写死的：会根据 embedding 探测结果或实际返回值动态调整 schema，并触发全量重建。

### Notebook / Snapshot / 导入导出

这是当前代码库里最容易漏看的第二条主线：

- `notebook_items` 是笔记本的真实内容模型，既能放 `block`，也能放 `heading` / `divider` / `note` / `todo` 等结构项。
- `notebook_reference_reviews` 保存引用块的 `excluded` / `locked` / `pinned` 审核状态。
- 笔记本生成文档时，不只是搜索已有块，还会把结构项整理成 `writingGuide` 一并送进 `docgen`。
- `snapshots` 可挂到 notebook 上。
- 导入导出走主进程服务，不是前端直接读写文件；Markdown 导入还会重写图片引用并接入本地附件体系。

### 渲染层组织方式

- `src/App.tsx` 是前端状态编排中心：管理 timeline / search / graph / snapshots / settings / notebook workspace 等视图，并监听文档流式事件。
- `src/hooks/` 承担数据访问和 UI 同步，尤其是 `useBlocks.ts`、`useTags.ts`、`useNotebooks.ts`。
- `src/lib/changbu.ts` 是渲染层对 `window.changbu` 的薄封装。渲染层新能力优先从这里进入，不要到处直接访问全局对象。

## 数据与存储

- 数据默认放在 Electron `userData/data` 目录下，主库文件是 `changbu.sqlite3`。
- 本地图片附件由主进程统一管理，并通过数据库维护块到附件的显式关联。
- `sqlite-vec` 加载失败时应用仍可运行，只是向量检索降级；不要把“向量不可用”当成“应用不可启动”。

## 关键约束

- `src/` 中禁止直接使用 Electron API。
- 修改 IPC 或 preload 暴露面时，必须同时检查共享类型、channel 常量、主进程 handler、preload 桥接和渲染层封装是否一致。
- `notebook_items` 已经取代旧的 `notebook_blocks` 作为笔记本内容源；涉及 notebook 数据结构时要保留迁移语义。
- 涉及 AI 配置、向量 schema、附件路径、数据库迁移的改动都属于高风险区域，先理解 `appContext.ts` 的完整链路再动手。
- 注释使用简体中文，UTF-8（无 BOM）。
- `dev` 命令通过 `concurrently` 并行启动三个进程：Vite 渲染器、tsup watch（主进程/预加载热重编译）、`electronmon`（Electron 进程自动重启）。
