import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  getAiInsightMethodDefinition,
  getAiInsightMethodDefinitions,
  isAiInsightMethodId,
  type AiInsightIconKey,
} from '../../shared/aiInsights'
import type { AiInsightHistoryRecord, AiInsightMethodId, AiInsightResult } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useAppMeta } from '../hooks/useAppMeta'
import { useAiInsight, useAiInsightHistory, useDocGenerationSettings, useSaveAiInsightSnapshot } from '../hooks/useReview'
import { useI18n } from '../i18n/useI18n'
import { formatDateKeyLabel, formatTimeLabel } from '../lib/format'
import { queryKeys } from '../lib/queryKeys'
import { shiftDateKey } from '../lib/timelineReview'
import { MarkdownContent } from './MarkdownContent'
import { ActionButton } from './ui/ActionButton'
import { useToast } from './toast-context'

interface AiInsightsViewProps {
  initialDateKey: string
}

interface AiInsightStreamState {
  requestId: string | null
  content: string
  loading: boolean
  error: Error | null
  result: AiInsightResult | null
  mode: 'mock' | 'live' | null
}

const HISTORY_LIMIT = 30

function resolveInitialMethodId(): AiInsightMethodId | null {
  const method = new URLSearchParams(window.location.search).get('method')
  return isAiInsightMethodId(method) ? method : null
}

function formatRangeLabel(start: string, end: string): string {
  return `${formatDateKeyLabel(start)} — ${formatDateKeyLabel(end)}`
}

function getAiInsightMethodLabel(methodId: AiInsightMethodId, language: 'zh' | 'en', fallbackLabel: string): string {
  return getAiInsightMethodDefinition(methodId, language)?.label ?? fallbackLabel
}

function InsightIcon({ iconKey }: { iconKey: AiInsightIconKey }) {
  const commonProps = {
    className: 'h-[18px] w-[18px]',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.8',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 20 20',
  }

  switch (iconKey) {
    case 'compass':
      return <svg {...commonProps}><circle cx="10" cy="10" r="6.2" /><path d="m8.2 11.8 4.9-4.9-1.6 6.5-6.5 1.6 1.6-6.5Z" /></svg>
    case 'flip':
      return <svg {...commonProps}><path d="M6 6h8v8H6z" /><path d="m8 4-3 3 3 3" /><path d="m12 16 3-3-3-3" /></svg>
    case 'orbit':
      return <svg {...commonProps}><circle cx="10" cy="10" r="2.2" /><path d="M4.8 10c0-3.3 2.3-6 5.2-6s5.2 2.7 5.2 6-2.3 6-5.2 6-5.2-2.7-5.2-6Z" /><path d="M6.1 5.8c2.8-1.6 6.5-.9 8.3 1.6 1.8 2.5 1.3 6.1-1.1 7.9-2.5 1.8-6.1 1.3-7.9-1.1-1.8-2.5-1.3-6.1 1.1-8.4Z" opacity="0.5" /></svg>
    case 'pattern':
      return <svg {...commonProps}><path d="M4.5 5.5h4v4h-4z" /><path d="M11.5 5.5h4v4h-4z" /><path d="M4.5 12.5h4v4h-4z" /><path d="m12.2 12.2 3.3 3.3" /><path d="m15.5 12.2-3.3 3.3" /></svg>
    case 'persona':
      return <svg {...commonProps}><path d="M6.2 15.5c.8-2.1 2.3-3.2 3.8-3.2s3 .9 3.8 3.2" /><circle cx="10" cy="7.3" r="2.8" /><path d="M4.5 4.5v11h11" opacity="0.5" /></svg>
    case 'spark':
    default:
      return <svg {...commonProps}><path d="m10 3 1.3 4 4 1.3-4 1.4-1.3 4-1.4-4-4-1.4 4-1.3Z" /><path d="m15.2 13.8.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" /></svg>
  }
}

function InsightMethodButton({
  methodId,
  language,
  onSelect,
}: {
  methodId: AiInsightMethodId
  language: 'zh' | 'en'
  onSelect: (methodId: AiInsightMethodId) => void
}) {
  const method = getAiInsightMethodDefinition(methodId, language)

  if (!method) {
    return null
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(method.id)}
      className="group flex w-full items-start gap-4 py-4 text-left transition hover:bg-stone-50/80"
    >
      <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-stone-200 bg-white text-stone-700 transition group-hover:border-stone-300 group-hover:text-stone-900">
        <InsightIcon iconKey={method.iconKey} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{method.authorLabel}</span>
        <span className="mt-1 block text-[17px] font-semibold tracking-[-0.02em] text-stone-900">{method.label}</span>
        <span className="mt-1.5 block text-sm leading-6 text-stone-500">{method.description}</span>
      </span>
      <span className="mt-1 text-stone-300 transition group-hover:text-stone-500">↗</span>
    </button>
  )
}

function AiInsightSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
      <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="space-y-3 border-t border-stone-200 pt-6">
          <div className="h-4 w-36 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[90%] animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[84%] animate-pulse rounded bg-stone-100" />
        </div>
        <div className="space-y-3 border-t border-stone-200 pt-6">
          <div className="h-3.5 w-20 animate-pulse rounded bg-stone-200" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-full animate-pulse rounded bg-stone-100" />
          <div className="h-4 w-[75%] animate-pulse rounded bg-stone-100" />
        </div>
      </div>
    </div>
  )
}

export function AiInsightsView({ initialDateKey }: AiInsightsViewProps) {
  const { language, t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const metaQuery = useAppMeta()
  const docGenerationSettingsQuery = useDocGenerationSettings()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeRequestRef = useRef<{ requestId: string | null; dateKey: string; methodId: AiInsightMethodId | null }>({
    requestId: null,
    dateKey: initialDateKey,
    methodId: resolveInitialMethodId(),
  })
  const lastHistoryInvalidateKeyRef = useRef<string | null>(null)
  const [selectedMethodId, setSelectedMethodId] = useState<AiInsightMethodId | null>(resolveInitialMethodId)
  const [requestState, setRequestState] = useState({ version: 0, forceRefresh: false })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [streamState, setStreamState] = useState<AiInsightStreamState>({
    requestId: null,
    content: '',
    loading: false,
    error: null,
    result: null,
    mode: null,
  })
  const settingsResolved = docGenerationSettingsQuery.isSuccess || docGenerationSettingsQuery.isError
  const streamOutputEnabled = docGenerationSettingsQuery.data?.streamOutput ?? true
  const effectiveMethodId = selectedMethodId ?? 'default-insight'
  const insightQuery = useAiInsight(
    language,
    effectiveMethodId,
    initialDateKey,
    requestState.version,
    requestState.forceRefresh,
    settingsResolved && Boolean(selectedMethodId) && !streamOutputEnabled,
  )
  const showingGlobalHistory = historyOpen && !selectedMethodId
  const historyQuery = useAiInsightHistory(language, null, showingGlobalHistory, HISTORY_LIMIT)
  const saveSnapshotMutation = useSaveAiInsightSnapshot()
  const generatedResult = streamOutputEnabled ? streamState.result : insightQuery.data
  const currentResult = selectedMethodId ? generatedResult : null
  const isGenerating = selectedMethodId ? (streamOutputEnabled ? streamState.loading : insightQuery.isPending) : false
  const activeError = selectedMethodId ? (streamOutputEnabled ? streamState.error : insightQuery.error) : null
  const streamedContent = selectedMethodId && streamOutputEnabled ? streamState.content : ''
  const currentProviderMode = selectedMethodId
    ? (currentResult?.mode ?? streamState.mode ?? metaQuery.data?.activeAiMode ?? 'mock')
    : (metaQuery.data?.activeAiMode ?? 'mock')
  const fallbackRangeStart = shiftDateKey(initialDateKey, -13)
  const insightMethods = useMemo(() => getAiInsightMethodDefinitions(language), [language])
  const methodsInColumns = useMemo(() => [
    insightMethods.filter((_, index) => index % 2 === 0),
    insightMethods.filter((_, index) => index % 2 === 1),
  ], [insightMethods])
  const historyRecords = historyQuery.data ?? []
  const selectedHistoryRecord = showingGlobalHistory
    ? (historyRecords.find((record) => record.id === selectedHistoryId) ?? historyRecords[0] ?? null)
    : null
  const displayedMode = showingGlobalHistory ? (selectedHistoryRecord?.mode ?? currentProviderMode) : currentProviderMode
  const displayedGeneratedAt = showingGlobalHistory ? selectedHistoryRecord?.createdAt : currentResult?.generatedAt
  const displayedRangeLabel = showingGlobalHistory && selectedHistoryRecord
    ? formatRangeLabel(selectedHistoryRecord.rangeStart, selectedHistoryRecord.rangeEnd)
    : currentResult
      ? formatRangeLabel(currentResult.rangeStart, currentResult.rangeEnd)
      : selectedMethodId
        ? formatRangeLabel(fallbackRangeStart, initialDateKey)
        : null
  const saveableInsight = showingGlobalHistory ? selectedHistoryRecord : currentResult

  useEffect(() => {
    const url = new URL(window.location.href)

    if (selectedMethodId) {
      url.searchParams.set('method', selectedMethodId)
    } else {
      url.searchParams.delete('method')
    }

    window.history.replaceState(null, '', url.toString())
    scrollRef.current?.scrollTo({ top: 0 })
  }, [historyOpen, requestState.version, selectedMethodId])

  useEffect(() => {
    if (!showingGlobalHistory) {
      return
    }

    if (historyRecords.length === 0) {
      if (selectedHistoryId !== null) {
        setSelectedHistoryId(null)
      }
      return
    }

    if (!selectedHistoryId || !historyRecords.some((record) => record.id === selectedHistoryId)) {
      setSelectedHistoryId(historyRecords[0].id)
    }
  }, [historyRecords, selectedHistoryId, showingGlobalHistory])

  useEffect(() => {
    if (!selectedMethodId || !currentResult) {
      return
    }

    const invalidateKey = `${currentResult.methodId}:${currentResult.generatedAt}:${currentResult.empty ? '1' : '0'}`
    if (lastHistoryInvalidateKeyRef.current === invalidateKey) {
      return
    }

    lastHistoryInvalidateKeyRef.current = invalidateKey
    void queryClient.invalidateQueries({
      queryKey: queryKeys.reviewInsightHistoryRoot(),
    })
  }, [currentResult, queryClient, selectedMethodId])

  useEffect(() => {
    activeRequestRef.current = {
      requestId: null,
      dateKey: initialDateKey,
      methodId: selectedMethodId,
    }
    lastHistoryInvalidateKeyRef.current = null
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

  useEffect(() => {
    if (!settingsResolved) {
      return undefined
    }

    if (!selectedMethodId || !streamOutputEnabled) {
      activeRequestRef.current = {
        requestId: null,
        dateKey: initialDateKey,
        methodId: selectedMethodId,
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
      dateKey: initialDateKey,
      methodId: selectedMethodId,
    }
    setStreamState({
      requestId: null,
      content: '',
      loading: true,
      error: null,
      result: null,
      mode: null,
    })

    void changbu.review.startInsightGeneration(selectedMethodId, initialDateKey, requestState.forceRefresh)
      .then((start) => {
        if (cancelled) {
          return
        }

        activeRequestRef.current = {
          requestId: start.requestId,
          dateKey: initialDateKey,
          methodId: selectedMethodId,
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
          error: error instanceof Error ? error : new Error(t('review.ai.generateFailed')),
          result: null,
          mode: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [initialDateKey, requestState.forceRefresh, requestState.version, selectedMethodId, settingsResolved, streamOutputEnabled])

  useEffect(() => {
    if (!streamOutputEnabled) {
      return undefined
    }

    return changbu.events.onReviewGenerationChunk((chunk) => {
      const active = activeRequestRef.current

      if (chunk.kind !== 'ai-insight' || chunk.requestId !== active.requestId) {
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
            error: new Error(chunk.error ?? t('review.ai.generateFailed')),
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

      const finalMethodId = active.methodId
      const finalDateKey = active.dateKey

      if (!finalMethodId) {
        return
      }

      void changbu.review.generateInsight(finalMethodId, finalDateKey, false)
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
              error: error instanceof Error ? error : new Error(t('review.ai.generateFailed')),
              content: chunk.fullText ?? current.content,
            }
          })
        })
    })
  }, [streamOutputEnabled, t])

  function handleSelectMethod(methodId: AiInsightMethodId) {
    setSelectedMethodId(methodId)
    setRequestState({ version: 0, forceRefresh: false })
    setHistoryOpen(false)
    setSelectedHistoryId(null)
  }

  function handleBackToLibrary() {
    setSelectedMethodId(null)
    setRequestState({ version: 0, forceRefresh: false })
    setHistoryOpen(false)
    setSelectedHistoryId(null)
  }

  function handleRegenerate() {
    setRequestState((current) => ({ version: current.version + 1, forceRefresh: true }))
  }

  function handleOpenHistory() {
    setHistoryOpen(true)
    setSelectedHistoryId(null)
  }

  function handleCloseHistory() {
    setHistoryOpen(false)
    setSelectedHistoryId(null)
  }

  async function handleSaveSnapshot() {
    if (!saveableInsight) {
      return
    }

    try {
      await saveSnapshotMutation.mutateAsync({
        methodId: saveableInsight.methodId,
        date: saveableInsight.date,
        rangeStart: saveableInsight.rangeStart,
        rangeEnd: saveableInsight.rangeEnd,
        title: saveableInsight.title,
        content: saveableInsight.content,
        blockIds: saveableInsight.blockIds,
      })
      toast('success', t('review.ai.snapshotSaved'))
    } catch (error) {
      toast('error', error instanceof Error ? error.message : t('review.ai.snapshotSaveFailed'))
    }
  }

  function renderHistoryListItem(record: AiInsightHistoryRecord) {
    const selected = record.id === selectedHistoryRecord?.id
    const methodLabel = getAiInsightMethodLabel(record.methodId, language, t('review.ai.defaultLabel'))

    return (
      <button
        key={record.id}
        type="button"
        onClick={() => setSelectedHistoryId(record.id)}
        className={[
          'w-full rounded-lg border px-3 py-3 text-left transition',
          selected
            ? 'border-stone-900 bg-stone-900 text-white'
            : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50',
        ].join(' ')}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className={selected ? 'text-[11px] uppercase tracking-[0.12em] text-stone-300' : 'text-[11px] uppercase tracking-[0.12em] text-stone-400'}>
            {formatTimeLabel(record.createdAt)}
          </div>
          <div className={selected ? 'rounded-full border border-stone-700 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-stone-200' : 'rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-stone-500'}>
            {methodLabel}
          </div>
        </div>
        <div className="mt-1.5 text-sm font-medium leading-6">{record.title}</div>
        <div className={selected ? 'mt-2 text-[12px] leading-5 text-stone-300' : 'mt-2 text-[12px] leading-5 text-stone-500'}>
          {formatDateKeyLabel(record.date, { weekday: true })}
          {' · '}
          {record.mode === 'live' ? t('review.common.modeLive') : t('review.common.modeMock')}
          {record.empty ? ` · ${t('review.ai.emptyResult')}` : ''}
        </div>
      </button>
    )
  }

  const headerEyebrow = showingGlobalHistory
    ? t('review.ai.historyEyebrow')
    : selectedMethodId
      ? t('review.ai.resultEyebrow')
      : t('review.ai.libraryEyebrow')
  const headerTitle = showingGlobalHistory
    ? t('review.ai.historyTitle')
    : selectedMethodId
      ? getAiInsightMethodLabel(selectedMethodId, language, t('review.ai.defaultLabel'))
      : t('review.ai.selectMethod')

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-stone-900">
      <div className="border-b border-stone-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              <span className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.14em] ${displayedMode === 'live' ? 'border-emerald-200 text-emerald-700' : 'border-stone-200 text-stone-500'}`}>
                {displayedMode === 'live' ? t('review.common.modeLive') : t('review.common.modeMock')}
              </span>
              <span>{headerEyebrow}</span>
            </div>
            <h3 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-stone-900">{headerTitle}</h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              {showingGlobalHistory ? (
                selectedHistoryRecord ? (
                  <>
                    <span>{getAiInsightMethodLabel(selectedHistoryRecord.methodId, language, t('review.ai.defaultLabel'))}</span>
                    <span className="text-stone-400">{t('review.ai.anchorDate', { date: formatDateKeyLabel(selectedHistoryRecord.date, { weekday: true }) })}</span>
                    {displayedRangeLabel ? <span className="text-stone-400">{t('review.ai.rangeLabel', { range: displayedRangeLabel })}</span> : null}
                    {displayedGeneratedAt ? <span className="text-stone-400">{t('review.ai.generatedAt', { time: formatTimeLabel(displayedGeneratedAt) })}</span> : null}
                  </>
                ) : (
                  <>
                    <span>{t('review.ai.recentHistory', { count: HISTORY_LIMIT })}</span>
                    <span className="text-stone-400">{t('review.ai.recentHistoryHint')}</span>
                  </>
                )
              ) : selectedMethodId ? (
                <>
                  <span>{formatDateKeyLabel(initialDateKey, { weekday: true })}</span>
                  {displayedRangeLabel ? <span className="text-stone-400">{t('review.ai.rangeLabel', { range: displayedRangeLabel })}</span> : null}
                  {displayedGeneratedAt ? <span className="text-stone-400">{t('review.ai.generatedAt', { time: formatTimeLabel(displayedGeneratedAt) })}</span> : null}
                </>
              ) : (
                <>
                  <span>{formatDateKeyLabel(initialDateKey, { weekday: true })}</span>
                  <span className="text-stone-400">{t('review.ai.selectMethodHint')}</span>
                </>
              )}
            </div>
          </div>

          {showingGlobalHistory ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={handleCloseHistory} disabled={saveSnapshotMutation.isPending}>{t('review.ai.backToLibrary')}</ActionButton>
              <ActionButton accent onClick={() => { void handleSaveSnapshot() }} disabled={!saveableInsight || saveSnapshotMutation.isPending}>
                {saveSnapshotMutation.isPending ? t('review.common.savingSnapshot') : t('review.common.saveSnapshot')}
              </ActionButton>
            </div>
          ) : selectedMethodId ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={handleBackToLibrary} disabled={isGenerating || saveSnapshotMutation.isPending}>{t('review.ai.switchMethod')}</ActionButton>
              <ActionButton onClick={handleRegenerate} disabled={isGenerating || saveSnapshotMutation.isPending}>
                {isGenerating ? t('review.common.generating') : t('review.common.regenerate')}
              </ActionButton>
              <ActionButton accent onClick={() => { void handleSaveSnapshot() }} disabled={!saveableInsight || isGenerating || saveSnapshotMutation.isPending}>
                {saveSnapshotMutation.isPending ? t('review.common.savingSnapshot') : t('review.common.saveSnapshot')}
              </ActionButton>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={handleOpenHistory}>{t('review.ai.historyButton')}</ActionButton>
            </div>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {!selectedMethodId && !showingGlobalHistory ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-x-12 gap-y-2 md:grid-cols-2">
              {methodsInColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="divide-y divide-stone-200 border-t border-stone-200">
                  {column.map((method) => (
                    <InsightMethodButton key={method.id} methodId={method.id} language={language} onSelect={handleSelectMethod} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showingGlobalHistory ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_240px] md:gap-10">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                {selectedHistoryRecord ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                      <span>{getAiInsightMethodLabel(selectedHistoryRecord.methodId, language, t('review.ai.defaultLabel'))}</span>
                      <span>{selectedHistoryRecord.mode === 'live' ? t('review.common.modeLive') : t('review.common.modeMock')}</span>
                      <span>{selectedHistoryRecord.empty ? t('review.ai.emptyResult') : t('review.ai.historyContent')}</span>
                      <span>{t('review.ai.generatedAt', { time: formatTimeLabel(selectedHistoryRecord.createdAt) })}</span>
                    </div>
                    <div className="mt-2 text-sm leading-6 text-stone-400">{formatRangeLabel(selectedHistoryRecord.rangeStart, selectedHistoryRecord.rangeEnd)}</div>
                    <div className="mt-3 text-lg font-medium tracking-[-0.02em] text-stone-900">{selectedHistoryRecord.title}</div>
                    <div className="mt-6 max-w-[760px]">
                      <MarkdownContent content={selectedHistoryRecord.content} />
                    </div>
                  </>
                ) : historyQuery.isPending ? (
                  <AiInsightSkeleton />
                ) : historyQuery.error ? (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">{t('review.ai.historyLoadingFailed')}</div>
                    <p className="mt-3 max-w-[680px] text-sm leading-7 text-stone-500">
                      {historyQuery.error instanceof Error ? historyQuery.error.message : t('review.ai.historyFailedHint')}
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.ai.noHistory')}</div>
                    <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">{t('review.ai.noHistoryTitle')}</div>
                    <p className="mt-3 max-w-[680px] text-sm leading-7 text-stone-500">
                      {t('review.ai.noHistoryHint')}
                    </p>
                  </div>
                )}
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.ai.historyList')}</div>
                    <div className="mt-1 leading-6">{t('review.ai.historyListHint', { count: HISTORY_LIMIT })}</div>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    {historyQuery.isPending ? (
                      <div className="space-y-3">
                        <div className="h-16 animate-pulse rounded-lg bg-stone-100" />
                        <div className="h-16 animate-pulse rounded-lg bg-stone-100" />
                        <div className="h-16 animate-pulse rounded-lg bg-stone-100" />
                      </div>
                    ) : historyQuery.error ? (
                      <div className="text-sm leading-6 text-stone-500">{t('review.ai.historyLoadFailed')}</div>
                    ) : historyRecords.length > 0 ? (
                      <div className="space-y-3">
                        {historyRecords.map(renderHistoryListItem)}
                      </div>
                    ) : (
                      <div className="text-sm leading-6 text-stone-500">{t('review.ai.historyNoRecords')}</div>
                    )}
                  </div>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {selectedMethodId && ((!settingsResolved) || (isGenerating && !streamedContent)) ? <AiInsightSkeleton /> : null}

        {selectedMethodId && settingsResolved && activeError ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">{t('review.ai.errorEyebrow')}</div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">{t('review.ai.errorTitle')}</div>
            <p className="mt-3 max-w-[680px] text-sm leading-7 text-stone-500">
              {activeError instanceof Error ? activeError.message : t('review.ai.errorHint')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton onClick={handleBackToLibrary}>{t('review.ai.switchMethod')}</ActionButton>
              <ActionButton onClick={handleRegenerate}>{t('review.common.regenerate')}</ActionButton>
            </div>
          </div>
        ) : null}

        {selectedMethodId && settingsResolved && !isGenerating && !activeError && currentResult ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_240px] md:gap-10">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                  <span>{t('review.ai.blocks', { count: currentResult.blockCount })}</span>
                  <span>{t('review.ai.planned', { count: currentResult.plannedEntryCount })}</span>
                  <span>{t('review.ai.done', { count: currentResult.doneEntryCount })}</span>
                  {currentResult.canceledEntryCount > 0 ? <span>{t('review.ai.canceled', { count: currentResult.canceledEntryCount })}</span> : null}
                </div>
                {currentResult.topTags.length > 0 ? (
                  <div className="mt-2 text-sm leading-6 text-stone-400">{currentResult.topTags.map((tag) => `#${tag}`).join(' · ')}</div>
                ) : null}
                <div className="mt-6 max-w-[760px]">
                  <MarkdownContent content={currentResult.content} />
                </div>
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.ai.scope')}</div>
                    <div className="mt-1 leading-6">{formatRangeLabel(currentResult.rangeStart, currentResult.rangeEnd)}</div>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.ai.dataSource')}</div>
                    <div className="mt-1 leading-6">{t('review.ai.dataSourceHint', {
                      blocks: currentResult.sourceBlocks.length,
                      entries: currentResult.calendarEntryIds.length,
                    })}</div>
                  </div>

                  <details open={currentResult.sourceBlocks.length > 0} className="border-t border-stone-200 pt-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-stone-800 marker:hidden">
                      {t('review.daily.viewSources')}
                    </summary>
                    <div className="mt-3 divide-y divide-stone-200">
                      {currentResult.sourceBlocks.length > 0 ? currentResult.sourceBlocks.map((block) => (
                        <div key={block.id} className="py-3 first:pt-0">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">{block.date}</div>
                          <div className="mt-1.5 text-sm leading-6 text-stone-800">{block.preview}</div>
                          {block.tags.length > 0 ? (
                            <div className="mt-1.5 text-[12px] leading-5 text-stone-400">{block.tags.slice(0, 4).map((tag) => `#${tag}`).join(' · ')}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="py-1 text-sm leading-6 text-stone-500">{t('review.ai.sourceEmpty')}</div>
                      )}
                    </div>
                  </details>
                </div>
              </aside>
            </div>
          </div>
        ) : null}

        {selectedMethodId && settingsResolved && streamOutputEnabled && isGenerating && streamedContent ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_240px] md:gap-10">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                <div className="mt-0 max-w-[760px]">
                  <MarkdownContent content={streamedContent} />
                </div>
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{t('review.common.streamStatus')}</div>
                    <div className="mt-1 leading-6">{t('review.ai.streamingHint')}</div>
                  </div>
                  <div className="border-t border-stone-200 pt-4 text-xs leading-6 text-stone-400">
                    {t('review.ai.streamingEnabled')}
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
