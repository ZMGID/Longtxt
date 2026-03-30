# 长布

长布是一款本地优先的个人笔记工具，核心理念是：

> 只管记录，AI 负责组织。

当前仓库实现的是 **MVP v1**，重点验证这条核心链路是否成立：

- 在一条时间轴上持续记录
- 每条记录按块存储到本地 SQLite
- 系统自动生成标签与向量
- 用户按关键词、标签或主题检索历史块
- AI 基于召回块流式生成结构化文档

这个版本已经不是单纯骨架，而是一个可以本地跑通、可以接真实 OpenAI 兼容接口、可以做端到端验证的桌面应用。

## 当前能力

### 记录与浏览

- Electron + React + TypeScript + Vite 桌面应用
- 时间轴式块列表，最新内容默认在底部
- 块创建、编辑、删除
- 历史块分页懒加载
- 块级 Markdown 渲染

### 标签与检索

- 默认标签库初始化
- 规则优先 + LLM 兜底的自动标签
- 手动添加 / 删除标签
- 按标签浏览
- 标签 + FTS5 + sqlite-vec 混合检索
- 搜索结果关键词高亮

### AI 与文档生成

- OpenAI 兼容 Embedding / Chat API 接入
- 硅基流动兼容性验证
- 向量维度自适应（例如 `BAAI/bge-m3` 的 1024 维）
- 文档流式生成
- 文档 Markdown 阅读态展示

### 图片与附件

- 支持在输入框或块编辑区直接粘贴图片
- 图片文件保存到本地附件目录
- 块内插入 Markdown 图片链接
- `attachments` / `block_attachments` 数据表记录显式关联
- 删除块或移除图片引用后清理孤儿附件

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
  db/                    SQLite schema、CRUD、搜索、向量
  ipc/                   IPC handler 注册
  services/              AI、标签、附件、文档生成
shared/
  types.ts               主进程与渲染进程共享类型
  ipc.ts                 IPC channel 常量
src/
  App.tsx                主界面
  components/            时间轴、块卡片、搜索、设置等组件
  hooks/                 块、标签、分页状态管理
  lib/                   高亮、格式化等前端工具
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
pnpm typecheck
pnpm build
```

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
- 导入 / 导出
- 文档快照保存与分享
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
