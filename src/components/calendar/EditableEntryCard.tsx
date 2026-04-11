import { useEffect, useState } from 'react'

import type { CalendarEntry } from '../../../shared/types'
import { useI18n } from '../../i18n/useI18n'
import { changbu } from '../../lib/changbu'
import { useToast } from '../toast-context'
import { buildEntryPayload, type CalendarEntryDraft } from './helpers'

export function EditableEntryCard({
  entry,
  onSaved,
}: {
  entry: CalendarEntry
  onSaved: () => Promise<void>
}) {
  const { language } = useI18n()
  const { toast } = useToast()
  const [draft, setDraft] = useState<CalendarEntryDraft>({
    title: entry.title,
    date: entry.date,
    allDay: entry.allDay,
    startTime: entry.startTime ?? '',
    notes: entry.notes ?? '',
  })
  const [status, setStatus] = useState(entry.status)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const copy = {
    zh: {
      updateSuccess: '安排已更新。',
      updateFailed: '更新安排失败。',
      removeSuccess: '安排已删除。',
      removeFailed: '删除安排失败。',
      planned: '待办',
      done: '已完成',
      canceled: '已取消',
      allDay: '全天',
      notes: '备注',
      manual: '手动创建',
      accepted: 'AI 建议已采纳',
      saving: '保存中…',
      save: '保存',
      removing: '删除中…',
      remove: '删除',
    },
    en: {
      updateSuccess: 'Entry updated.',
      updateFailed: 'Failed to update entry.',
      removeSuccess: 'Entry removed.',
      removeFailed: 'Failed to remove entry.',
      planned: 'Planned',
      done: 'Done',
      canceled: 'Canceled',
      allDay: 'All day',
      notes: 'Notes',
      manual: 'Created manually',
      accepted: 'Accepted AI suggestion',
      saving: 'Saving…',
      save: 'Save',
      removing: 'Removing…',
      remove: 'Remove',
    },
  }[language]

  useEffect(() => {
    setDraft({
      title: entry.title,
      date: entry.date,
      allDay: entry.allDay,
      startTime: entry.startTime ?? '',
      notes: entry.notes ?? '',
    })
    setStatus(entry.status)
  }, [entry])

  async function handleSave(): Promise<void> {
    setSaving(true)

    try {
      await changbu.calendar.updateEntry(entry.id, {
        ...buildEntryPayload(draft),
        status,
      })
      await onSaved()
      toast('success', copy.updateSuccess)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : copy.updateFailed)
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(): Promise<void> {
    setRemoving(true)

    try {
      await changbu.calendar.removeEntry(entry.id)
      await onSaved()
      toast('success', copy.removeSuccess)
    } catch (reason) {
      toast('error', reason instanceof Error ? reason.message : copy.removeFailed)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="py-4 first:pt-0">
      <div className="grid gap-4">
        <input
          value={draft.title}
          onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
          className="w-full border-b border-stone-200 bg-transparent px-0 py-2 text-base font-medium text-stone-900 outline-none transition focus:border-stone-400"
        />
        <div className="grid gap-3 md:grid-cols-[1fr_130px_120px]">
          <input
            type="date"
            value={draft.date}
            onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
          <input
            type="time"
            value={draft.startTime}
            disabled={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, startTime: event.target.value }))}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white disabled:bg-stone-100"
          />
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as CalendarEntry['status'])}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          >
            <option value="planned">{copy.planned}</option>
            <option value="done">{copy.done}</option>
            <option value="canceled">{copy.canceled}</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => setDraft((current) => ({ ...current, allDay: event.target.checked, startTime: event.target.checked ? '' : current.startTime }))}
            className="h-4 w-4 rounded border-stone-300"
          />
          {copy.allDay}
        </label>
        <textarea
          value={draft.notes}
          onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          placeholder={copy.notes}
          className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-stone-400">{entry.source === 'manual' ? copy.manual : copy.accepted}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                void handleSave()
              }}
              disabled={saving}
              className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              {saving ? copy.saving : copy.save}
            </button>
            <button
              type="button"
              onClick={() => {
                void handleRemove()
              }}
              disabled={removing}
              className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:opacity-50"
            >
              {removing ? copy.removing : copy.remove}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
