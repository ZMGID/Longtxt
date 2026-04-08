import { useEffect, useMemo, useRef, useState } from 'react'

import { AI_INSIGHT_METHODS, getAiInsightMethodDefinition, isAiInsightMethodId, type AiInsightIconKey } from '../../shared/aiInsights'
import type { AiInsightMethodId, AiInsightResult } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useAppMeta } from '../hooks/useAppMeta'
import { useAiInsight, useDocGenerationSettings, useSaveAiInsightSnapshot } from '../hooks/useReview'
import { formatDateKeyLabel, formatTimeLabel } from '../lib/format'
import { shiftDateKey } from '../lib/timelineReview'
import { MarkdownContent } from './MarkdownContent'
import { ActionButton } from './ui/ActionButton'
import { useToast } from './toast-context'

interface AiInsightsViewProps {
  initialDateKey: string
}

function resolveInitialMethodId(): AiInsightMethodId | null {
  const method = new URLSearchParams(window.location.search).get('method')
  return isAiInsightMethodId(method) ? method : null
}

function formatRangeLabel(start: string, end: string): string {
  return `${formatDateKeyLabel(start)} — ${formatDateKeyLabel(end)}`
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
  onSelect,
}: {
  methodId: AiInsightMethodId
  onSelect: (methodId: AiInsightMethodId) => void
}) {
  const method = getAiInsightMethodDefinition(methodId)

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

interface AiInsightStreamState {
  requestId: string | null
  content: string
  loading: boolean
  error: Error | null
  result: AiInsightResult | null
  mode: 'mock' | 'live' | null
}

export function AiInsightsView({ initialDateKey }: AiInsightsViewProps) {
  const { toast } = useToast()
  const metaQuery = useAppMeta()
  const docGenerationSettingsQuery = useDocGenerationSettings()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const activeRequestRef = useRef<{ requestId: string | null; dateKey: string; methodId: AiInsightMethodId | null }>({
    requestId: null,
    dateKey: initialDateKey,
    methodId: resolveInitialMethodId(),
  })
  const [selectedMethodId, setSelectedMethodId] = useState<AiInsightMethodId | null>(resolveInitialMethodId)
  const [requestState, setRequestState] = useState({ version: 0, forceRefresh: false })
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
    effectiveMethodId,
    initialDateKey,
    requestState.version,
    requestState.forceRefresh,
    settingsResolved && Boolean(selectedMethodId) && !streamOutputEnabled,
  )
  const saveSnapshotMutation = useSaveAiInsightSnapshot()
  const result = streamOutputEnabled ? streamState.result : insightQuery.data
  const isGenerating = streamOutputEnabled ? streamState.loading : insightQuery.isPending
  const activeError = streamOutputEnabled ? streamState.error : insightQuery.error
  const streamedContent = streamOutputEnabled ? streamState.content : ''
  const providerMode = result?.mode ?? streamState.mode ?? metaQuery.data?.activeAiMode ?? 'mock'
  const fallbackRangeStart = shiftDateKey(initialDateKey, -13)
  const methodsInColumns = useMemo(() => [
    AI_INSIGHT_METHODS.filter((_, index) => index % 2 === 0),
    AI_INSIGHT_METHODS.filter((_, index) => index % 2 === 1),
  ], [])

  useEffect(() => {
    const url = new URL(window.location.href)

    if (selectedMethodId) {
      url.searchParams.set('method', selectedMethodId)
    } else {
      url.searchParams.delete('method')
    }

    window.history.replaceState(null, '', url.toString())
    scrollRef.current?.scrollTo({ top: 0 })
  }, [selectedMethodId, requestState.version])

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
          error: error instanceof Error ? error : new Error('AI 洞察生成失败。'),
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
            error: new Error(chunk.error ?? 'AI 洞察生成失败。'),
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
              error: error instanceof Error ? error : new Error('AI 洞察生成失败。'),
              content: chunk.fullText ?? current.content,
            }
          })
        })
    })
  }, [streamOutputEnabled])

  function handleSelectMethod(methodId: AiInsightMethodId) {
    setSelectedMethodId(methodId)
    setRequestState({ version: 0, forceRefresh: false })
  }

  function handleBackToLibrary() {
    setSelectedMethodId(null)
    setRequestState({ version: 0, forceRefresh: false })
  }

  function handleRegenerate() {
    setRequestState((current) => ({ version: current.version + 1, forceRefresh: true }))
  }

  async function handleSaveSnapshot() {
    if (!result) {
      return
    }

    try {
      await saveSnapshotMutation.mutateAsync({
        methodId: result.methodId,
        date: result.date,
        rangeStart: result.rangeStart,
        rangeEnd: result.rangeEnd,
        title: result.title,
        content: result.content,
        blockIds: result.blockIds,
      })
      toast('success', '已保存为文档快照。')
    } catch (error) {
      toast('error', error instanceof Error ? error.message : '保存快照失败。')
    }
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden text-stone-900">
      <div className="border-b border-stone-200 px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              <span>AI 洞察</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.14em] ${providerMode === 'live' ? 'border-emerald-200 text-emerald-700' : 'border-stone-200 text-stone-500'}`}>
                {providerMode === 'live' ? 'Live AI' : 'Mock AI'}
              </span>
            </div>
            <h3 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-stone-900">
              {selectedMethodId ? (getAiInsightMethodDefinition(selectedMethodId)?.label ?? 'AI 洞察') : '选择一种分析方法'}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span>锚点日期：{formatDateKeyLabel(initialDateKey, { weekday: true })}</span>
              <span className="text-stone-400">观察窗口：{result ? formatRangeLabel(result.rangeStart, result.rangeEnd) : formatRangeLabel(fallbackRangeStart, initialDateKey)}</span>
              {result?.generatedAt ? <span className="text-stone-400">生成于 {formatTimeLabel(result.generatedAt)}</span> : null}
            </div>
          </div>

          {selectedMethodId ? (
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton onClick={handleBackToLibrary} disabled={isGenerating || saveSnapshotMutation.isPending}>切换方法</ActionButton>
              <ActionButton onClick={handleRegenerate} disabled={isGenerating || saveSnapshotMutation.isPending}>
                {isGenerating ? '生成中…' : '重新生成'}
              </ActionButton>
              <ActionButton accent onClick={() => { void handleSaveSnapshot() }} disabled={!result || isGenerating || saveSnapshotMutation.isPending}>
                {saveSnapshotMutation.isPending ? '保存中…' : '保存为快照'}
              </ActionButton>
            </div>
          ) : null}
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {!selectedMethodId ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-x-12 gap-y-2 md:grid-cols-2">
              {methodsInColumns.map((column, columnIndex) => (
                <div key={columnIndex} className="divide-y divide-stone-200 border-t border-stone-200">
                  {column.map((method) => (
                    <InsightMethodButton key={method.id} methodId={method.id} onSelect={handleSelectMethod} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {selectedMethodId && ((!settingsResolved) || (isGenerating && !streamedContent)) ? <AiInsightSkeleton /> : null}

        {selectedMethodId && settingsResolved && activeError ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">生成失败</div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">这篇洞察暂时还没整理出来</div>
            <p className="mt-3 max-w-[680px] text-sm leading-7 text-stone-500">
              {activeError instanceof Error ? activeError.message : 'AI 洞察生成失败。你可以稍后重试。'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <ActionButton onClick={handleBackToLibrary}>切换方法</ActionButton>
              <ActionButton onClick={handleRegenerate}>重新生成</ActionButton>
            </div>
          </div>
        ) : null}

        {selectedMethodId && settingsResolved && !isGenerating && !activeError && result ? (
          <div className="mx-auto w-full max-w-[1080px] px-6 py-6">
            <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_240px] md:gap-10">
              <div className="min-w-0 border-t border-stone-200 pt-6">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
                  <span>{result.blockCount} 条块</span>
                  <span>{result.plannedEntryCount} 项安排</span>
                  <span>{result.doneEntryCount} 项完成</span>
                  {result.canceledEntryCount > 0 ? <span>{result.canceledEntryCount} 项取消</span> : null}
                </div>
                {result.topTags.length > 0 ? (
                  <div className="mt-2 text-sm leading-6 text-stone-400">{result.topTags.map((tag) => `#${tag}`).join(' · ')}</div>
                ) : null}
                <div className="mt-6 max-w-[760px]">
                  <MarkdownContent content={result.content} />
                </div>
              </div>

              <aside className="min-w-0 border-t border-stone-200 pt-6 text-sm text-stone-600">
                <div className="space-y-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">范围</div>
                    <div className="mt-1 leading-6">{formatRangeLabel(result.rangeStart, result.rangeEnd)}</div>
                  </div>

                  <div className="border-t border-stone-200 pt-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">数据来源</div>
                    <div className="mt-1 leading-6">引用 {result.sourceBlocks.length} 条块，关联 {result.calendarEntryIds.length} 项安排</div>
                  </div>

                  <details open={result.sourceBlocks.length > 0} className="border-t border-stone-200 pt-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-stone-800 marker:hidden">
                      查看引用内容
                    </summary>
                    <div className="mt-3 divide-y divide-stone-200">
                      {result.sourceBlocks.length > 0 ? result.sourceBlocks.map((block) => (
                        <div key={block.id} className="py-3 first:pt-0">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">{block.date}</div>
                          <div className="mt-1.5 text-sm leading-6 text-stone-800">{block.preview}</div>
                          {block.tags.length > 0 ? (
                            <div className="mt-1.5 text-[12px] leading-5 text-stone-400">{block.tags.slice(0, 4).map((tag) => `#${tag}`).join(' · ')}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="py-1 text-sm leading-6 text-stone-500">这个时间窗口还没有可引用的块内容。</div>
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">生成状态</div>
                    <div className="mt-1 leading-6">正在整理近两周块内容与安排，正文会持续追加。</div>
                  </div>
                  <div className="border-t border-stone-200 pt-4 text-xs leading-6 text-stone-400">
                    已开启流式输出，当前方法会边分析边显示。
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
