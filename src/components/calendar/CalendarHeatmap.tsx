import type { CSSProperties, RefObject } from 'react'

import type { CalendarHeatmapColumn } from '../../lib/calendar'
import { formatCalendarDateLabel } from '../../lib/calendar'
import type { HeatmapDisplayMode } from './helpers'
import { INTENSITY_CLASSES } from './helpers'

interface CalendarHeatmapProps {
  activeYear: number
  availableYears: number[]
  onYearChange: (year: number) => void
  isPending: boolean
  visibleColumns: CalendarHeatmapColumn[]
  displayMode: HeatmapDisplayMode
  containerRef: RefObject<HTMLDivElement | null>
  styles: CSSProperties
  showWeekLabels: boolean
  cellSize: number
  gapSize: number
  entryIndicatorStyle: CSSProperties
  suggestionIndicatorStyle: CSSProperties
  showEntryIndicator: boolean
  showSuggestionIndicator: boolean
  selectedDate: string
  onDateSelect: (date: string) => void
  copy: {
    heatmapTitle: string
    heatmapLoading: string
    heatmapEmpty: string
    heatmapFocused: string
    density: string
    less: string
    more: string
    hasEntries: string
    hasSuggestions: string
    blocksSuffix: string
    weekLabels: readonly string[]
  }
}

export function CalendarHeatmap({
  activeYear,
  availableYears,
  onYearChange,
  isPending,
  visibleColumns,
  displayMode,
  containerRef,
  styles,
  showWeekLabels,
  cellSize,
  gapSize,
  entryIndicatorStyle,
  suggestionIndicatorStyle,
  showEntryIndicator,
  showSuggestionIndicator,
  selectedDate,
  onDateSelect,
  copy,
}: CalendarHeatmapProps) {
  return (
    <section className="min-w-0 shrink-0 border-b border-stone-200 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-stone-400">{copy.heatmapTitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm">
          {availableYears.map((year) => (
            <button
              key={year}
              type="button"
              onClick={() => onYearChange(year)}
              className={`border-b pb-1 transition ${year === activeYear ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'}`}
            >
              {year}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="mt-4 py-10 text-sm text-stone-400">{copy.heatmapLoading}</div>
      ) : visibleColumns.length > 0 ? (
        <div
          ref={containerRef}
          data-testid="calendar-heatmap"
          data-mode={displayMode}
          className="mt-4 min-w-0 overflow-hidden"
          style={styles}
        >
          <div className="flex min-w-0 items-start gap-3">
            {showWeekLabels ? (
              <div className="flex shrink-0 flex-col pt-8 text-[11px] text-stone-500">
                {copy.weekLabels.map((label, index) => (
                  <div
                    key={`${label}-${index}`}
                    className="flex items-center pr-2 leading-none"
                    style={{ height: `${cellSize}px` }}
                  >
                    {label}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="min-w-0 flex-1">
              <div className="mb-2 flex" style={{ gap: `${gapSize}px` }}>
                {visibleColumns.map((column) => (
                  <div
                    key={`${column.key}-label`}
                    className="overflow-hidden text-[11px] leading-none text-stone-400"
                    style={{ width: `${cellSize}px` }}
                  >
                    {column.monthLabel}
                  </div>
                ))}
              </div>

              <div className="flex" style={{ gap: `${gapSize}px` }}>
                {visibleColumns.map((column) => (
                  <div key={column.key} className="flex flex-col" style={{ gap: `${gapSize}px` }}>
                    {column.days.map((day, index) => {
                      if (!day) {
                        return (
                          <div
                            key={`${column.key}-empty-${index}`}
                            className="rounded-[4px] bg-transparent"
                            style={{ height: `${cellSize}px`, width: `${cellSize}px` }}
                          />
                        )
                      }

                      const selected = day.date === selectedDate
                      const dayLabel = `${formatCalendarDateLabel(day.date)} · ${day.blockCount} ${copy.blocksSuffix}`

                      return (
                        <button
                          key={day.date}
                          type="button"
                          title={dayLabel}
                          aria-label={dayLabel}
                          data-selected={selected ? 'true' : 'false'}
                          data-has-entries={day.hasEntries ? 'true' : 'false'}
                          data-has-suggestions={day.hasSuggestions ? 'true' : 'false'}
                          onClick={() => onDateSelect(day.date)}
                          className={`relative isolate rounded-[4px] border transition ${
                            INTENSITY_CLASSES[day.intensityLevel]
                          } ${selected
                            ? 'z-10 border-stone-900/75'
                            : day.hasEntries
                              ? 'border-stone-700/70'
                              : day.hasSuggestions
                                ? 'border-amber-400/75'
                                : 'border-black/5'}`}
                          style={{
                            height: `${cellSize}px`,
                            width: `${cellSize}px`,
                            boxShadow: selected ? 'inset 0 0 0 2px #1c1917' : undefined,
                          }}
                        >
                          {day.hasEntries && showEntryIndicator ? (
                            <span
                              aria-hidden="true"
                              data-testid={`calendar-entry-indicator-${day.date}`}
                              className="pointer-events-none absolute bottom-[2px] left-1/2 -translate-x-1/2 rounded-full bg-stone-900/85"
                              style={entryIndicatorStyle}
                            />
                          ) : null}
                          {day.hasSuggestions && showSuggestionIndicator ? (
                            <span
                              aria-hidden="true"
                              data-testid={`calendar-suggestion-indicator-${day.date}`}
                              className="pointer-events-none absolute right-[1px] top-[1px] rounded-full border border-white/85 bg-amber-500 shadow-[0_0_0_1px_rgba(120,53,15,0.12)]"
                              style={suggestionIndicatorStyle}
                            />
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-6 py-10 text-sm leading-6 text-stone-500">{copy.heatmapEmpty}</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-500">
        {displayMode === 'focused-window' ? (
          <div className="flex items-center gap-2 text-stone-400">
            <span className="rounded-full border border-stone-200 px-2.5 py-1">{copy.heatmapFocused}</span>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <span>{copy.density}</span>
          <span>{copy.less}</span>
          {INTENSITY_CLASSES.map((className) => (
            <span key={className} className={`h-4 w-4 rounded-[4px] border border-black/5 ${className}`} />
          ))}
          <span>{copy.more}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative block h-4 w-4 rounded-[4px] border border-stone-700/70 bg-stone-100">
            <span className="absolute bottom-[2px] left-1/2 h-[2px] w-[8px] -translate-x-1/2 rounded-full bg-stone-900/85" />
          </span>
          <span>{copy.hasEntries}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative block h-4 w-4 rounded-[4px] border border-black/5 bg-stone-100">
            <span className="absolute right-[1px] top-[1px] h-[5px] w-[5px] rounded-full border border-white/85 bg-amber-500" />
          </span>
          <span>{copy.hasSuggestions}</span>
        </div>
      </div>
    </section>
  )
}
