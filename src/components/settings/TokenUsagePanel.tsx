import { normalizeTokenUsage, formatCompactStat } from './utils'
import type { TokenUsagePanelProps } from './types'

export function TokenUsagePanel({ title, hint, usage, language }: TokenUsagePanelProps) {
  const normalizedUsage = normalizeTokenUsage(usage)
  const hasUsage = normalizedUsage.requestCount > 0

  return (
    <section className="overflow-hidden border border-stone-200">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 px-3 py-2.5">
        <div>
          <div className="text-[13px] font-semibold text-stone-900">{title}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-stone-500">{hint}</div>
        </div>
        <div className="text-[11px] font-medium text-stone-400">{hasUsage ? (language === 'en' ? `${formatCompactStat(normalizedUsage.requestCount, language)} requests` : `${formatCompactStat(normalizedUsage.requestCount, language)} 次请求`) : (language === 'en' ? 'No calls yet' : '暂无调用')}</div>
      </div>
      <div className="grid grid-cols-2 gap-px bg-stone-200">
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">{language === 'en' ? 'REQUESTS' : '请求'}</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.requestCount, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Prompt</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.promptTokens, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Completion</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.completionTokens, language)}</div>
        </div>
        <div className="bg-white px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400">Total</div>
          <div className="mt-1 text-[18px] font-semibold tracking-[-0.02em] text-stone-900">{formatCompactStat(normalizedUsage.totalTokens, language)}</div>
        </div>
      </div>
    </section>
  )
}
