import type { ReactNode } from 'react'

import type { AppMeta } from '../../shared/types'

export type AppView = 'timeline' | 'search' | 'notebooks' | 'graph' | 'snapshots' | 'settings'

interface AppSidebarProps {
  activeView: AppView
  blockCount: number
  aiStatusLabel: string
  meta: AppMeta | null
  onSelectView: (view: AppView) => void
}

interface SidebarItem {
  id: AppView
  label: string
  icon: (props: { active: boolean }) => ReactNode
}

const items: SidebarItem[] = [
  { id: 'timeline', label: '时间轴', icon: ({ active }) => <TimelineIcon active={active} /> },
  { id: 'search', label: '搜索生成', icon: ({ active }) => <SearchIcon active={active} /> },
  { id: 'notebooks', label: '笔记本', icon: ({ active }) => <NotebookIcon active={active} /> },
  { id: 'graph', label: '连接图', icon: ({ active }) => <GraphIcon active={active} /> },
  { id: 'snapshots', label: '文档快照', icon: ({ active }) => <SnapshotIcon active={active} /> },
  { id: 'settings', label: '设置', icon: ({ active }) => <SettingsIcon active={active} /> },
]

export function AppSidebar({ activeView, blockCount, aiStatusLabel, meta, onSelectView }: AppSidebarProps) {
  return (
    <aside
      data-testid="app-sidebar"
      className="flex w-[68px] shrink-0 flex-col border-r border-black/5 bg-stone-100/80"
    >
      <div className="window-drag-region h-12 shrink-0" />

      <nav className="flex flex-col items-center gap-2 px-2 pt-3">
        {items.map((item) => {
          const active = item.id === activeView

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectView(item.id)}
              aria-label={item.label}
              title={item.label}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition duration-200 active:scale-[0.97] ${
                active
                  ? 'bg-black/[0.08] text-stone-900'
                  : 'text-stone-600 hover:bg-black/[0.04]'
              }`}
            >
              {item.icon({ active })}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2 px-2 pb-3">
        <SidebarStat
          value={formatCompactNumber(blockCount)}
          label="块"
          title={`${blockCount} 个块`}
        />
        <SidebarStat
          value={getCompactAiStatus(meta)}
          label="AI"
          title={`AI · ${aiStatusLabel}`}
        />
        {meta?.vectorReady ? (
          <SidebarStat
            value={formatCompactNumber(meta.vectorDimension)}
            label="维"
            title={`向量 · ${meta.vectorDimension ?? '?'} 维`}
          />
        ) : null}
      </div>
    </aside>
  )
}

function SidebarStat({ value, label, title }: { value: string; label: string; title: string }) {
  return (
    <div
      title={title}
      className="flex w-11 flex-col items-center rounded-xl bg-black/[0.04] px-1 py-1.5 text-center text-stone-500"
    >
      <span className="text-[11px] font-semibold leading-none text-stone-800">{value}</span>
      <span className="mt-1 text-[9px] uppercase tracking-[0.12em]">{label}</span>
    </div>
  )
}

function formatCompactNumber(value: number | null | undefined): string {
  if (!value || value < 0) {
    return '?'
  }

  if (value >= 1000) {
    return `${Math.round(value / 100) / 10}k`.replace('.0k', 'k')
  }

  return `${value}`
}

function getCompactAiStatus(meta: AppMeta | null): string {
  if (!meta?.aiConfigured || meta.activeAiMode === 'mock') {
    return 'Mock'
  }

  if (meta.lastAiError) {
    return 'Err'
  }

  return 'Live'
}

function SidebarIconFrame({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-stone-900' : 'text-stone-500'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function TimelineIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <path d="M7 6h11" />
      <path d="M7 12h11" />
      <path d="M7 18h11" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </SidebarIconFrame>
  )
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <circle cx="11" cy="11" r="5" />
      <path d="m16 16 4 4" />
      <path d="M18 5v3" />
      <path d="M16.5 6.5h3" />
    </SidebarIconFrame>
  )
}

function GraphIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <circle cx="6" cy="8" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="14" cy="18" r="2" />
      <path d="m7.8 8.8 8.4-1.6" />
      <path d="m7.4 9.7 5.2 6.5" />
      <path d="m17.2 7.8-2.1 8.2" />
    </SidebarIconFrame>
  )
}

function NotebookIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <path d="M6.5 5h8l3 3V18a1 1 0 0 1-1 1h-10A1.5 1.5 0 0 1 5 17.5v-11A1.5 1.5 0 0 1 6.5 5Z" />
      <path d="M14.5 5v3h3" />
      <path d="M8.5 11h7" />
      <path d="M8.5 14h7" />
      <path d="M8.5 17h4" />
    </SidebarIconFrame>
  )
}

function SnapshotIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <path d="M8 4.5h6l4 4V19a1 1 0 0 1-1 1H8a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z" />
      <path d="M14 4.5V9h4" />
      <path d="M9 13h6" />
      <path d="M9 16h6" />
    </SidebarIconFrame>
  )
}

function SettingsIcon({ active }: { active: boolean }) {
  return (
    <SidebarIconFrame active={active}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v2" />
      <path d="M12 17.5v2" />
      <path d="m18.5 6.5-1.4 1.4" />
      <path d="m6.9 18.1-1.4 1.4" />
      <path d="M19.5 12h-2" />
      <path d="M6.5 12h-2" />
      <path d="m18.5 17.5-1.4-1.4" />
      <path d="m6.9 5.9-1.4-1.4" />
    </SidebarIconFrame>
  )
}
