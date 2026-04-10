import { useState } from 'react'

import type { NotebookStructureItemInput } from '../../../shared/types'
import { ActionButton } from '../ui/ActionButton'
import { InputBar } from '../InputBar'

interface NotebookComposerProps {
  notebookId: string
  onCreateBlockInNotebook: (notebookId: string, content: string) => Promise<void>
  onCreateNotebookStructureItem: (notebookId: string, input: NotebookStructureItemInput) => Promise<void>
}

export function NotebookComposer({
  notebookId,
  onCreateBlockInNotebook,
  onCreateNotebookStructureItem,
}: NotebookComposerProps) {
  const [structureMenuOpen, setStructureMenuOpen] = useState(false)

  async function handleCreateStructureItem(type: NotebookStructureItemInput['type']): Promise<void> {
    await onCreateNotebookStructureItem(notebookId, { type })
    setStructureMenuOpen(false)
  }

  return (
    <div data-testid="notebook-composer" className="border-b border-stone-200 py-3">
      <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-2.5">
        <div aria-hidden="true" />
        <div className="min-w-0">
          <div className="mb-2 flex justify-end">
            <ActionButton
              onClick={() => setStructureMenuOpen((current) => !current)}
              active={structureMenuOpen}
              className="px-3 py-1.5 text-xs"
            >
              结构项
            </ActionButton>
          </div>

          {structureMenuOpen ? (
            <div className="mb-2 flex flex-wrap justify-end gap-2">
              <ActionButton onClick={() => { void handleCreateStructureItem('heading') }} className="px-2.5 py-1.5 text-xs">标题</ActionButton>
              <ActionButton onClick={() => { void handleCreateStructureItem('divider') }} className="px-2.5 py-1.5 text-xs">分隔</ActionButton>
              <ActionButton onClick={() => { void handleCreateStructureItem('note') }} className="px-2.5 py-1.5 text-xs">笔记</ActionButton>
              <ActionButton onClick={() => { void handleCreateStructureItem('todo') }} className="px-2.5 py-1.5 text-xs">待办</ActionButton>
            </div>
          ) : null}

          <InputBar
            embedded
            onSubmit={(content) => onCreateBlockInNotebook(notebookId, content)}
            placeholder="新建引用块…"
            submitLabel="新建"
          />
        </div>
      </div>
    </div>
  )
}
