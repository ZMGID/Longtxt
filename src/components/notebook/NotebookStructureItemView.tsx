import type { NotebookItem } from '../../../shared/types'
import { MarkdownContent } from '../MarkdownContent'
import { ActionButton } from '../ui/ActionButton'
import { SectionEyebrow } from '../ui/SectionEyebrow'

interface NotebookStructureItemViewProps {
  item: Exclude<NotebookItem, { type: 'block' }>
  isEditing: boolean
  isSaving: boolean
  draft: string
  onDraftChange: (value: string) => void
  onBeginEdit: (item: Extract<NotebookItem, { type: 'heading' | 'note' | 'todo' }>) => void
  onCancelEdit: () => void
  onSave: (itemId: string) => void
  onRemove: (itemId: string) => void
  onToggleTodoChecked: (item: Extract<NotebookItem, { type: 'todo' }>) => void
}

export function NotebookStructureItemView({
  item,
  isEditing,
  isSaving,
  draft,
  onDraftChange,
  onBeginEdit,
  onCancelEdit,
  onSave,
  onRemove,
  onToggleTodoChecked,
}: NotebookStructureItemViewProps) {
  const removeButton = (
    <ActionButton
      title="删除结构项"
      ariaLabel="删除结构项"
      onClick={() => {
        onRemove(item.id)
      }}
      className="px-2.5 py-1.5 text-xs"
    >
      删除
    </ActionButton>
  )

  if (item.type === 'divider') {
    return (
      <div className="py-5 first:pt-0">
        <div className="flex items-center gap-3">
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400">分隔线</span>
          <div className="h-px flex-1 bg-stone-200" />
          {removeButton}
        </div>
      </div>
    )
  }

  const editButton = (
    <ActionButton
      onClick={() => onBeginEdit(item)}
      className="px-2.5 py-1.5 text-xs"
    >
      编辑
    </ActionButton>
  )

  if (item.type === 'heading') {
    return (
      <div className="py-6 first:pt-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SectionEyebrow>Heading</SectionEyebrow>
            {isEditing ? (
              <div className="mt-4 space-y-3">
                <input
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      onCancelEdit()
                    }
                  }}
                  placeholder="输入章节标题"
                  className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-lg font-semibold text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <ActionButton onClick={onCancelEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                  <ActionButton
                    onClick={() => {
                      onSave(item.id)
                    }}
                    disabled={isSaving}
                    active
                    className="px-2.5 py-1.5 text-xs"
                  >
                    {isSaving ? '保存中…' : '保存'}
                  </ActionButton>
                </div>
              </div>
            ) : (
              <h3 className="mt-3 break-words text-2xl font-semibold text-stone-900">{item.content.trim() || '未命名标题'}</h3>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? null : editButton}
            {removeButton}
          </div>
        </div>
      </div>
    )
  }

  if (item.type === 'note') {
    return (
      <div className="py-5 first:pt-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <SectionEyebrow>Note</SectionEyebrow>
            {isEditing ? (
              <div className="mt-4 space-y-3">
                <textarea
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      onCancelEdit()
                    }
                  }}
                  rows={5}
                  placeholder="输入整理说明或写作备注"
                  className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <ActionButton onClick={onCancelEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                  <ActionButton
                    onClick={() => {
                      onSave(item.id)
                    }}
                    disabled={isSaving}
                    active
                    className="px-2.5 py-1.5 text-xs"
                  >
                    {isSaving ? '保存中…' : '保存'}
                  </ActionButton>
                </div>
              </div>
            ) : item.content.trim() ? (
              <div className="mt-3 min-w-0 break-words text-sm leading-7 text-stone-700">
                <MarkdownContent content={item.content} />
              </div>
            ) : (
              <p className="mt-3 text-sm leading-7 text-stone-400">这条笔记还是空的，点击“编辑”补充整理说明。</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? null : editButton}
            {removeButton}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="py-5 first:pt-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <SectionEyebrow>Todo</SectionEyebrow>
          {isEditing ? (
            <div className="mt-4 space-y-3">
              <textarea
                value={draft}
                onChange={(event) => onDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    onCancelEdit()
                  }
                }}
                rows={3}
                placeholder="输入待办内容"
                className="w-full resize-y rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
              />
              <div className="flex items-center justify-end gap-2">
                <ActionButton onClick={onCancelEdit} className="px-2.5 py-1.5 text-xs">取消</ActionButton>
                <ActionButton
                  onClick={() => {
                    onSave(item.id)
                  }}
                  disabled={isSaving}
                  active
                  className="px-2.5 py-1.5 text-xs"
                >
                  {isSaving ? '保存中…' : '保存'}
                </ActionButton>
              </div>
            </div>
          ) : (
            <label className="mt-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => {
                  onToggleTodoChecked(item)
                }}
                className="mt-1 h-4 w-4 rounded border-stone-300 text-stone-900"
              />
              <span className={`min-w-0 text-sm leading-7 ${item.checked ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                {item.content.trim() || '待补充待办内容'}
              </span>
            </label>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? null : editButton}
          {removeButton}
        </div>
      </div>
    </div>
  )
}
