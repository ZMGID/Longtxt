import type { AppMeta } from '../../shared/types'

export type AppView = 'timeline' | 'search' | 'graph' | 'snapshots' | 'settings'

interface AppSidebarProps {
  activeView: AppView
  blockCount: number
  aiStatusLabel: string
  meta: AppMeta | null
  searchQuery: string
  onSelectView: (view: AppView) => void
}

const items: Array<{ id: AppView; label: string }> = [
  { id: 'timeline', label: '时间轴' },
  { id: 'search', label: '搜索生成' },
  { id: 'graph', label: '连接图' },
  { id: 'snapshots', label: '文档快照' },
  { id: 'settings', label: '设置' },
]

export function AppSidebar({ activeView, blockCount, aiStatusLabel, meta, searchQuery, onSelectView }: AppSidebarProps) {
  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-stone-200 bg-stone-100">
      {/* 应用标题 */}
      <div className="px-4 py-4">
        <h1 className="text-sm font-semibold text-stone-900">长布</h1>
      </div>

      {/* 导航 */}
      <nav className="flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const active = item.id === activeView

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              className={`w-full rounded-md px-3 py-1.5 text-left text-sm transition ${
                active
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-700 hover:bg-stone-200'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </nav>

      {/* 底部状态信息 */}
      <div className="mt-auto border-t border-stone-200 px-4 py-4 space-y-1">
        <p className="text-xs text-stone-500">{blockCount} 个块</p>
        <p className="text-xs text-stone-500">AI · {aiStatusLabel}</p>
        {meta?.vectorReady ? (
          <p className="text-xs text-stone-500">向量 · {meta.vectorDimension ?? '?'} 维</p>
        ) : null}
        {searchQuery.trim() ? (
          <p className="text-xs text-stone-400 truncate">主题：{searchQuery}</p>
        ) : null}
      </div>
    </aside>
  )
}
