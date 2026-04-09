import type { ReviewMode } from '../shared/types'
import { AiInsightsView } from './components/AiInsightsView'
import { ChangbuEventBridge } from './components/ChangbuEventBridge'
import { DailyReviewView } from './components/DailyReviewView'
import { TimelineReviewView } from './components/TimelineReviewView'
import { ToastProvider } from './components/Toast'
import { useTimelineReviewWindow } from './hooks/useTimelineReviewWindow'
import { useI18n } from './i18n/useI18n'

function resolveInitialReviewMode(): ReviewMode {
  const mode = new URLSearchParams(window.location.search).get('mode')

  if (mode === 'ai-insights' || mode === 'recent-shifts') {
    return mode
  }

  return 'daily-review'
}

function resolveTodayDateKey(): string {
  const today = new Date()

  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
}

function resolveInitialDateKey(): string {
  const dateFromQuery = new URLSearchParams(window.location.search).get('date')

  if (dateFromQuery) {
    return dateFromQuery
  }

  return resolveTodayDateKey()
}

export default function ReviewWindowApp() {
  return (
    <ToastProvider>
      <ReviewWindowInner />
    </ToastProvider>
  )
}

function ReviewWindowInner() {
  const { t } = useI18n()
  const activeMode = resolveInitialReviewMode()
  const activeModeLabel = activeMode === 'daily-review'
    ? t('review.mode.daily')
    : activeMode === 'ai-insights'
      ? t('review.mode.aiInsights')
      : t('review.mode.recentShifts')

  return (
    <>
      <ChangbuEventBridge />

      <ReviewWindowShell title={activeModeLabel}>
        {activeMode === 'daily-review'
          ? <DailyReviewView initialDateKey={resolveInitialDateKey()} />
          : activeMode === 'ai-insights'
            ? <AiInsightsView initialDateKey={resolveInitialDateKey()} />
            : <ReviewWindowStaticModes activeMode={activeMode} />}
      </ReviewWindowShell>
    </>
  )
}

function ReviewWindowShell({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useI18n()

  return (
    <div className="flex h-screen overflow-hidden bg-stone-100 text-stone-900">
      <main className="relative flex min-w-0 flex-1 overflow-hidden bg-white/[0.94]">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="window-drag-region flex h-12 shrink-0 items-center justify-between border-b border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,244,237,0.58))] px-5">
            <h2 className="text-[17px] font-semibold tracking-[0.01em] text-stone-900">{title}</h2>
            <button
              type="button"
              aria-label={t('review.window.close')}
              data-testid="review-window-close"
              onClick={() => window.close()}
              className="window-no-drag flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-black/[0.04] hover:text-stone-700"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="m5 5 10 10" />
                <path d="M15 5 5 15" />
              </svg>
            </button>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 px-4 pb-3 pt-2">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

function ReviewWindowStaticModes({ activeMode }: { activeMode: ReviewMode }) {
  const { t } = useI18n()
  const anchorDateKey = resolveInitialDateKey()
  const { blocks, entries, loading, error } = useTimelineReviewWindow(anchorDateKey)

  if (loading && blocks.length === 0 && entries.length === 0) {
    return <div className="flex min-h-[320px] flex-1 items-center justify-center text-sm text-stone-400">{t('review.window.loading')}</div>
  }

  return (
    <TimelineReviewView
      blocks={blocks}
      entries={entries}
      anchorDateKey={anchorDateKey}
      activeMode={activeMode}
      loading={loading}
      error={error}
    />
  )
}
