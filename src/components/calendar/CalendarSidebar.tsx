import type { CalendarEntry } from '../../../shared/types'
import type { GroupedCalendarEntries } from '../../lib/calendar'
import { formatCalendarDateLabel, formatCalendarTimeLabel } from '../../lib/calendar'
import { SectionEyebrow } from '../ui/SectionEyebrow'
import type { CalendarEntryDraft, CalendarSidebarTab } from './helpers'
import { entryStatusLabel } from './helpers'

interface CalendarSidebarProps {
  compact: boolean
  draft: CalendarEntryDraft
  onDraftChange: (draft: CalendarEntryDraft) => void
  creating: boolean
  onCreateEntry: () => void
  groupedUpcoming: GroupedCalendarEntries[]
  upcomingIsPending: boolean
  onEntryDateSelect: (date: string) => void
  sidebarTab: CalendarSidebarTab
  onSidebarTabChange: (tab: CalendarSidebarTab) => void
  copy: {
    sidebarLabel: string
    sidebarTitle: string
    sidebarCreate: string
    sidebarUpcoming: string
    newEntryEyebrow: string
    newEntryTitle: string
    newEntryHint: string
    fieldTitle: string
    fieldDate: string
    fieldAllDay: string
    fieldStartTime: string
    fieldNotes: string
    titlePlaceholder: string
    notesPlaceholder: string
    creating: string
    createEntry: string
    upcomingEyebrow: string
    upcomingTitle: string
    upcomingHint: string
    upcomingLoading: string
    upcomingEmpty: string
    statusPlanned: string
    statusDone: string
    statusCanceled: string
  }
}

type CopyRef = CalendarSidebarProps['copy']

function CreateSection({
  draft,
  onDraftChange,
  creating,
  onCreateEntry,
  copy,
}: {
  draft: CalendarEntryDraft
  onDraftChange: (draft: CalendarEntryDraft) => void
  creating: boolean
  onCreateEntry: () => void
  copy: CopyRef
}) {
  return (
    <section>
      <div className="min-w-0">
        <SectionEyebrow>{copy.newEntryEyebrow}</SectionEyebrow>
        <h4 className="mt-3 break-words text-lg font-semibold text-stone-900">{copy.newEntryTitle}</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">{copy.newEntryHint}</p>
      </div>
      <div className="mt-5 space-y-4">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">{copy.fieldTitle}</span>
          <input
            value={draft.title}
            onChange={(event) => onDraftChange({ ...draft, title: event.target.value })}
            placeholder={copy.titlePlaceholder}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">{copy.fieldDate}</span>
          <input
            type="date"
            value={draft.date}
            onChange={(event) => onDraftChange({ ...draft, date: event.target.value })}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={draft.allDay}
            onChange={(event) => onDraftChange({ ...draft, allDay: event.target.checked, startTime: event.target.checked ? '' : draft.startTime })}
            className="h-4 w-4 rounded border-stone-300"
          />
          {copy.fieldAllDay}
        </label>
        {!draft.allDay ? (
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-stone-500">{copy.fieldStartTime}</span>
            <input
              type="time"
              value={draft.startTime}
              onChange={(event) => onDraftChange({ ...draft, startTime: event.target.value })}
              className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
            />
          </label>
        ) : null}
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-stone-500">{copy.fieldNotes}</span>
          <textarea
            value={draft.notes}
            onChange={(event) => onDraftChange({ ...draft, notes: event.target.value })}
            rows={3}
            placeholder={copy.notesPlaceholder}
            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:bg-white"
          />
        </label>
        <button
          type="button"
          onClick={onCreateEntry}
          disabled={creating}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-stone-800 disabled:opacity-50"
        >
          {creating ? copy.creating : copy.createEntry}
        </button>
      </div>
    </section>
  )
}

function UpcomingSection({
  groupedUpcoming,
  upcomingIsPending,
  onEntryDateSelect,
  copy,
}: {
  groupedUpcoming: GroupedCalendarEntries[]
  upcomingIsPending: boolean
  onEntryDateSelect: (date: string) => void
  copy: CopyRef
}) {
  return (
    <section>
      <div className="min-w-0">
        <SectionEyebrow>{copy.upcomingEyebrow}</SectionEyebrow>
        <h4 className="mt-3 text-lg font-semibold text-stone-900">{copy.upcomingTitle}</h4>
        <p className="mt-2 text-sm leading-6 text-stone-500">{copy.upcomingHint}</p>
      </div>
      <div className="mt-5 space-y-5">
        {upcomingIsPending ? (
          <p className="text-sm text-stone-400">{copy.upcomingLoading}</p>
        ) : groupedUpcoming.length > 0 ? (
          groupedUpcoming.map((group) => (
            <div key={group.date}>
              <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-stone-400">{formatCalendarDateLabel(group.date)}</div>
              <div className="divide-y divide-stone-200">
                {group.items.map((entry: CalendarEntry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => onEntryDateSelect(entry.date)}
                    className="flex w-full items-start justify-between gap-3 py-3 text-left first:pt-0 hover:text-stone-950"
                  >
                    <div className="min-w-0">
                      <div className="break-words text-sm font-medium text-stone-900">{entry.title}</div>
                      <div className="mt-1 text-xs text-stone-500">
                        {entryStatusLabel(entry.status, copy)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-stone-400">{formatCalendarTimeLabel(entry.startTime)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-stone-400">{copy.upcomingEmpty}</p>
        )}
      </div>
    </section>
  )
}

export function CalendarSidebar({
  compact,
  draft,
  onDraftChange,
  creating,
  onCreateEntry,
  groupedUpcoming,
  upcomingIsPending,
  onEntryDateSelect,
  sidebarTab,
  onSidebarTabChange,
  copy,
}: CalendarSidebarProps) {
  const createSection = (
    <CreateSection
      draft={draft}
      onDraftChange={onDraftChange}
      creating={creating}
      onCreateEntry={onCreateEntry}
      copy={copy}
    />
  )

  const upcomingSection = (
    <UpcomingSection
      groupedUpcoming={groupedUpcoming}
      upcomingIsPending={upcomingIsPending}
      onEntryDateSelect={onEntryDateSelect}
      copy={copy}
    />
  )

  return (
    <div className={compact ? '' : 'space-y-8'}>
      {compact ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">{copy.sidebarLabel}</p>
              <h3 className="mt-1 text-base font-semibold text-stone-900">{copy.sidebarTitle}</h3>
            </div>
            <div className="flex items-center gap-4 text-sm" data-testid="calendar-sidebar-tablist">
              <button
                type="button"
                onClick={() => onSidebarTabChange('create')}
                aria-pressed={sidebarTab === 'create'}
                className={`border-b pb-1 transition ${sidebarTab === 'create' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
              >
                {copy.sidebarCreate}
              </button>
              <button
                type="button"
                onClick={() => onSidebarTabChange('upcoming')}
                aria-pressed={sidebarTab === 'upcoming'}
                className={`border-b pb-1 transition ${sidebarTab === 'upcoming' ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
              >
                {copy.sidebarUpcoming}
              </button>
            </div>
          </div>
          <div className="mt-6 border-t border-stone-200 pt-6">
            {sidebarTab === 'create' ? createSection : upcomingSection}
          </div>
        </>
      ) : (
        <>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">{copy.sidebarLabel}</p>
            <h3 className="mt-1 text-base font-semibold text-stone-900">{copy.sidebarTitle}</h3>
          </div>
          <div className="border-t border-stone-200 pt-6">{createSection}</div>
          <div className="border-t border-stone-200 pt-6">{upcomingSection}</div>
        </>
      )}
    </div>
  )
}
