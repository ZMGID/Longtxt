import { useState } from 'react'

import { useI18n } from '../i18n/useI18n'
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
  title,
  description,
  placeholder,
  submitLabel,
}: InputBarProps) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const resolvedTitle = title ?? t('inputBar.defaultTitle')
  const resolvedDescription = description ?? t('inputBar.defaultDescription')
  const resolvedPlaceholder = placeholder ?? t('inputBar.defaultPlaceholder')
  const resolvedSubmitLabel = submitLabel ?? t('inputBar.defaultSubmit')

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
      <div className="w-full min-w-0 rounded-lg border border-stone-200 bg-white p-3">
        <p className="mb-2 text-xs text-stone-500">{t('inputBar.embeddedHint')}</p>
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
          placeholder={resolvedPlaceholder}
        />
        <div className="mt-3 flex justify-end">
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
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-stone-400">{resolvedTitle}</p>
      <p className="mb-3 text-xs text-stone-500">{resolvedDescription}</p>
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
        placeholder={resolvedPlaceholder}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-stone-400">{t('inputBar.shortcutHint')}</span>
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
