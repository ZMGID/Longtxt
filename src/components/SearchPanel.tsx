import type { AIExecutionMode, SearchResult } from '../../shared/types'
import { MarkdownContent } from './MarkdownContent'
import { SearchResultCard } from './SearchResultCard'

interface DocumentState {
  status: 'idle' | 'streaming' | 'done' | 'error'
  requestId: string | null
  topic: string
  content: string
  blockIds: string[]
  mode: AIExecutionMode
  error: string | null
}

interface SearchPanelProps {
  query: string
  results: SearchResult[]
  browseTag: string | null
  searchError: string | null
  searching: boolean
  generating: boolean
  document: DocumentState
  onQueryChange: (value: string) => void
  onSearch: () => void
  onGenerate: () => void
  onSaveSnapshot: () => void
  onClearBrowseTag: () => void
  onTagClick: (tagName: string) => void
  inputRef?: React.RefObject<HTMLTextAreaElement | null>
}

export function SearchPanel({
  query,
  results,
  browseTag,
  searchError,
  searching,
  generating,
  document,
  onQueryChange,
  onSearch,
  onGenerate,
  onSaveSnapshot,
  onClearBrowseTag,
  onTagClick,
  inputRef,
}: SearchPanelProps) {
  const canCopyDocument = document.content.trim().length > 0

  return (
    <div className="grid gap-4 2xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <div className="rounded-lg border border-stone-200 bg-[#faf8f5] p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-stone-400">搜索生成</p>
          <p className="mb-3 text-xs leading-5 text-stone-500">先把问题写清楚，再决定是只看相关块，还是继续生成一篇结构化文档。</p>

          {browseTag ? (
            <div className="mb-3 flex items-center gap-2">
              <span className="rounded border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-600">按标签浏览：{browseTag}</span>
              <button type="button" onClick={onClearBrowseTag} className="text-xs text-stone-400 transition hover:text-stone-600">清除</button>
            </div>
          ) : null}

          <textarea
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSearch() }
            }}
            placeholder="描述你想找的内容，或者要生成的文档主题。"
            className="w-full resize-none rounded border border-stone-200 bg-stone-50 px-3 py-2 text-sm leading-7 text-stone-900 outline-none transition focus:border-stone-400 focus:bg-[#faf8f5]"
            rows={4}
          />

          <div className="mt-3 flex gap-2">
            <button type="button" onClick={onSearch} disabled={searching || !query.trim()} className="flex-1 rounded border border-stone-200 bg-stone-50 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100 disabled:opacity-50">
              {searching ? '检索中…' : '检索'}
            </button>
            <button type="button" onClick={onGenerate} disabled={generating || !query.trim()} className="flex-1 rounded bg-stone-900 py-2 text-sm font-medium text-white transition hover:bg-stone-700 disabled:opacity-50">
              {generating ? '生成中…' : '生成文档'}
            </button>
          </div>
        </div>

        {searchError ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{searchError}</p>
        ) : null}

        {results.length > 0 ? (
          <div className="space-y-2">
            <p className="px-1 text-xs text-stone-400">{results.length} 条检索结果</p>
            {results.map((result) => (
              <SearchResultCard key={result.block.id} result={result} query={query} onTagClick={onTagClick} />
            ))}
          </div>
        ) : null}
      </aside>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-stone-400">生成文档</p>
            {document.topic ? <p className="mt-0.5 text-xs text-stone-500">主题：{document.topic}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            {document.status !== 'idle' ? (
              <span className="text-xs text-stone-400">
                {document.status === 'streaming' ? '正在流式生成' : document.status === 'done' ? '生成完成' : document.status === 'error' ? '生成失败' : ''}
              </span>
            ) : null}
            {canCopyDocument ? (
              <button type="button" onClick={() => navigator.clipboard.writeText(document.content)} className="rounded border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:bg-stone-50">复制全文</button>
            ) : null}
            {document.status === 'done' && document.blockIds.length > 0 ? (
              <button type="button" onClick={onSaveSnapshot} className="rounded bg-stone-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-stone-700">保存快照</button>
            ) : null}
          </div>
        </div>

        <div className="min-h-[600px] overflow-y-auto rounded-lg border border-stone-200 bg-[#faf8f5] px-5 py-5">
          {document.content ? (
            <MarkdownContent content={document.content} />
          ) : (
            <p className="text-sm leading-7 text-stone-400">点击"生成文档"后，这里会逐段出现编排结果。</p>
          )}
          {document.error ? <p className="mt-4 text-sm text-rose-600">{document.error}</p> : null}
        </div>
      </section>
    </div>
  )
}
