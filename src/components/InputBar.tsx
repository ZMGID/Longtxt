import { useState } from 'react'

import { MarkdownLivePreview } from './MarkdownLivePreview'

const EMBEDDED_EDITOR_CLASS = [
  'min-h-0',
  '[&_.cm-editor]:max-h-[52vh]',
  '[&_.cm-editor]:overflow-hidden',
  '[&_.cm-scroller]:max-h-[52vh]',
  '[&_.cm-scroller]:overflow-auto',
  '[&_.cm-scroller]:overscroll-contain',
].join(' ')

const DEFAULT_EDITOR_CLASS = [
  'min-h-0',
  '[&_.cm-editor]:max-h-[48vh]',
  '[&_.cm-editor]:overflow-hidden',
  '[&_.cm-scroller]:max-h-[48vh]',
  '[&_.cm-scroller]:overflow-auto',
  '[&_.cm-scroller]:overscroll-contain',
].join(' ')

interface InputBarProps {
  onSubmit: (content: string) => Promise<void>
  embedded?: boolean
  title?: string
  description?: string
  placeholder?: string
  submitLabel?: string
}

export function InputBar({
  onSubmit,
  embedded = false,
  title = '新建块',
  description = '写入后会立即出现在时间轴里；如果 AI 已配置，块会继续补摘要、标签和向量索引。',
  placeholder = '写点什么。支持 Markdown、代码块和图片链接。',
  submitLabel = '创建块',
}: InputBarProps) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(): Promise<void> {
    const trimmed = value.trim()

    if (!trimmed) {
      return
    }

    setSubmitting(true)

    try {
      await onSubmit(trimmed)
      setValue('')
    } finally {
      setSubmitting(false)
    }
  }

  if (embedded) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-3">
        <p className="mb-2 text-xs text-stone-500">继续往下写 · Enter 创建块 · Shift+Enter 换行 · 长内容可在输入区内滚动</p>
        <MarkdownLivePreview
          value={value}
          onValueChange={setValue}
          className={EMBEDDED_EDITOR_CLASS}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder={placeholder}
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? <><span className="spinner" />写入中…</> : submitLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">{title}</p>
      <p className="mb-3 text-xs text-stone-500">{description}</p>
      <MarkdownLivePreview
        value={value}
        onValueChange={setValue}
        className={DEFAULT_EDITOR_CLASS}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
        placeholder={placeholder}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-stone-400">Enter 创建块 · Shift+Enter 换行</span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
        >
          {submitting ? <><span className="spinner" />写入中…</> : submitLabel}
        </button>
      </div>
    </div>
  )
}
