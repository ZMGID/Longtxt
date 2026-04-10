import { useEffect, useState } from 'react'

import type { Notebook } from '../../../shared/types'
import { formatTimeLabel } from '../../lib/format'
import { ActionButton } from '../ui/ActionButton'
import { notebookHeaderSummaryLabel } from './utils'

interface NotebookHeaderProps {
  selectedNotebook: Notebook
  onUpdateNotebookTitle: (id: string, title: string) => Promise<void>
  showDeleteButton?: boolean
  onDeleteNotebook?: (id: string) => Promise<void>
}

export function NotebookHeader({
  selectedNotebook,
  onUpdateNotebookTitle,
  showDeleteButton = false,
  onDeleteNotebook,
}: NotebookHeaderProps) {
  const [titleDraft, setTitleDraft] = useState(selectedNotebook.title)
  const [titleSaving, setTitleSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  useEffect(() => {
    setTitleDraft(selectedNotebook.title)
    setDeleteConfirm(false)
  }, [selectedNotebook.id, selectedNotebook.title])

  async function handleSaveTitle(): Promise<void> {
    if (titleDraft.trim() === selectedNotebook.title) {
      return
    }

    setTitleSaving(true)

    try {
      await onUpdateNotebookTitle(selectedNotebook.id, titleDraft)
    } finally {
      setTitleSaving(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-200 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <input
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => {
            void handleSaveTitle()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void handleSaveTitle()
            }
          }}
          className="min-w-0 border-none bg-transparent p-0 text-base font-semibold text-stone-900 outline-none"
        />
        {titleSaving ? <span className="shrink-0 text-xs text-stone-400">保存中…</span> : null}
        <span className="shrink-0 text-xs text-stone-400">
          {notebookHeaderSummaryLabel(selectedNotebook)} · {formatTimeLabel(selectedNotebook.updatedAt)}
        </span>
      </div>

      {showDeleteButton ? (
        <div className="flex shrink-0 items-center gap-2">
          <ActionButton
            danger={deleteConfirm}
            onClick={() => {
              if (!onDeleteNotebook) {
                return
              }

              if (deleteConfirm) {
                void onDeleteNotebook(selectedNotebook.id)
              } else {
                setDeleteConfirm(true)
              }
            }}
            className="px-2.5 py-1.5 text-xs"
          >
            {deleteConfirm ? '确认删除?' : '删除'}
          </ActionButton>
        </div>
      ) : null}
    </div>
  )
}
