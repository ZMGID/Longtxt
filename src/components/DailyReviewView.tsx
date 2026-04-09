import { useEffect, useMemo, useRef, useState } from 'react'

import type { DailyReviewResult } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useAppMeta } from '../hooks/useAppMeta'
import { useDailyReview, useDocGenerationSettings, useSaveDailyReviewSnapshot } from '../hooks/useReview'
import { formatDateByLanguage } from '../i18n/locale'
import { useI18n } from '../i18n/useI18n'
import { formatDateKeyLabel, formatTimeLabel } from '../lib/format'
import { shiftDateKey } from '../lib/timelineReview'
import { MarkdownContent } from './MarkdownContent'
import { ActionButton } from './ui/ActionButton'
import { useToast } from './toast-context'

interface DailyReviewViewProps {
  initialDateKey: string
}

function DailyReviewSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[860px] px-6 py-6">
      <div className="space-y-3">
        <div className="h-3.5 w-40 animate-pulse rounded bg-stone-200" />
        <div className="h-9 w-full max-w-[520px] animate-pulse rounded bg-stone-200" />
        <div className="h-4 w-full max-w-[640px] animate-pulse rounded bg-stone-100" />
      </div>
      <div className="mt-6 border-t border-stone-200 pt-6">
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[92%] animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[88%] animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[84%] animate-pulse rounded bg-stone-100" />
        </div>
      </div>
    </div>
  )
}

interface DailyReviewStreamState {
  requestId: string | null
  content: string
  loading: boolean
  error: Error | null
  result: DailyReviewResult | null
  mode: 'mock' | 'live' | null
}

export function DailyReviewView({ initialDateKey }: DailyReviewViewProps) {
  const { language, t } = useI18n()
  const { toast } = useToast()
  const metaQuery = useAppMeta()
  const docGenerationSettingsQuery = useDocGenerationSettings()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeRequestRef = useRef<{ requestId: string | null; dateKey: string }>({
    requestId: null,
    dateKey: initialDateKey,
  })
  const [dateKey, setDateKey] = useState(initialDateKey)
  const [requestState, setRequestState] = useState({ version: 0, forceRefresh: false })
  const [streamState, setStreamState] = useState<DailyReviewStreamState>({
    requestId: null,
    content: '',
    loading: false,
    error: null,
    result: null,
    mode: null,
  })
  const settingsResolved = docGenerationSettingsQuery.isSuccess || docGenerationSettingsQuery.isError
  const streamOutputEnabled = docGenerationSettingsQuery.data?.streamOutput ?? true
  const reviewQuery = useDailyReview(
    language,
    dateKey,
    requestState.version,
    requestState.forceRefresh,
    settingsResolved && !streamOutputEnabled,
  )
  const saveSnapshotMutation = useSaveDailyReviewSnapshot()
  const result = streamOutputEnabled ? streamState.result : reviewQuery.data
  const isGenerating = streamOutputEnabled ? streamState.loading : reviewQuery.isPending
  const activeError = streamOutputEnabled ? streamState.error : reviewQuery.error
  const streamedContent = streamOutputEnabled ? streamState.content : ''
  const providerMode = result?.mode ?? streamState.mode ?? metaQuery.data?.activeAiMode ?? 'mock'
  const topTagLabel = useMemo(() => {
    if (!result || result.topTags.length === 0) {
      return t('review.daily.topTagEmpty')
    }

    return result.topTags.map((tag) => `#${tag}`).join(' · ')
  }, [result, t])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('date', dateKey)
    window.history.replaceState(null, '', url.toString())
    scrollRef.current?.scrollTo({ top: 0 })
  }, [dateKey, requestState.version])

  useEffect(() => {
    if (!settingsResolved) {
      return undefined
    }

    if (!streamOutputEnabled) {
      activeRequestRef.current = {
        requestId: null,
        dateKey,
      }
      setStreamState({
        requestId: null,
        content: '',
        loading: false,
        error: null,
        result: null,
        mode: null,
      })
      return
    }

    let cancelled = false

    activeRequestRef.current = {
      requestId: null,
      dateKey,
    }
    setStreamState({
      requestId: null,
      content: '',
      loading: true,
      error: null,
      result: null,
      mode: null,
    })

    void changbu.review.startDailyGeneration(dateKey, requestState.forceRefresh)
      .then((start) => {
        if (cancelled) {
          return
        }

        activeRequestRef.current = {
          requestId: start.requestId,
          dateKey,
        }
        setStreamState((current) => ({
          ...current,
          requestId: start.requestId,
          mode: start.mode,
        }))
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setStreamState({
          requestId: null,
          content: '',
          loading: false,
          error: error instanceof Error ? error : new Error(t('review.daily.generateFailed')),
          result: null,
          mode: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [dateKey, requestState.forceRefresh, requestState.version, settingsResolved, streamOutputEnabled, t])

  useEffect(() => {
    if (!streamOutputEnabled) {
      return undefined
    }

    return changbu.events.onReviewGenerationChunk((chunk) => {
      const active = activeRequestRef.current

      if (chunk.kind !== 'daily-review' || chunk.requestId !== active.requestId) {
        return
      }

      if (!chunk.done) {
        setStreamState((current) => {
          if (current.requestId !== chunk.requestId) {
            return current
          }

          return {
            ...current,
            content: `${current.content}${chunk.delta}`,
            loading: true,
            error: null,
            mode: chunk.mode,
          }
        })
        return
      }

      if (chunk.error) {
        setStreamState((current) => {
          if (current.requestId !== chunk.requestId) {
            return current
          }

          return {
            ...current,
            loading: false,
            error: new Error(chunk.error ?? t('review.daily.generateFailed')),
            content: chunk.fullText ?? current.content,
            mode: chunk.mode,
          }
        })
        return
      }

      setStreamState((current) => {
        if (current.requestId !== chunk.requestId) {
          return current
        }

        return {
          ...current,
          content: chunk.fullText ?? current.content,
          loading: true,
          error: null,
          mode: chunk.mode,
        }
      })

      const finalDateKey = active.dateKey

      void changbu.review.generateDaily(finalDateKey, false)
        .then((finalResult) => {
          if (activeRequestRef.current.requestId !== chunk.requestId) {
            return
          }

          setStreamState((current) => {
            if (current.requestId !== chunk.requestId) {
              return current
            }

            return {
              ...current,
              content: finalResult.content,
              loading: false,
              error: null,
              result: finalResult,
              mode: finalResult.mode,
            }
          })
        })
        .catch((error) => {
          if (activeRequestRef.current.requestId !== chunk.requestId) {
            return
          }

          setStreamState((current) => {
            if (current.requestId !== chunk.requestId) {
              return current
            }

            return {
              ...current,
              loading: false,
              error: error instanceof Error ? error : new Error(t('review.daily.generateFailed')),
              content: chunk.fullText ?? current.content,
            }
          })
        })
    })
  }, [streamOutputEnabled, t])

  useEffect(() => {
    activeRequestRef.current = {
      requestId: null,
      dateKey,
    }
    setStreamState({
      requestId: null,
      content: '',
      loading: false,
      error: null,
      result: null,
      mode: null,
    })
    setRequestState((current) => ({ version: current.version + 1, forceRefresh: false }))
  }, [language])

  function switchDate(nextDateKey: string) {
    setDateKey(nextDateKey)
    setRequestState((current) => ({ version: current.version + 1, forceRefresh: false }))
  }

  function regenerate() {
    setRequestState((current) => ({ version: current.version + 1, forceRefresh: true }))
  }

  async function handleSaveSnapshot() {
    if (!result) {
      return
    }

    try {
      await saveSnapshotMutation.mutateAsync({
        title: result.title,
        content: result.content,
        blockIds: result.blockIds,
      })
      toast('success', t('review.daily.snapshotSaved'))
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('review.daily.snapshotSaveFailed'))
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-stone-900">
      <div className="border-b border-stone-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              <span>{t('review.daily.title')}</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.14em] ${providerMode === 'live' ? 'border-emerald-200 text-emerald-700' : 'border-stone-200 text-stone-500'}`}>
                {providerMode === 'live' ? 'Live AI' : 'Mock AI'}
              </span>
            </div>
            <h3 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-stone-900">
              {formatDateKeyLabel(dateKey, { weekday: true })}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span>
                {result ? t('review.daily.blocks', { count: result.blockCount }) : t('review.daily.sorting')}
                {result ? ` · ${t('review.daily.entries', { planned: result.plannedEntryCount, done: result.doneEntryCount })}` : ''}
              </span>
              {result ? <span className="text-stone-400">{topTagLabel}</span> : null}
              {result?.generatedAt ? <span className="text-stone-400">{t('review.daily.generatedAt', { time: formatTimeLabel(result.generatedAt) })}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={() => switchDate(shiftDateKey(dateKey, -1))} disabled={isGenerating || saveSnapshotMutation.isPending}>
              {t('review.daily.prevDay')}
            </ActionButton>
            <ActionButton onClick={() => switchDate(shiftDateKey(dateKey, 1))} disabled={isGenerating || saveSnapshotMutation.isPending}>
              {t('review.daily.nextDay')}
            </ActionButton>
            <ActionButton onClick={regenerate} disabled={isGenerating || saveSnapshotMutation.isPending}>
              {isGenerating ? t('review.common.generating') : t('review.common.regenerate')}
            </ActionButton>
            <ActionButton accent onClick={() => { void handleSaveSnapshot() }} disabled={!result || isGenerating || saveSnapshotMutation.isPending}>
              {saveSnapshotMutation.isPending ? t('review.common.savingSnapshot') : t('review.common.saveSnapshot')}
            </ActionButton>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {((!settingsResolved) || (isGenerating && !streamedContent)) ? <DailyReviewSkeleton /> : null}

        {settingsResolved && activeError ? (
          <div className="mx-auto w-full max-w-[860px] px-6 py-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">{t('review.daily.errorEyebrow')}</div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">{t('review.daily.errorTitle')}</div>
            <p className="mt-3 max-w-[640px] text-sm leading-7 text-stone-500">
              {activeError instanceof Error ? activeError.message : t('review.daily.errorHint')}
            </p>
            <div className="mt-5">
              <ActionButton onClick={regenerate}>{t('review.common.regenerate')}</ActionButton>
            </div>
          </div>
        ) : null}

        {settingsResolved && !isGenerating && !activeError && result ? (
          <div className="mx-auto w-full max-w-[860px] px-6 py-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                <div className="mx-auto max-w-[720px]">
                  <MarkdownContent content={result.content} />
                </div>
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.daily.sources')}</div>
                    <div className="mt-1 leading-6">
                      {result.sourceBlocks.length > 0 ? t('review.daily.sourceCount', { count: result.sourceBlocks.length }) : t('review.daily.noBlocks')}
                    </div>
                  </div>

                  <details open={result.sourceBlocks.length > 0} className="border-t border-stone-200 pt-3">
                    <summary className="cursor-pointer list-none text-sm font-medium text-stone-800 marker:hidden">
                      {t('review.daily.viewSources')}
                    </summary>
                    <div className="mt-3 divide-y divide-stone-200">
                      {result.sourceBlocks.length > 0 ? result.sourceBlocks.map((block) => (
                        <div key={block.id} className="py-3 first:pt-0">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">
                            {formatDateByLanguage(new Date(block.createdAt), {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            }, language)}
                          </div>
                          <div className="mt-1.5 text-sm leading-6 text-stone-800">{block.preview}</div>
                          {block.tags.length > 0 ? (
                            <div className="mt-1.5 text-[12px] leading-5 text-stone-400">{block.tags.slice(0, 4).map((tag) => `#${tag}`).join(' · ')}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="py-1 text-sm leading-6 text-stone-500">{t('review.daily.sourceEmpty')}</div>
                      )}
                    </div>
                  </details>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {settingsResolved && streamOutputEnabled && isGenerating && streamedContent ? (
          <div className="mx-auto w-full max-w-[860px] px-6 py-6">
            <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                <div className="mx-auto max-w-[720px]">
                  <MarkdownContent content={streamedContent} />
                </div>
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.common.streamStatus')}</div>
                    <div className="mt-1 leading-6">{t('review.daily.streamingHint')}</div>
                  </div>
                  <div className="border-t border-stone-200 pt-3 text-xs leading-6 text-stone-400">
                    {t('review.daily.streamingEnabled')}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
