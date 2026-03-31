import { useEffect, useRef, useState } from 'react'

import type { NotebookSummary } from '../../shared/types'

interface AddToNotebookMenuProps {
  blockId: string
  notebooks: NotebookSummary[]
  onAddToNotebook: (notebookId: string, blockId: string) => Promise<void>
  onCreateNotebookWithBlock: (blockId: string) => Promise<void>
}

export function AddToNotebookMenu({
  blockId,
  notebooks,
  onAddToNotebook,
  onCreateNotebookWithBlock,
}: AddToNotebookMenuProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    function handlePointerDown(event: PointerEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

  async function handleAdd(notebookId: string): Promise<void> {
    setSubmitting(true)

    try {
      await onAddToNotebook(notebookId, blockId)
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreate(): Promise<void> {
    setSubmitting(true)

    try {
      await onCreateNotebookWithBlock(blockId)
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={containerRef} className="relative window-no-drag">
      <button
        type="button"
        aria-label="收录到笔记本"
        title="收录到笔记本"
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-stone-500 transition ${
          open
            ? 'border-stone-300 bg-white text-stone-900 shadow-sm'
            : 'border-transparent hover:border-stone-200 hover:bg-stone-50'
        }`}
      >
        <NotebookAddIcon />
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-64 rounded-2xl border border-stone-200 bg-white p-2 shadow-[0_18px_48px_rgba(28,25,23,0.12)]">
          <div className="px-2 pb-2 pt-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">收录到笔记本</p>
          </div>

          <div className="max-h-72 space-y-1 overflow-y-auto">
            {notebooks.length > 0 ? (
              notebooks.map((notebook) => (
                <button
                  key={notebook.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    void handleAdd(notebook.id)
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition hover:bg-stone-50 disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-stone-800">{notebook.title}</span>
                    <span className="mt-0.5 block text-xs text-stone-400">{notebook.blockCount} 个块</span>
                  </span>
                  <span className="text-xs text-stone-300">+</span>
                </button>
              ))
            ) : (
              <div className="rounded-xl bg-stone-50 px-3 py-3 text-sm leading-6 text-stone-500">
                还没有笔记本，先新建一个再收录。
              </div>
            )}
          </div>

          <div className="mt-2 border-t border-stone-100 pt-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                void handleCreate()
              }}
              className="flex w-full items-center justify-between rounded-xl bg-stone-900 px-3 py-2 text-left text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              <span>{notebooks.length > 0 ? '新建笔记本并收录' : '新建第一个笔记本'}</span>
              <span className="text-white/70">+</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NotebookAddIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 5.5h8.5l3.5 3.5V18a1.5 1.5 0 0 1-1.5 1.5H6A2 2 0 0 1 4 17.5v-10A2 2 0 0 1 6 5.5Z" />
      <path d="M14.5 5.5V9H18" />
      <path d="M9 13h6" />
      <path d="M12 10v6" />
    </svg>
  )
}
