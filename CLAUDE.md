# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

**长布（Changbu）**：本地优先的 Electron 桌面笔记应用。核心链路是：时间轴记录块 → 标签/摘要补全 → 向量后台批处理 → 混合检索 → AI 流式生成文档。

当前架构重点不是“主进程直接包揽一切”，而是：**窗口与 Electron 生命周期主要留在 `electron/main.ts`，数据与任务执行集中在 `AppContext Worker` + `AppContext`**。

## 技术栈

Electron · React 19 · TypeScript · Vite 8 · Tailwind CSS v4（零配置） · TanStack Query · better-sqlite3 · SQLite FTS5 + sqlite-vec（可选） · @node-rs/jieba（中文分词） · react-force-graph-2d（知识图谱） · CodeMirror（Markdown 编辑）

## 常用命令

```bash
pnpm install          # 安装依赖，并重建 better-sqlite3 等 Electron 原生模块
pnpm dev              # 启动完整开发环境（dev:prepare-bundle + Vite + tsup watch + Electron）
pnpm dev:renderer     # 仅启动 renderer（Vite，127.0.0.1:5173）
pnpm dev:electron     # 仅启动 tsup watch，重建 main / preload / worker
pnpm dev:app          # 仅在 renderer 与 dist-electron 入口齐备后启动 Electron
pnpm dev:prepare-bundle # 预生成 dev 所需 bundle 文件
pnpm test             # 在 Electron 进程内运行默认 Vitest 套件
pnpm test:watch       # 监听模式运行 Vitest
pnpm test:manual-live # 运行显式标记的 live/manual 测试
pnpm test:smoke-release # 默认测试 + 未打包目录构建
pnpm typecheck        # TypeScript 项目构建检查（tsc -b）
pnpm lint             # ESLint
pnpm build            # typecheck + Vite 构建 + tsup 打包主进程/预加载/worker
pnpm preview          # 预览 Vite renderer 构建产物
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
- 默认测试不是标准 Node 进程，而是 `ELECTRON_RUN_AS_NODE=1 electron ...vitest.mjs`

## 路径别名与构建边界

TypeScript 和 Vite 共享以下别名：

- `@/*` → `src/`
- `@shared/*` → `shared/`
- `@electron/*` → `electron/`

构建边界要特别注意：

- 渲染进程由 Vite 处理；主进程、预加载和 worker 由 `tsup` 单独打包到 `dist-electron/{main,preload,appContextWorker}.cjs`
- `electron/main.ts`、`electron/preload.ts`、`electron/appContextWorker.ts` 的构建语义以 `tsup.config.ts` 为准，不经过 Vite
- `pnpm dev` 会先执行 `electron/prepareDevBundle.mjs`，然后并行启动 Vite、tsup watch、electronmon
- Electron 只有在 `dist-electron/main.cjs`、`preload.cjs`、`appContextWorker.cjs` 全部就绪后才会启动
- 主进程 / worker 里使用路径别名时，要确认 tsup 能正确解析；不确定时优先相对路径

## 架构总览

### 运行时分层

- **渲染进程**（`src/`）：React UI，只能通过 `window.changbu` 调主进程能力，禁止直接引入 Electron API。
- **预加载层**（`electron/preload.ts`）：唯一桥接层，暴露 `ChangbuApi`，并把事件流转成渲染层可订阅接口。
- **主进程**（`electron/main.ts`）：负责窗口生命周期、自定义协议、IPC 注册、事件批处理、退出协调、CLI 入口分流。
- **Worker 线程**（`electron/appContextWorker.ts` + `electron/appContextWorkerClient.ts`）：真正承载 `AppContext` 的数据访问和后台任务执行；主进程只通过代理调用它。
- **共享层**（`shared/`）：跨进程类型、IPC channel、默认设置、事件批处理协议、搜索预览逻辑。

### 跨进程 API 改动链路

新增或修改桌面 API 时，通常要同时更新以下几处，缺一处就会断：

1. `shared/types.ts`
2. `shared/ipc.ts`
3. `electron/appContext-types.ts`
4. `electron/appContext.ts`
5. `electron/ipc/register.ts`
6. `electron/preload.ts`
7. `src/lib/changbu.ts`

### 主进程 / Worker 核心组织

- `electron/main.ts`：Electron 生命周期入口，创建主窗口 / 设置窗口 / 回顾窗口，注册 IPC，注册 `changbu-attachment://` 协议，聚合并批量转发 block/notebook/meta/calendar 事件，并在退出前等待 `appContext.whenIdle()`。
- `electron/appContextWorkerClient.ts`：主进程到 worker 的 RPC 代理层；文件选择、目录选择、`openPath` 这类必须经过宿主能力的调用，会从 worker 回调到主进程执行。
- `electron/appContextWorker.ts`：worker 线程入口，把 `AppContext` 的事件重新发回主进程。
- `electron/appContext.ts`：核心编排层。数据库、AI provider、标签补全、文档生成、回顾生成、附件、导入导出、外部接入、向量队列都在这里汇合。
- `electron/db/`：按领域拆表和查询；`index.ts` 同时负责 sqlite-vec 扩展加载、基础迁移、历史 notebook 结构迁移。
- `electron/services/`：承载跨表逻辑，主要包括 `ai.ts`、`tagger.ts`、`docgen.ts`、`attachments.ts`、`importExport.ts`、`review.ts`。
- `electron/cli.ts`：CLI 模式直接创建 `AppContext`，不经过 worker；排查桌面与 CLI 差异时要记住这一点。

### 渲染层状态模型

- `src/main.tsx` 根据 URL query 决定挂载主窗口、设置窗口还是回顾窗口：默认主窗口，`?window=settings` 和 `?window=review` 分别进入独立壳层。
- 三个窗口都包在同一套 `QueryClientProvider` + `I18nProvider` 之下，但各自使用不同入口组件：`App.tsx`、`SettingsWindowApp.tsx`、`ReviewWindowApp.tsx`。
- `src/App.tsx` 是主窗口状态编排中心：切换 timeline / search / graph / snapshots / settings / notebook / calendar / data-management 等视图，并处理文档流式生成、预取和上下文跳转。
- 渲染层数据访问主要放在 `src/hooks/`，底层依赖 TanStack Query。
- `src/lib/queryKeys.ts` 定义统一 query key；`src/lib/changbu.ts` 是渲染层访问 `window.changbu` 的唯一薄封装。
- 实时刷新不是到处手动同步本地 state：`ChangbuEventBridge.tsx` 订阅批量事件，先更新 block list cache，再按需失效 query roots，并对 graph / calendar / review 的失效做 debounce。
- `shared/eventBatch.ts` 和 `shared/searchPreview.ts` 是跨进程共用协议，不要在 preload / renderer / main 各写一套相似逻辑。

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
- 搜索结果预览由 `shared/searchPreview.ts` 统一生成；修改搜索展示时，先看是不是该复用这条共享链路。
- AI 只有在“配置存在 + 探测成功 + 当前配置指纹与上次探测一致”时才进入 `live`；否则统一退回 `mock`。
- 向量维度不是写死的，会根据 embedding 探测结果或真实返回值动态调整 schema，并可能触发全量重建。

### Notebook / Snapshot / Calendar / 导入导出

这是第二条最容易低估复杂度的主线：

- `notebook_items` 是 notebook 的真实内容模型，支持 `block`、`heading`、`divider`、`note`、`todo` 混排。
- `notebook_reference_reviews` 保存引用块的 `excluded` / `locked` / `pinned` 审核状态；生成 notebook 文档时，这部分状态会参与引用块筛选。
- `snapshots` 可以挂到 notebook 上。
- 导入导出和附件读写都走主进程 / worker，不是前端直接读写文件；Markdown 导入还会把图片引用重写进本地附件体系。
- 日历不是孤立模块：`calendar.ts` 同时处理手动条目、AI 建议，以及与 block 时间轴联动的热力图 / 日详情 / 回顾生成。
- 回顾窗口和主窗口不是两套后端逻辑：`review.ts`、`ReviewWindowApp.tsx`、`useTimelineReviewWindow.ts` 只是同一数据模型的不同呈现方式。

## 设置、存储与外部接入

- 数据默认放在 Electron `userData/data` 目录下，主库文件是 `changbu.sqlite3`。
- `shared/config.ts` 维护默认设置、边界值和解析逻辑；改设置项时，通常要同时检查设置页 UI、shared parser/normalizer、主进程读写链路。
- 并不是所有设置都只存数据库：`electron/settingsFile.ts` 会把一部分关键设置持久化到 `changbu-settings.json`，并通过 lock 文件 + 临时文件 rename 做原子写入。
- 当前 file-backed 设置至少包括：`ai_config`、最近一次 API 探测结果、token usage totals、block enrich / doc generation / calendar / external access / ui 设置。
- `src/i18n/` + `shared/config.ts` 共同决定界面语言、窗口标题和本地化格式；设置语言后，主进程会通过 meta 事件刷新窗口标题。
- `sqlite-vec` 加载失败时应用仍可运行，只是向量检索降级；不要把“向量不可用”当成“应用不可启动”。
- 外部接入链路在 `electron/externalAccess.ts` 与 `electron/cli.ts`：启用后会在用户数据目录下生成本地 CLI wrapper、指南和 skill 适配文件；改这里时要同时考虑桌面设置页、CLI 行为和生成物格式是否一致。

## 关键约束

- `src/` 中禁止直接使用 Electron API。
- 渲染层如果报“请通过 Electron 启动应用”，优先检查是不是 preload 未注入（`window.changbu` 缺失），不要先误判成前端业务逻辑错误。
- 修改 IPC 或 preload 暴露面时，必须完整检查共享类型、channel 常量、主进程 handler、preload 桥接和渲染层封装。
- `notebook_items` 已取代旧的 `notebook_blocks` 作为 notebook 内容源；涉及 notebook 结构时要保留迁移语义。
- 涉及 AI 配置门控、向量 schema、附件路径、数据库迁移、设置持久化、外部接入、窗口状态持久化的改动都属于高风险区域，先读完整链路再动手。
- 主窗口、设置窗口、回顾窗口是同一个 renderer bundle 的不同入口，不要把“新窗口”误当成“新项目”。
- 注释使用简体中文，UTF-8（无 BOM）。
