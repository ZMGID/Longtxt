import { useEffect, useMemo, useRef, useState } from 'react'

import type { DailyReviewResult } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useAppMeta } from '../hooks/useAppMeta'
import { useDailyReview, useDocGenerationSettings, useSaveDailyReviewSnapshot } from '../hooks/useReview'
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
      return '今天的内容还没有形成明显主题'
    }

    return result.topTags.map((tag) => `#${tag}`).join(' · ')
  }, [result])

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
          error: error instanceof Error ? error : new Error('每日回顾生成失败。'),
          result: null,
          mode: null,
        })
      })

    return () => {
      cancelled = true
    }
  }, [dateKey, requestState.forceRefresh, requestState.version, settingsResolved, streamOutputEnabled])

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
            error: new Error(chunk.error ?? '每日回顾生成失败。'),
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
              error: error instanceof Error ? error : new Error('每日回顾生成失败。'),
              content: chunk.fullText ?? current.content,
            }
          })
        })
    })
  }, [streamOutputEnabled])

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
              <span>每日回顾</span>
              <span className={`rounded-full border px-2 py-1 text-[10px] tracking-[0.14em] ${providerMode === 'live' ? 'border-emerald-200 text-emerald-700' : 'border-stone-200 text-stone-500'}`}>
                {providerMode === 'live' ? 'Live AI' : 'Mock AI'}
              </span>
            </div>
            <h3 className="mt-2 text-[26px] font-semibold tracking-[-0.03em] text-stone-900">
              {formatDateKeyLabel(dateKey, { weekday: true })}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-stone-500">
              <span>
                {result ? `${result.blockCount} 个块` : '整理块内容中'}
                {result ? ` · ${result.plannedEntryCount} 项安排 · ${result.doneEntryCount} 项完成` : ''}
              </span>
              {result ? <span className="text-stone-400">{topTagLabel}</span> : null}
              {result?.generatedAt ? <span className="text-stone-400">生成于 {formatTimeLabel(result.generatedAt)}</span> : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ActionButton onClick={() => switchDate(shiftDateKey(dateKey, -1))} disabled={isGenerating || saveSnapshotMutation.isPending}>
              前一天
            </ActionButton>
            <ActionButton onClick={() => switchDate(shiftDateKey(dateKey, 1))} disabled={isGenerating || saveSnapshotMutation.isPending}>
              后一天
            </ActionButton>
            <ActionButton onClick={regenerate} disabled={isGenerating || saveSnapshotMutation.isPending}>
              {isGenerating ? '生成中…' : '重新生成'}
            </ActionButton>
            <ActionButton accent onClick={() => { void handleSaveSnapshot() }} disabled={!result || isGenerating || saveSnapshotMutation.isPending}>
              {saveSnapshotMutation.isPending ? '保存中…' : '保存为快照'}
            </ActionButton>
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {((!settingsResolved) || (isGenerating && !streamedContent)) ? <DailyReviewSkeleton /> : null}

        {settingsResolved && activeError ? (
          <div className="mx-auto w-full max-w-[860px] px-6 py-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-400">生成失败</div>
            <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">这篇回顾暂时还没整理出来</div>
            <p className="mt-3 max-w-[640px] text-sm leading-7 text-stone-500">
              {activeError instanceof Error ? activeError.message : '每日回顾生成失败。你可以稍后重试。'}
            </p>
            <div className="mt-5">
              <ActionButton onClick={regenerate}>重新生成</ActionButton>
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">引用块</div>
                    <div className="mt-1 leading-6">
                      {result.sourceBlocks.length > 0 ? `共 ${result.sourceBlocks.length} 条` : '今天没有块内容'}
                    </div>
                  </div>

                  <details open={result.sourceBlocks.length > 0} className="border-t border-stone-200 pt-3">
                    <summary className="cursor-pointer list-none text-sm font-medium text-stone-800 marker:hidden">
                      查看引用内容
                    </summary>
                    <div className="mt-3 divide-y divide-stone-200">
                      {result.sourceBlocks.length > 0 ? result.sourceBlocks.map((block) => (
                        <div key={block.id} className="py-3 first:pt-0">
                          <div className="text-[11px] uppercase tracking-[0.12em] text-stone-400">
                            {new Intl.DateTimeFormat('zh-CN', {
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            }).format(new Date(block.createdAt))}
                          </div>
                          <div className="mt-1.5 text-sm leading-6 text-stone-800">{block.preview}</div>
                          {block.tags.length > 0 ? (
                            <div className="mt-1.5 text-[12px] leading-5 text-stone-400">{block.tags.slice(0, 4).map((tag) => `#${tag}`).join(' · ')}</div>
                          ) : null}
                        </div>
                      )) : (
                        <div className="py-1 text-sm leading-6 text-stone-500">这一天还没有可引用的块内容。</div>
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
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">生成状态</div>
                    <div className="mt-1 leading-6">正在整理当天块内容与日历安排…</div>
                  </div>
                  <div className="border-t border-stone-200 pt-3 text-xs leading-6 text-stone-400">
                    已开启流式输出，会边生成边显示正文。
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
