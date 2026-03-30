import { useState } from 'react'

import { MarkdownLivePreview } from './MarkdownLivePreview'

interface InputBarProps {
  onSubmit: (content: string) => Promise<void>
  embedded?: boolean
}

export function InputBar({ onSubmit, embedded = false }: InputBarProps) {
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
      <div className="rounded-lg border border-stone-200 bg-[#faf8f5] p-4">
        <p className="mb-2 text-xs text-stone-500">继续往下写 · Enter 创建块 · Shift+Enter 换行</p>
        <MarkdownLivePreview
          value={value}
          onValueChange={setValue}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder="把任何还没整理好的内容先放下来。"
        />
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
          >
            {submitting ? '写入中…' : '创建块'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-stone-200 bg-[#faf8f5] p-5">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">新建块</p>
      <p className="mb-3 text-xs text-stone-500">写入后会立即出现在时间轴里；如果 AI 已配置，块会继续补摘要、标签和向量索引。</p>
      <MarkdownLivePreview
        value={value}
        onValueChange={setValue}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
        placeholder="写点什么。支持 Markdown、代码块和图片链接。"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-stone-400">Enter 创建块 · Shift+Enter 换行</span>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50"
        >
          {submitting ? '写入中…' : '创建块'}
        </button>
      </div>
    </div>
  )
}
