import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { Block, TagSuggestion } from '../../shared/types'
import { formatTimeLabel } from '../lib/format'
import { MarkdownContent } from './MarkdownContent'
import { MarkdownLivePreview } from './MarkdownLivePreview'
import { StatusPill } from './StatusPill'

interface BlockCardProps {
  block: Block
  editable?: boolean
  compact?: boolean
  headerActions?: ReactNode
  tagSuggestions?: TagSuggestion[]
  onSave?: (id: string, content: string) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  onAddTag?: (blockId: string, tagName: string) => Promise<void>
  onRemoveTag?: (blockId: string, tagId: string) => Promise<void>
  onTagClick?: (tagName: string) => void
  onFindRelated?: (blockId: string) => void
}

const COLLAPSIBLE_CONTENT_LENGTH = 420
const COLLAPSED_CONTENT_CLASS = 'max-h-[280px] overflow-hidden'

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
  headerActions,
  tagSuggestions = [],
  onSave,
  onDelete,
  onAddTag,
  onRemoveTag,
  onTagClick,
  onFindRelated,
}: BlockCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(block.content)
  const [isExpanded, setIsExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [tagDraft, setTagDraft] = useState('')
  const [tagSubmitting, setTagSubmitting] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filteredSuggestions = useMemo(() => {
    const existingNames = new Set(block.tags.map((tag) => tag.name.toLowerCase()))
    const normalizedDraft = tagDraft.trim().toLowerCase()

    return tagSuggestions
      .filter((tag) => !existingNames.has(tag.name.toLowerCase()))
      .filter((tag) => !normalizedDraft || tag.name.toLowerCase().includes(normalizedDraft))
      .slice(0, 6)
  }, [tagSuggestions, block.tags, tagDraft])

  useEffect(() => {
    if (!isEditing) {
      setDraft(block.content)
    }
    setIsExpanded(false)
  }, [block.id, block.content, isEditing])

  const canToggleCollapse = !compact && block.content.trim().length > COLLAPSIBLE_CONTENT_LENGTH
  const isCollapsed = canToggleCollapse && !isExpanded && !isEditing

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
    <article className="rounded-lg border border-black/[0.06] bg-white/70 px-3 py-2 transition-all duration-200 hover:border-black/[0.12] hover:shadow-sm">
      {/* 元信息行 */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
          <StatusPill status={block.status} />
          <span>{formatTimeLabel(block.updatedAt)}</span>
          <span className="rounded border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-medium text-stone-500">
            {block.aiMode === 'live' ? 'live AI' : 'mock AI'}
          </span>
        </div>

        {headerActions ? (
          <div className="shrink-0">
            {headerActions}
          </div>
        ) : null}
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
          <div className="relative">
            <div
              data-testid="block-card-content"
              className={`text-sm leading-6 text-stone-800 ${compact ? 'line-clamp-4' : ''} ${isCollapsed ? COLLAPSED_CONTENT_CLASS : ''}`}
            >
              <MarkdownContent content={block.content} />
            </div>
            {isCollapsed ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 rounded-b-lg bg-gradient-to-t from-white via-white/90 to-transparent" />
            ) : null}
          </div>
        )}
      </div>

      {canToggleCollapse && !isEditing ? (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setIsExpanded((current) => !current)}
            className="rounded border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600 transition duration-150 hover:bg-white active:scale-[0.97]"
          >
            {isExpanded ? '收起' : '显示全文'}
          </button>
        </div>
      ) : null}

      {/* 标签 + 操作栏 */}
      {!compact && (
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
          <div className="flex flex-wrap items-center gap-1">
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
                    className="rounded border border-stone-300 bg-white/70 px-2 py-1 text-xs text-stone-900 outline-none transition focus:border-stone-500 focus:ring-1 focus:ring-stone-200"
                  />
                  {filteredSuggestions.length > 0 && (
                    <ul className="absolute top-full z-10 mt-1 w-40 rounded border border-stone-200 bg-white/70 py-1 shadow-sm">
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
                    className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
                  >
                    {saving ? <><span className="spinner" />保存中…</> : '保存'}
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
                  {onFindRelated && block.status === 'ready' && (
                    <button
                      type="button"
                      onClick={() => onFindRelated(block.id)}
                      className="text-xs text-stone-500 transition hover:text-stone-700"
                    >
                      相关块
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => {
                        if (deleteConfirm) {
                          if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
                          setDeleteConfirm(false)
                          void onDelete(block.id)
                        } else {
                          setDeleteConfirm(true)
                          deleteTimerRef.current = setTimeout(() => setDeleteConfirm(false), 3000)
                        }
                      }}
                      className={`text-xs transition duration-150 active:scale-[0.97] ${deleteConfirm ? 'font-medium text-rose-600' : 'text-stone-400 hover:text-rose-600'}`}
                    >
                      {deleteConfirm ? '确认删除?' : '删除'}
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
