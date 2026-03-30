import { useMemo, useState } from 'react'

import type { Block, TagSuggestion } from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { MarkdownContent } from './MarkdownContent'
import { MarkdownLivePreview } from './MarkdownLivePreview'
import { StatusPill } from './StatusPill'

interface BlockCardProps {
  block: Block
  editable?: boolean
  compact?: boolean
  tagSuggestions?: TagSuggestion[]
  onSave?: (id: string, content: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onAddTag?: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag?: (blockId: string, tagId: string) => Promise<void>
  onTagClick?: (tagName: string) => void
}

function sourceLabel(source: Block['tags'][number]['source']): string {
  return source === 'manual' ? '手动' : '自动'
}

function kindLabel(kind: Block['tags'][number]['kind']): string {
  switch (kind) {
    case 'category':
      return '分类'
    case 'detail':
      return '内容'
    case 'user':
      return '用户'
    default:
      return '标签'
  }
}

export function BlockCard({
  block,
  editable = true,
  compact = false,
  tagSuggestions = [],
  onSave,
  onDelete,
  onAddTag,
  onRemoveTag,
  onTagClick,
}: BlockCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(block.content)
  const [saving, setSaving] = useState(false)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [tagSubmitting, setTagSubmitting] = useState(false)

  const filteredSuggestions = useMemo(() => {
    const existingNames = new Set(block.tags.map((tag) => tag.name.toLowerCase()))
    const normalizedDraft = tagDraft.trim().toLowerCase()

    return tagSuggestions
      .filter((tag) => !existingNames.has(tag.name.toLowerCase()))
      .filter((tag) => !normalizedDraft || tag.name.toLowerCase().includes(normalizedDraft))
      .slice(0, 6)
  }, [tagSuggestions, block.tags, tagDraft])

  async function handleSave(): Promise<void> {
    if (!onSave) return
    setSaving(true)
    try {
      await onSave(block.id, draft)
      setIsEditing(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleAddTag(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed || !onAddTag) return
    setTagSubmitting(true)
    try {
      await onAddTag(block.id, trimmed)
      setTagDraft('')
      setIsAddingTag(false)
    } finally {
      setTagSubmitting(false)
    }
  }

  return (
    <article className="rounded-lg border border-stone-200 bg-[#faf8f5] px-4 py-3 transition hover:border-stone-300">
      {/* 元信息行 */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <StatusPill status={block.status} />
        <span>{formatTimeLabel(block.updatedAt)}</span>
        <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
          {block.aiMode === 'live' ? 'live AI' : 'mock AI'}
        </span>
      </div>

      {/* 正文 */}
      <div className="mt-2">
        {isEditing ? (
          <MarkdownLivePreview
            value={draft}
            onValueChange={setDraft}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setIsEditing(false)
                setDraft(block.content)
              }
            }}
            placeholder=""
          />
        ) : (
          <div className={`text-sm leading-7 text-stone-800 ${compact ? 'line-clamp-4' : ''}`}>
            <MarkdownContent content={block.content} />
          </div>
        )}
      </div>

      {/* 标签 + 操作栏 */}
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {block.tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center gap-1.5 rounded border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600"
              >
                <button
                  type="button"
                  onClick={() => onTagClick?.(tag.name)}
                  className="transition hover:text-stone-900"
                  title={`${kindLabel(tag.kind)} · ${sourceLabel(tag.source)}`}
                >
                  {tag.name}
                </button>
                {onRemoveTag && (
                  <button
                    type="button"
                    onClick={() => onRemoveTag(block.id, tag.id)}
                    className="text-stone-400 transition hover:text-rose-600"
                    aria-label="删除标签"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}

            {/* 添加标签 */}
            {editable && onAddTag && (
              isAddingTag ? (
                <div className="relative">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleAddTag(tagDraft)
                      if (e.key === 'Escape') { setIsAddingTag(false); setTagDraft('') }
                    }}
                    placeholder="标签名"
                    autoFocus
                    disabled={tagSubmitting}
                    className="rounded border border-stone-300 bg-[#faf8f5] px-2 py-1 text-xs text-stone-900 outline-none focus:border-stone-500"
                  />
                  {filteredSuggestions.length > 0 && (
                    <ul className="absolute top-full z-10 mt-1 w-40 rounded border border-stone-200 bg-[#faf8f5] py-1 shadow-sm">
                      {filteredSuggestions.map((s) => (
                        <li key={s.name}>
                          <button
                            type="button"
                            onClick={() => void handleAddTag(s.name)}
                            className="w-full px-3 py-1 text-left text-xs text-stone-700 transition hover:bg-stone-100"
                          >
                            {s.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="rounded border border-dashed border-stone-300 px-2.5 py-1 text-xs text-stone-400 transition hover:border-stone-400 hover:text-stone-600"
                >
                  + 标签
                </button>
              )
            )}
          </div>

          {/* 操作按钮 */}
          {editable && (
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setDraft(block.content) }}
                    className="text-xs text-stone-500 transition hover:text-stone-700"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
                  >
                    {saving ? '保存中…' : '保存'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(true); setDraft(block.content) }}
                    className="text-xs text-stone-500 transition hover:text-stone-700"
                  >
                    编辑
                  </button>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => void onDelete(block.id)}
                      className="text-xs text-stone-400 transition hover:text-rose-600"
                    >
                      删除
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
