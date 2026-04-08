interface TopBarProps {
  blockCount: number
  activeView: 'timeline' | 'graph' | 'snapshots'
  activePanel: 'search' | 'settings' | null
  aiStatusLabel: string
  searchPreview: string
  onSelectView: (view: 'timeline' | 'graph' | 'snapshots') => void
  onOpenSearch: () => void
  onOpenSettings: () => void
}

export function TopBar({ blockCount, activeView, activePanel, aiStatusLabel, searchPreview, onSelectView, onOpenSearch, onOpenSettings }: TopBarProps) {
  return (
    <header className="rounded-[32px] border border-stone-200/70 bg-white/70/75 px-6 py-5 shadow-[0_30px_80px_rgba(68,48,22,0.08)] backdrop-blur">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.34em] text-stone-400">Changbu v1.4.7</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold text-stone-900">长布</h1>
            <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-900">{blockCount} 个块</span>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium text-stone-700">{aiStatusLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-full bg-stone-100 p-1">
            {[
              ['timeline', '时间轴'],
              ['graph', '连接图'],
              ['snapshots', '文档'],
            ].map(([view, label]) => (
              <button
                key={view}
                type="button"
                onClick={() => onSelectView(view as 'timeline' | 'graph' | 'snapshots')}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  activeView === view ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-white/70'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onOpenSearch}
            className={`flex min-w-[320px] items-center justify-between rounded-full border px-5 py-3 text-sm transition ${
              activePanel === 'search' ? 'border-stone-900 bg-white/70 text-stone-900 shadow-sm' : 'border-stone-200 bg-stone-50 text-stone-600 hover:bg-white/70'
            }`}
          >
            <span className="truncate">{searchPreview || '搜索块或生成文档…'}</span>
            <span className="text-xs text-stone-400">⌘K</span>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`rounded-full px-5 py-3 text-sm font-medium transition ${activePanel === 'settings' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-800 hover:bg-stone-200'}`}
          >
            设置
          </button>
        </div>
      </div>
    </header>
  )
}
