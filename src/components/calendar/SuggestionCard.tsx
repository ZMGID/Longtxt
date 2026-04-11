import { useEffect, useState } from 'react'

import type { CalendarSuggestion } from '../../../shared/types'
import { useI18n } from '../../i18n/useI18n'
import { changbu } from '../../lib/changbu'
import { useToast } from '../toast-context'
import { buildEntryPayload, type CalendarEntryDraft } from './helpers'

export function SuggestionCard({
  suggestion,
  onUpdated,
}: {
  suggestion: CalendarSuggestion
  onUpdated: () => Promise<void>
}) {
  const { language } = useI18n()
  const { toast } = useToast()
  const [draft, setDraft] = useState<CalendarEntryDraft>({
    title: suggestion.title,
    date: suggestion.date,
    allDay: suggestion.allDay,
    startTime: suggestion.startTime ?? '',
    notes: suggestion.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const copy = {
    zh: {
      acceptSuccess: 'AI 建议已采纳。',
      acceptFailed: '采纳建议失败。',
      dismissSuccess: 'AI 建议已忽略。',
      dismissFailed: '忽略建议失败。',
      sourceBlock: '来自块',
      confidence: '置信度',
      allDay: '全天安排',
      notes: '备注',
      evidence: '证据',
      busy: '处理中…',
      accept: '采纳为正式安排',
      dismiss: '忽略',
    },
    en: {
      acceptSuccess: 'AI suggestion accepted.',
      acceptFailed: 'Failed to accept suggestion.',
      dismissSuccess: 'AI suggestion dismissed.',
      dismissFailed: 'Failed to dismiss suggestion.',
      sourceBlock: 'From block',
      confidence: 'Confidence',
      allDay: 'All-day entry',
      notes: 'Notes',
      evidence: 'Evidence',
      busy: 'Working…',
      accept: 'Accept as entry',
      dismiss: 'Dismiss',
    },
  }[language]

  useEffect(() => {
    setDraft({
      title: suggestion.title,
      date: suggestion.date,
      allDay: suggestion.allDay,
      startTime: suggestion.startTime ?? '',
      notes: suggestion.notes ?? '',
    })
  }, [suggestion])

  async function handleAccept(): Promise<void> {
    setBusy(true)

    try {
      await changbu.calendar.acceptSuggestion(suggestion.id, buildEntryPayload(draft))
      await onUpdated()
      toast('success', copy.acceptSuccess)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : copy.acceptFailed)
    } finally {
      setBusy(false)
    }
  }

  async function handleDismiss(): Promise<void> {
    setBusy(true)

    try {
      await changbu.calendar.dismissSuggestion(suggestion.id)
      await onUpdated()
      toast('success', copy.dismissSuccess)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : copy.dismissFailed)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="py-4 first:pt-0">
      <div className="border-l-2 border-amber-400 pl-4">
        <div className="mb-3 flex items-center justify-between gap-3 text-xs text-amber-700">
          <span className="font-medium uppercase tracking-[0.18em]">{copy.sourceBlock} {suggestion.sourceBlockId.slice(0, 8)}</span>
          <span>{copy.confidence} {Math.round(suggestion.confidence * 100)}%</span>
        </div>
        <div className="grid gap-3">
          <input
            value={draft.title}
            onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            className="w-full border-b border-amber-200 bg-transparent px-0 py-2 text-base font-medium text-stone-900 outline-none transition focus:border-amber-400"
          />
          <div className="grid gap-3 md:grid-cols-[1fr_130px]">
            <input
              type="date"
              value={draft.date}
              onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white"
            />
            <input
              type="time"
              value={draft.startTime}
              disabled={draft.allDay}
              onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
              className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white disabled:bg-amber-100/60"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-amber-900">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
              className="h-4 w-4 rounded border-amber-300"
            />
            {copy.allDay}
          </label>
          <textarea
            value={draft.notes}
            onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
            rows={2}
            placeholder={copy.notes}
            className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-amber-400 focus:bg-white"
          />
          {suggestion.evidenceText ? <p className="text-xs leading-5 text-amber-800">{copy.evidence}: {suggestion.evidenceText}</p> : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleAccept()
              }}
              disabled={busy}
              className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? copy.busy : copy.accept}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleDismiss()
              }}
              disabled={busy}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
            >
              {copy.dismiss}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
