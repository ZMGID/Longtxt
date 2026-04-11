# 长布 / Changbu

> 一款本地优先的 AI 笔记桌面应用，把 **随手记录、后续整理、长期检索、结构化生成** 串成同一条工作流。

当前版本：`v1.5.1`

## v1.5.1 更新

这次更新主要围绕时间轴输入体验、Markdown 图片处理、笔记本结构编辑恢复，以及主进程职责拆分展开。

- 时间轴输入框支持 `Enter` 换行、`Shift+Enter` 创建块
- 输入框左下新增 Markdown 快捷工具：标题、加粗、斜体、代码块、无序列表、有序列表
- 输入区支持整张卡片范围内拖入图片插入
- Markdown 图片支持单击选中、右下角拖拽缩放、右键复制图片 / 复制地址 / 查看源码 / 重置宽度 / 删除图片
- 笔记本重新恢复 `heading / divider / note / todo` 结构项创建
- 修复 review 中发现的缓存失效、snapshot Promise 语义和输入校验回归
- 调整时间轴页布局与交互更新方式，减少不必要重渲染，滚动和切换更顺
- `electron/appContext.ts` 拆分为多个子模块，便于继续维护

---

## 长布是什么

长布不是一个“再做一个编辑器”的项目。

它更关注另一件事：

**当你持续记录碎片化内容时，怎样让这些内容在未来仍然可检索、可连接、可整理、可生成。**

在长布里，你可以先写，再整理。

- 先在时间轴里把想法、摘录、任务、草稿、图片记下来
- 系统把内容按块存到本地 SQLite
- 再补标签、摘要、向量索引
- 然后通过搜索、笔记本、快照、回顾与 AI 生成，把这些碎片重新组织起来

它适合这类使用者：

- 想把日常记录和 AI 真正结合起来的人
- 习惯中文写工作日志、学习笔记、写作素材的人
- 希望数据尽量保留在本地，但又不想放弃 AI 检索和生成能力的人

---

## 核心能力

### 1. 时间轴记录

- 像日志一样持续记录内容
- 支持块创建、编辑、删除
- 支持 Markdown 内容渲染
- 输入框支持 Markdown 快捷操作与图片拖入
- `Enter` 换行，`Shift+Enter` 快速创建块
- 支持分页懒加载和较平滑的大列表浏览

### 2. 标签与混合检索

- 默认标签体系初始化
- 支持手动加标签 / 删标签
- 支持规则优先 + LLM 兜底的自动标签与摘要
- 支持 `标签 + FTS5 + 向量` 的混合召回
- 搜索结果支持关键词高亮与预览提取

### 3. 笔记本整理

- 支持把引用块整理进 Notebook
- 支持 `block / heading / divider / note / todo` 混排
- 支持倒序浏览、结构化编辑、手动重排
- 支持继续创建结构项，不只是引用已有块
- 支持从检索结果把相关块加入当前笔记本
- 支持把结构项作为写作引导参与后续生成

### 4. 快照与文档生成

- 支持围绕主题召回相关块
- 支持流式生成结构化 Markdown 文档
- 支持保存与读取文档快照
- 支持 notebook 关联快照

### 5. 每日回顾与 AI 洞察

- 支持每日回顾
- 支持 AI insight / pattern 分析
- 支持把生成结果保存为快照

### 6. 图片与附件

- 支持直接粘贴图片
- 支持直接拖入图片
- 图片保存到本地附件目录
- 块中自动插入 Markdown 图片链接
- Markdown 图片支持预览态缩放和右键操作
- 支持附件关联与孤儿附件清理

### 7. 数据管理与导入导出

- 支持 Markdown / JSON 导入导出
- JSON 备份可包含附件与设置快照
- 支持按天清理块数据
- 支持查看和维护本地数据目录

### 8. 本地优先运行

- 主要数据保存在本地
- 未配置 AI 时可继续以 `mock` 模式运行
- 配置通过后再切换到 `live` 模式

---

## 产品结构

长布当前的主要工作区包括：

- **时间轴**：持续记录内容
- **日历**：按日期回看内容与计划
- **搜索**：按关键词、标签、向量召回历史块
- **笔记本**：把块整理成可写作的结构
- **连接图**：从标签与关联角度浏览内容网络
- **文档快照**：保存生成结果与沉淀版本
- **数据管理**：查看、清理和维护本地数据

---

## 技术实现概览

### 渲染层

- React 19
- TypeScript
- Vite
- Tailwind CSS

### 桌面与进程模型

- Electron
- `preload` 暴露受控 API
- `AppContext Worker` 承担数据访问与后台任务
- 主窗口尽量只负责 UI 和交互

### 数据层

- SQLite
- FTS5 全文检索
- `sqlite-vec` 向量检索
- `better-sqlite3` 本地高性能访问

### AI 接入

- OpenAI 兼容 Chat / Embedding API
- 向量维度自适应
- 向量补齐走持久化队列 + 后台批处理

---

## 项目目录

```text
electron/
  main.ts                Electron 主进程入口
  preload.ts             contextBridge API
  appContext.ts          应用服务装配
  appContext-*.ts        AppContext 按职责拆分后的子模块
  appContextWorker.ts    后台 worker
  db/                    SQLite schema、CRUD、检索与向量
  ipc/                   IPC handler 注册
  services/              AI、标签、附件、导入导出等服务

shared/
  types.ts               主进程 / 渲染进程共享类型
  ipc.ts                 IPC channel 常量
  searchPreview.ts       搜索结果预览提取

src/
  App.tsx                应用主入口
  app/                   视图预加载、文档状态、视图注册等应用层工具
  components/            时间轴、搜索、笔记本、快照等界面组件
  hooks/                 数据访问与状态封装
  lib/                   前端工具函数
```

---

## 快速开始

### 环境要求

- Node.js 20+
- pnpm
- macOS 开发环境优先

### 安装依赖

```bash
pnpm install
```

首次安装会自动执行原生依赖重建，以匹配 Electron ABI。

### 本地开发

```bash
pnpm dev
```

### 常用命令

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

### 打包

```bash
pnpm package:dir
pnpm package:mac
pnpm package:win
```

打包产物默认输出到：

```text
release/
```

---

## AI 配置

设置页支持配置两类 OpenAI 兼容接口：

- **LLM**
- **Embedding**

应用会在测试连接时执行真实探测，包括：

- 模型可用性检查
- Embedding 请求
- Chat 请求
- 流式输出检查

只有在配置存在且测试通过后，应用才会进入 `live` 模式；否则继续使用 `mock` 模式。

---

## 数据与隐私

长布是本地优先应用。

默认情况下，主要数据位于 Electron 的 `userData` 目录中，通常包括：

- `changbu.sqlite3`
- `attachments/`

如果你不配置外部 AI 接口，应用的大部分本地记录、整理、浏览流程仍然可用。

---

## 当前状态

长布目前已经不是静态原型，而是一个可以本地跑通的桌面应用 MVP。

当前已经具备：

- 完整记录链路
- 本地数据落盘
- 标签与搜索
- 笔记本整理
- 文档快照
- AI 回顾 / 洞察
- 导入导出与数据管理

仍在持续打磨的部分包括：

- 更成熟的公开发布材料
- 更完整的 Windows 分发验证
- 更稳定的安装包签名 / 公证流程
- 更进一步的多设备与同步能力

---

## 相关文档

- [CHANGELOG](./CHANGELOG.md)
- [CONTRIBUTING](./CONTRIBUTING.md)
- [SECURITY](./SECURITY.md)
- [开源发布清单](./docs/open-source-release.md)

---

## License

当前仓库**暂未附正式开源许可证**。

如果你准备将该项目用于公开分发、二次发布或商业使用，请先确认许可证策略。
