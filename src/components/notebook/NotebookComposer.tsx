import { useState } from 'react'

import type { NotebookStructureItemInput, NotebookStructureItemType } from '../../../shared/types'
import { InputBar } from '../InputBar'
import { ActionButton } from '../ui/ActionButton'

const STRUCTURE_ACTIONS: Array<{
  label: string
  input: NotebookStructureItemInput
}> = [
  { label: '标题', input: { type: 'heading' } },
  { label: '分隔', input: { type: 'divider' } },
  { label: '笔记', input: { type: 'note' } },
  { label: '待办', input: { type: 'todo' } },
]

interface NotebookComposerProps {
  notebookId: string
  onCreateBlockInNotebook: (notebookId: string, content: string) => Promise<void>
  onCreateNotebookStructureItem?: (notebookId: string, input: NotebookStructureItemInput) => Promise<void>
}

export function NotebookComposer({
  notebookId,
  onCreateBlockInNotebook,
  onCreateNotebookStructureItem,
}: NotebookComposerProps) {
  const [structureMenuOpen, setStructureMenuOpen] = useState(false)

  async function handleCreateStructureItem(type: NotebookStructureItemType): Promise<void> {
    if (!onCreateNotebookStructureItem) {
      return
    }

    await onCreateNotebookStructureItem(notebookId, { type })
    setStructureMenuOpen(false)
  }

  return (
    <div data-testid="notebook-composer" className="border-b border-stone-200 py-3">
      <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-2.5 sm:grid-cols-[32px_minmax(0,1fr)] sm:gap-2.5">
        <div aria-hidden="true" />
        <div className="min-w-0 space-y-2.5">
          {onCreateNotebookStructureItem ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                onClick={() => setStructureMenuOpen((current) => !current)}
                size="xs"
                radius="full"
                variant={structureMenuOpen ? 'active' : 'quiet'}
                ariaLabel="结构项"
              >
                结构项
              </ActionButton>

              {structureMenuOpen ? (
                <div className="flex flex-wrap items-center gap-2">
                  {STRUCTURE_ACTIONS.map((action) => (
                    <ActionButton
                      key={action.input.type}
                      onClick={() => void handleCreateStructureItem(action.input.type)}
                      size="xs"
                      radius="full"
                    >
                      {action.label}
                    </ActionButton>
                  ))}
                </div>
              ) : null}
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
