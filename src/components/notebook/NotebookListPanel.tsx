import { useState } from 'react'

import type { Notebook, NotebookSummary } from '../../../shared/types'
import { formatTimeLabel } from '../../lib/format'
import { ActionButton } from '../ui/ActionButton'
import { notebookListSummaryLabel } from './utils'

interface NotebookListPanelProps {
  notebooks: NotebookSummary[]
  selectedNotebookId: string | null
  selectedNotebook: Notebook | null
  loading: boolean
  searchPanelOpen: boolean
  onSelectNotebook: (id: string) => void
  onCreateNotebook: () => Promise<void>
  onDeleteNotebook: (id: string) => Promise<void>
  onToggleSearchPanel: () => void
}

export function NotebookListPanel({
  notebooks,
  selectedNotebookId,
  selectedNotebook,
  loading,
  searchPanelOpen,
  onSelectNotebook,
  onCreateNotebook,
  onDeleteNotebook,
  onToggleSearchPanel,
}: NotebookListPanelProps) {
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-stone-200 pb-3">
        <ActionButton
          active={searchPanelOpen}
          onClick={onToggleSearchPanel}
          testId="notebook-search-toggle"
          className="w-full px-3 py-2 text-xs"
        >
          检索块
        </ActionButton>

        <div className="mt-2 grid grid-cols-2 gap-2">
          <ActionButton
            onClick={() => {
              void onCreateNotebook()
            }}
            active
            className="px-3 py-2 text-xs"
          >
            新建笔记本
          </ActionButton>
          <ActionButton
            danger={deleteConfirm}
            disabled={!selectedNotebook}
            onClick={() => {
              if (!selectedNotebook) {
                return
              }

              if (deleteConfirm) {
                setDeleteConfirm(false)
                void onDeleteNotebook(selectedNotebook.id)
              } else {
                setDeleteConfirm(true)
              }
            }}
            className="px-3 py-2 text-xs"
          >
            {deleteConfirm ? '确认删除?' : '删除笔记本'}
          </ActionButton>
        </div>
      </div>

      <div className="mt-3 min-h-0 overflow-y-auto pr-1">
        {loading ? (
          <p className="text-sm text-stone-400">加载笔记本中…</p>
        ) : notebooks.length > 0 ? (
          <div className="space-y-1.5">
            {notebooks.map((notebook) => {
              const active = notebook.id === selectedNotebookId

              return (
                <button
                  key={notebook.id}
                  type="button"
                  onClick={() => onSelectNotebook(notebook.id)}
                  className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-stone-900 bg-stone-50/95 text-stone-900 shadow-[0_4px_14px_rgba(28,25,23,0.05)]'
                      : 'border-stone-200/80 text-stone-500 hover:border-stone-300 hover:bg-stone-50/60 hover:text-stone-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{notebook.title}</div>
                    <div className="mt-1 text-[11px] leading-5 text-stone-400">{notebookListSummaryLabel(notebook)}</div>
                  </div>
                  <div className="shrink-0 pt-0.5 text-[11px] text-stone-400">{formatTimeLabel(notebook.updatedAt)}</div>
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-stone-500">先创建一个笔记本，再把时间线里的块或结构项整理到这里。</p>
        )}
      </div>
    </section>
  )
}
