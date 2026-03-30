# Repository Guidelines

## 项目结构与模块组织
`src/` 是 React 渲染层：`components/` 放界面组件，`hooks/` 放状态与数据访问逻辑，`lib/` 放前端工具函数，`assets/` 放打包资源。`electron/` 是桌面端主进程与基础设施，包括 `main.ts`、`preload.ts`、`ipc/`、`services/` 和 `db/`。`shared/` 存放跨进程共享类型与 IPC 常量。`public/` 是静态资源，`docs/` 是补充文档，`dist/` 与 `dist-electron/` 是构建产物，不要手动修改。

## 构建、测试与开发命令
使用 `pnpm install` 安装依赖，并为 Electron 重建原生模块。使用 `pnpm dev` 同时启动 Vite、Electron 构建监听和桌面应用。使用 `pnpm test` 运行 Vitest，`pnpm typecheck` 执行 `tsc -b`，`pnpm lint` 运行 ESLint，`pnpm build` 生成完整生产构建。打包命令包括 `pnpm package:dir`、`pnpm package:mac` 和 `pnpm package:win`。

## 代码风格与命名约定
项目以 TypeScript 为主，使用 ES Modules、React 函数组件、2 空格缩进和无分号风格。组件文件使用 `PascalCase`，如 `SearchPanel.tsx`；hooks 与工具函数使用 `camelCase`，如 `useBlocks.ts`、`format.ts`；测试文件采用 `*.test.ts` 或 `*.test.tsx`。渲染层与主进程通信统一通过 `window.changbu`，不要在 `src/` 中直接引入 Electron API。

## 测试规范
测试框架为 Vitest。渲染层测试配合 Testing Library，初始化在 `src/test/setup.ts`；主进程、IPC 和数据库相关测试位于 `electron/__tests__/`。新增功能应补充对应测试，前端测试尽量与模块同目录放置。提交前至少运行 `pnpm test`、`pnpm typecheck` 和 `pnpm build`。

## 提交与 Pull Request 规范
当前工作副本不包含 `.git`，因此无法从本地历史精确总结提交格式。建议使用简短、祈使句风格的提交标题，并保持改动小步、可验证、易回滚，这也符合 `CONTRIBUTING.md` 的要求。PR 需要说明变更范围、标注 schema 或 IPC 调整、关联 issue，并在涉及界面时附上截图或录屏。

## 安全与配置提示
不要提交 API Key、本地数据库、附件目录或个人数据。修改 `electron/preload.ts`、IPC 暴露面、附件路径处理或 SQLite migration 时要特别谨慎。涉及安全问题时，按 `SECURITY.md` 中的私下披露方式处理。
