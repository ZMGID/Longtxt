import { useRef, useState } from 'react'

import { useI18n } from '../i18n/useI18n'
import { extractImageFiles, hasPotentialImageTransfer } from '../lib/imageTransfer'
import { MarkdownLivePreview, type MarkdownFormatAction, type MarkdownLivePreviewHandle } from './MarkdownLivePreview'

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

type MarkdownToolTitleKey =
  | 'inputBar.tool.heading'
  | 'inputBar.tool.bold'
  | 'inputBar.tool.italic'
  | 'inputBar.tool.codeBlock'
  | 'inputBar.tool.bulletList'
  | 'inputBar.tool.orderedList'

const MARKDOWN_TOOL_ITEMS: Array<{ action: MarkdownFormatAction; label: string; titleKey: MarkdownToolTitleKey }> = [
  { action: 'heading', label: 'H1', titleKey: 'inputBar.tool.heading' },
  { action: 'bold', label: 'B', titleKey: 'inputBar.tool.bold' },
  { action: 'italic', label: 'I', titleKey: 'inputBar.tool.italic' },
  { action: 'codeBlock', label: '{ }', titleKey: 'inputBar.tool.codeBlock' },
  { action: 'bulletList', label: '•', titleKey: 'inputBar.tool.bulletList' },
  { action: 'orderedList', label: '1.', titleKey: 'inputBar.tool.orderedList' },
]

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
  title,
  description,
  placeholder,
  submitLabel,
}: InputBarProps) {
  const { t } = useI18n()
  const previewRef = useRef<MarkdownLivePreviewHandle | null>(null)
  const dragDepthRef = useRef(0)
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const resolvedTitle = title ?? t('inputBar.defaultTitle')
  const resolvedDescription = description ?? t('inputBar.defaultDescription')
  const resolvedPlaceholder = placeholder ?? t('inputBar.defaultPlaceholder')
  const resolvedSubmitLabel = submitLabel ?? t('inputBar.defaultSubmit')

  function handleMarkdownToolClick(action: MarkdownFormatAction): void {
    previewRef.current?.applyMarkdownFormat(action)
  }

  const markdownToolBar = (
    <div className="flex items-center gap-1">
      {MARKDOWN_TOOL_ITEMS.map((tool) => (
        <button
          key={tool.action}
          type="button"
          aria-label={t(tool.titleKey)}
          title={t(tool.titleKey)}
          onClick={() => handleMarkdownToolClick(tool.action)}
          className={`rounded-md px-2 py-1 text-xs font-medium text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 ${tool.action === 'italic' ? 'italic' : ''} ${tool.action === 'codeBlock' ? 'font-mono' : ''}`}
        >
          {tool.label}
        </button>
      ))}
    </div>
  )

  function handleCardImageDrop(event: React.DragEvent<HTMLDivElement>) {
    const imageFiles = extractImageFiles(event.dataTransfer)
    dragDepthRef.current = 0
    setIsDragActive(false)

    if (imageFiles.length === 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    previewRef.current?.insertImageFiles(imageFiles, {
      clientX: typeof event.clientX === 'number' ? event.clientX : 0,
      clientY: typeof event.clientY === 'number' ? event.clientY : 0,
    })
  }

  const cardDropHandlers = {
    onDragEnter: (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasPotentialImageTransfer(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      dragDepthRef.current += 1
      setIsDragActive(true)
    },
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasPotentialImageTransfer(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      if (!isDragActive) {
        setIsDragActive(true)
      }
    },
    onDragLeave: (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasPotentialImageTransfer(event.dataTransfer)) {
        return
      }

      event.preventDefault()
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragActive(false)
      }
    },
    onDrop: handleCardImageDrop,
  }

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
      <div
        className={`w-full min-w-0 rounded-lg border border-stone-200 bg-white p-3 transition-colors ${isDragActive ? 'bg-stone-50/80 ring-2 ring-stone-300' : ''}`}
        {...cardDropHandlers}
      >
        <p className="mb-2 text-xs text-stone-500">{t('inputBar.embeddedHint')}</p>
        <MarkdownLivePreview
          ref={previewRef}
          value={value}
          onValueChange={setValue}
          className={EMBEDDED_EDITOR_CLASS}
          dropTarget="none"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.shiftKey) {
              event.preventDefault()
              void handleSubmit()
            }
          }}
          placeholder={resolvedPlaceholder}
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          {markdownToolBar}
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
          >
            {submitting ? <><span className="spinner" />{t('inputBar.submitting')}</> : resolvedSubmitLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-lg border border-stone-200 bg-white p-3 transition-colors ${isDragActive ? 'bg-stone-50/80 ring-2 ring-stone-300' : ''}`}
      {...cardDropHandlers}
    >
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">{resolvedTitle}</p>
      <p className="mb-3 text-xs text-stone-500">{resolvedDescription}</p>
      <MarkdownLivePreview
        ref={previewRef}
        value={value}
        onValueChange={setValue}
        className={DEFAULT_EDITOR_CLASS}
        dropTarget="none"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.shiftKey) {
            event.preventDefault()
            void handleSubmit()
          }
        }}
        placeholder={resolvedPlaceholder}
      />
      <p className="mt-2 text-xs text-stone-400">{t('inputBar.shortcutHint')}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        {markdownToolBar}
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="rounded bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
        >
          {submitting ? <><span className="spinner" />{t('inputBar.submitting')}</> : resolvedSubmitLabel}
        </button>
      </div>
    </div>
  )
}
