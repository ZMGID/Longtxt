# Windows 构建与 UI 定制指南

## 概述

长布（Changbu）在 Windows 上需要隐藏系统默认菜单栏和标题栏，使用自定义无边框窗口 + 自定义窗口控制按钮（最小化、最大化、关闭）。macOS 保持原生交通灯按钮不变。

---

## 修改文件清单

每次拉取新版本后，需要检查/重新应用以下 **8 个文件**的改动：

| 文件 | 改动内容 |
|------|---------|
| `electron/main.ts` | 窗口无边框 + 菜单栏隐藏 + 窗口控制 IPC |
| `electron/preload.ts` | 暴露 window 控制方法 |
| `shared/ipc.ts` | 新增 `window.minimize` / `window.maximize` 通道 |
| `shared/types.ts` | `ChangbuApi` 新增 `window` 属性 |
| `src/lib/changbu.ts` | 渲染层封装新增 `window` getter |
| `src/App.tsx` | 顶栏右侧添加窗口控制按钮（仅 Windows） |
| `src/hooks/useNotebooks.test.tsx` | 测试 mock 补充 `window` 属性 |
| `electron-builder.yml` | 打包配置（一般不变） |

---

## 一、主进程改动（electron/main.ts）

### 1. 主窗口 — 去掉系统标题栏

```typescript
// 原始代码：
titleBarStyle: 'hiddenInset',
titleBarOverlay: { height: 28 },

// 改为（macOS 保持 overlay，Windows 用 frame: false）：
titleBarStyle: 'hiddenInset',
...(process.platform !== 'darwin'
  ? { frame: false }
  : { titleBarOverlay: { height: 28 } }),
```

创建窗口后加一行隐藏菜单栏：

```typescript
loadRendererWindow(window, 'main')
window.setMenuBarVisibility(false)  // 新增
```

### 2. 设置窗口 — 无边框

```typescript
// 原始代码：
titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',

// 改为：
titleBarStyle: 'hiddenInset',
...(process.platform !== 'darwin' ? { frame: false } : {}),
```

### 3. 回顾窗口 — 无边框

同设置窗口，改为：
```typescript
titleBarStyle: 'hiddenInset',
...(process.platform !== 'darwin' ? { frame: false } : {}),
```

### 4. 窗口控制 IPC handlers（在 bootstrap 的 extraHandlers 中）

```typescript
unregisterHandlers = registerIpcHandlers(appContext, {
  // ...已有的 settings.openWindow, review.openWindow ...

  // 新增 ↓
  [IPC_CHANNELS.window.minimize]: () => {
    mainWindow?.minimize()
  },
  [IPC_CHANNELS.window.maximize]: () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
    }
  },
})
```

---

## 二、IPC 通道（shared/ipc.ts）

在 `vectors` 后面新增：

```typescript
window: {
  minimize: 'window:minimize',
  maximize: 'window:maximize',
},
```

---

## 三、类型定义（shared/types.ts）

在 `ChangbuApi` 的 `vectors` 后面新增：

```typescript
window: {
  minimize(): Promise<void>
  maximize(): Promise<void>
}
```

---

## 四、预加载层（electron/preload.ts）

在 `vectors` 后面新增：

```typescript
window: {
  minimize: () => ipcRenderer.invoke(IPC_CHANNELS.window.minimize),
  maximize: () => ipcRenderer.invoke(IPC_CHANNELS.window.maximize),
},
```

---

## 五、渲染层封装（src/lib/changbu.ts）

新增 getter：

```typescript
get window() {
  return getApi().window
},
```

---

## 六、主页面顶栏（src/App.tsx）

在顶栏 `<div>` 中添加窗口控制按钮。关键点：
- 用 `navigator.platform` 检测平台（渲染层无法访问 `process.platform`）
- 外层容器加 `justify-between` 让标题和按钮分居两侧
- 按钮区域用 `window-no-drag` 避免拖拽冲突

```tsx
<div className="window-drag-region flex h-12 shrink-0 items-center justify-between ...">
  <h2 ...>{activeViewTitle}</h2>
  {typeof navigator !== 'undefined' && !/mac/i.test(navigator.platform) && (
    <div className="window-no-drag flex items-center gap-1">
      {/* 最小化按钮 */}
      <button onClick={() => { void changbu.window.minimize() }} ...>
        <svg>一条横线</svg>
      </button>
      {/* 最大化按钮 */}
      <button onClick={() => { void changbu.window.maximize() }} ...>
        <svg>一个方框</svg>
      </button>
      {/* 关闭按钮 */}
      <button onClick={() => { window.close() }} ...>
        <svg>X 形</svg>
      </button>
    </div>
  )}
</div>
```

---

## 七、测试 mock 补充

所有 mock `ChangbuApi` 的测试文件都需要补充 `window` 属性：

```typescript
window: {
  minimize: async () => {},
  maximize: async () => {},
},
```

目前涉及的测试文件：`src/hooks/useNotebooks.test.tsx`。如果新增测试也 mock 了 `ChangbuApi`，同样需要补充。

---

## 构建命令

```bash
# 拉取最新代码
git fetch origin
git stash
git merge origin/main
git stash pop

# 安装依赖（如有变化）
pnpm install

# 构建 Windows 安装包
pnpm package:win
```

安装包输出路径：`release\长布 Setup {version}.exe`

---

## 核心原理

| 概念 | Windows | macOS |
|------|---------|-------|
| 标题栏 | `frame: false` 彻底移除 | `titleBarStyle: 'hiddenInset'` 保留交通灯 |
| 菜单栏 | `setMenuBarVisibility(false)` | 无需处理 |
| 窗口控制 | 自定义 HTML 按钮 + IPC | 系统交通灯按钮 |
| 拖拽 | CSS `-webkit-app-region: drag` | 同左 |
| 平台检测 | `navigator.platform` | 同左 |

---

## 排查清单

如果拉取新版本后 Windows 标题栏/菜单栏又出现了，按以下顺序检查：

1. `electron/main.ts` — 三个 `create*Window` 函数是否还有 `frame: false`
2. `electron/main.ts` — 主窗口创建后是否还有 `setMenuBarVisibility(false)`
3. `shared/ipc.ts` / `shared/types.ts` / `electron/preload.ts` / `src/lib/changbu.ts` — `window` 相关代码是否被覆盖
4. `src/App.tsx` — 顶栏控制按钮是否存在
5. 测试文件 — mock 是否缺少 `window` 属性（会导致 tsc 报错）
