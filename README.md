# 长布

长布（Changbu）是一款**本地优先的 AI 笔记桌面应用**，面向希望长期沉淀个人知识、工作记录与写作素材的中文用户。

它想解决的不是“怎么再做一个编辑器”，而是另一件事：

> 当你持续记录时，如何让这些碎片在未来仍然可检索、可连接、可生成。

在长布里，你不需要先想清楚分类结构再开始写。你可以先把内容记下来，系统会把每条记录按块落到本地 SQLite，再逐步补上标签、摘要、向量索引和文档生成能力，让“随手记”和“后整理”走同一条链路。

当前发布版本：`v1.4.8`

## v1.4.8 更新

- 引入 AppContext Worker，把主进程里的数据与任务执行进一步收口，减少窗口侧同步负担
- 新增事件批处理与块列表缓存，时间轴、搜索和笔记本的增量更新路径更稳定，切页与回填抖动更少
- 继续补强每日回顾 / AI 洞察 / 文档引用链路，相关状态与共享类型进一步统一
- 修复连接图筛选切换后的布局异常，以及同名标签在 manual / auto 混合来源下的边权计算偏差
- 修复搜索结果虚拟列表状态串位、搜索缓存失效与多处渲染细节问题，并补上对应测试

## 这个项目适合谁

- 想把聊天式 AI 和长期知识沉淀结合起来的人
- 习惯用中文记录工作日志、学习笔记、创作素材的人
- 希望数据尽量留在本地、同时又能用 AI 做检索和整理的人

## 长布如何工作

1. 在时间轴里持续记录想法、事件、任务、摘录和草稿
2. 每条记录按块存储到本地 SQLite
3. 系统先补全标签与摘要，再由后台批处理补齐向量
4. 用户按关键词、标签或主题检索历史块
5. AI 基于召回块流式生成结构化文档

这个仓库当前提供的不是静态原型，而是一个可以本地跑通、可以接真实 OpenAI 兼容接口、可以完成端到端验证的桌面应用。

## 当前能力

### 记录与浏览

- Electron + React + TypeScript + Vite 桌面应用
- 时间轴式块列表，最新内容默认在底部
- 块创建、编辑、删除
- 历史块分页懒加载
- 块列表缓存与增量回填，减少大列表切换和局部更新闪烁
- 块级 Markdown 渲染

### 标签与检索

- 默认标签库初始化
- 规则优先 + LLM 兜底的自动标签与摘要
- 手动添加 / 删除标签
- 按标签浏览
- 标签 + FTS5 + sqlite-vec 混合检索
- 搜索结果关键词高亮
- 搜索结果预览提取与虚拟列表复用优化
- 新建或更新后先依赖标签 + FTS 检索，向量命中由后台批处理补强

### AI 与文档生成

- OpenAI 兼容 Embedding / Chat API 接入
- 硅基流动兼容性验证
- 向量维度自适应（例如 `BAAI/bge-m3` 的 1024 维）
- 向量补齐进入持久化队列，并由单飞后台批处理 drain
- 快速连续编辑或删除块时，旧 enrich / 向量任务不会回写过期结果
- 文档流式生成
- 文档 Markdown 阅读态展示
- 每日回顾 / AI 洞察 / 文档引用共享检索与事件同步基础设施

### 图片与附件

- 支持在输入框或块编辑区直接粘贴图片
- 图片文件保存到本地附件目录
- 块内插入 Markdown 图片链接
- `attachments` / `block_attachments` 数据表记录显式关联
- 删除块或移除图片引用后清理孤儿附件

### 笔记本、快照与导入导出

- Notebook 支持 block / heading / divider / note / todo 混排
- Notebook 引用块支持 excluded / locked / pinned 审核状态
- 生成文档时会把结构项整理成 writing guide 参与生成
- 支持保存和读取 notebook 关联快照
- 支持 Markdown / JSON 导入导出
- JSON 完整备份会同时包含附件与设置快照，适合整机迁移与恢复
- Markdown 导入会复用同一条 enrich + 后台向量补齐链路

### 运行时与架构

- AppContext Worker + client 通道，减少主窗口直接承载的数据访问职责
- 跨窗口事件批处理，降低高频块变更时的渲染层同步压力
- timeline derived / block list cache / search preview 等前端基础设施已拆出独立模块并补充测试
- 连接图、搜索、时间轴和笔记本都补上了更细粒度的缓存失效与状态复用控制

## 技术栈

- Electron
- React 19
- TypeScript
- Vite
- Tailwind CSS
- better-sqlite3
- SQLite FTS5
- sqlite-vec
- react-virtuoso
- react-markdown

## 项目结构

```text
electron/
  main.ts                Electron 主进程
  preload.ts             contextBridge API
  appContext.ts          应用服务装配
  appContextWorker.ts    后台数据与任务 worker
  appContextWorkerClient.ts Worker 客户端桥接
  db/                    SQLite schema、CRUD、搜索、向量
  ipc/                   IPC handler 注册
  services/              AI、标签、附件、文档生成
shared/
  types.ts               主进程与渲染进程共享类型
  ipc.ts                 IPC channel 常量
  eventBatch.ts          跨窗口事件批处理协议
  searchPreview.ts       搜索结果预览提取
src/
  App.tsx                主界面
  components/            时间轴、块卡片、搜索、设置等组件
  hooks/                 块、标签、分页状态管理
  lib/                   缓存、导出、预览、高亮等前端工具
```

## 本地开发

### 安装

```bash
pnpm install
```

首次安装会自动执行 `electron-builder install-app-deps`，把 `better-sqlite3` 重编到 Electron ABI。

### 运行

```bash
pnpm dev
```

### 测试与构建

```bash
pnpm test
pnpm test:manual-live
pnpm typecheck
pnpm build
```

说明：

- `pnpm test` 只运行默认自动化测试，适合本地日常开发和 CI
- `pnpm test:manual-live` 会执行显式标记的 live/manual 临时测试，可能访问真实配置和真实数据，只应在确认环境后手动运行

### 打包命令

```bash
pnpm package:dir
pnpm package:mac
pnpm package:win
```

说明：

- 当前仓库重点是桌面应用，不是 npm 包，所以 `package.json` 仍保持 `private: true`
- Windows 打包配置已经存在，但是否可对外分发仍需单独验证

## 数据存储

应用数据默认存放在 Electron 的 `userData` 目录下，例如 macOS 上通常是：

```text
~/Library/Application Support/Electron/data
```

当前主要数据包括：

- `changbu.sqlite3`
- `attachments/` 本地附件目录

## AI 配置

设置页支持填写两组 OpenAI 兼容配置：

- LLM
- Embedding

应用会在“测试连接”时执行真实探测，包括：

- 模型列表检测
- Embedding 请求
- 非流式 Chat 请求
- 流式 Chat 请求

只有在配置存在且测试通过后，应用才会切换到 `live` 模式；否则继续使用 `mock` 模式。

## 当前边界

这个版本已经适合做 MVP 验证，但还不是完整产品。当前仍未覆盖：

- 多设备同步
- 连接图可视化
- 完整富文本编辑器（当前为 Markdown + textarea）
- 快照分享能力
- 面向公开发布的 Windows 安装包验证

## 开源发布前建议

在公开仓库之前，建议先完成以下事项：

1. 选择并添加正式许可证
2. 确认 README 中的产品定位、截图和演示方式
3. 检查是否有任何本地 API Key、缓存或测试数据被提交
4. 验证至少一条公开可运行的 API 配置说明
5. 整理首个公开版本的 changelog

更完整的发布清单见：

- [开源发布清单](./docs/open-source-release.md)
- [贡献指南](./CONTRIBUTING.md)
- [安全说明](./SECURITY.md)
- [变更记录](./CHANGELOG.md)

## 状态

当前更准确的状态是：

- 核心产品型 MVP：已跑通
- PRD 体验层：已大幅补齐
- 开源发布材料：已整理
- 许可证选择：**尚未确定**

在许可证未选定之前，这个仓库更适合作为“待公开整理中的项目”。
