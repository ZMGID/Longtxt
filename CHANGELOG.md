# Changelog

## Unreleased

- 修复块 enrich 异步竞争：旧任务不会再覆盖较新的标签、摘要或错误状态，删除后的块也不会被晚到任务写回
- 加固后台向量补齐 drain，确保 reindex 运行期间新入队任务也会继续处理到队列清空
- 同步 README 与 CLAUDE 文档到“标签/摘要即时补全，向量后台批处理补齐”的当前实现

## 0.1.0

- 初始化 Electron + React + TypeScript + Vite 桌面应用结构
- 接入 SQLite、FTS5、sqlite-vec 与向量维度自适应
- 实现块创建、编辑、删除、标签系统与按标签浏览
- 接入 OpenAI 兼容 Embedding / LLM API，并验证硅基流动兼容性
- 支持文档流式生成与 Markdown 阅读态展示
- 支持 Markdown 渲染、图片粘贴、本地附件保存与附件表关联
- 补齐时间轴历史懒加载、搜索入口形态、搜索高亮等 PRD 体验缺口
