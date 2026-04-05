import {
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
  MAX_BLOCK_ENRICH_BATCH_BLOCKS,
  MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS,
  MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS,
  MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK,
  MAX_CALENDAR_UPCOMING_DAYS,
  MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS,
  MAX_DOC_GENERATION_REFERENCE_BLOCKS,
  MAX_DOC_GENERATION_RETRIEVAL_LIMIT,
  MAX_DOC_GENERATION_TEMPERATURE,
  MIN_BLOCK_ENRICH_BATCH_BLOCKS,
  MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS,
  MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS,
  MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK,
  MIN_CALENDAR_UPCOMING_DAYS,
  MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS,
  MIN_DOC_GENERATION_REFERENCE_BLOCKS,
  MIN_DOC_GENERATION_RETRIEVAL_LIMIT,
  MIN_DOC_GENERATION_TEMPERATURE,
} from '../../shared/config'
import type { AIConfig, ApiTestResult, AppMeta, BlockEnrichSettings, CalendarSettings, DocGenerationSettings, UISettings } from '../../shared/types'

interface SettingsPanelProps {
  config: AIConfig
  docGenerationSettings: DocGenerationSettings
  blockEnrichSettings: BlockEnrichSettings
  calendarSettings: CalendarSettings
  uiSettings: UISettings
  meta: AppMeta | null
  saving: boolean
  testing: boolean
  testResult: ApiTestResult | null
  onRetryFailedVectors?: () => Promise<void>
  onChange: (nextConfig: AIConfig) => void
  onDocGenerationSettingsChange: (nextSettings: DocGenerationSettings) => void
  onBlockEnrichSettingsChange: (nextSettings: BlockEnrichSettings) => void
  onCalendarSettingsChange: (nextSettings: CalendarSettings) => void
  onUISettingsChange: (nextSettings: UISettings) => void
  onSave: () => Promise<void>
  onTest: () => Promise<void>
  onOpenDataDirectory: () => Promise<void>
  onOpenSettingsDirectory: () => Promise<void>
}

function SettingField({
  label,
  value,
  placeholder,
  onChange,
  secret = false,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  secret?: boolean
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-stone-400">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-200"
      />
    </label>
  )
}

function ConfigSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3 rounded-lg border border-stone-200 bg-white/70 p-4">
      <div>
        <h3 className="text-sm font-semibold text-stone-900">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-stone-500">{description}</p>
      </div>
      {children}
    </section>
  )
}

function SettingCheckbox({
  label,
  description,
  checked,
  onChange,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-stone-200 bg-stone-50/80 px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-2 focus:ring-stone-200"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-stone-900">{label}</span>
        <span className="mt-0.5 block text-xs leading-5 text-stone-500">{description}</span>
      </span>
    </label>
  )
}

function SettingNumberField({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium uppercase tracking-wider text-stone-400">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          onChange(Number.isFinite(nextValue) ? nextValue : value)
        }}
        className="w-full rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-200"
      />
      <p className="text-xs leading-5 text-stone-500">{description}</p>
    </label>
  )
}

export function SettingsPanel({
  config,
  docGenerationSettings,
  blockEnrichSettings,
  calendarSettings,
  uiSettings,
  meta,
  saving,
  testing,
  testResult,
  onRetryFailedVectors,
  onChange,
  onDocGenerationSettingsChange,
  onBlockEnrichSettingsChange,
  onCalendarSettingsChange,
  onUISettingsChange,
  onSave,
  onTest,
  onOpenDataDirectory,
  onOpenSettingsDirectory,
}: SettingsPanelProps) {
  return (
    <section className="grid gap-4 overflow-x-hidden overflow-y-auto pr-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(18rem,22rem)] 2xl:min-h-0 2xl:flex-1 2xl:overflow-hidden 2xl:pr-0">
      <div className="space-y-4 2xl:min-h-0 2xl:overflow-y-auto">
        <ConfigSection title="LLM" description="支持 OpenAI 兼容接口。保存配置且通过连接测试后，应用才会切换到 live AI。">
          <SettingField
            label="Endpoint"
            value={config.llm.endpoint}
            placeholder="https://api.openai.com/v1"
            onChange={(value) => onChange({ ...config, llm: { ...config.llm, endpoint: value } })}
          />
          <SettingField
            label="API Key"
            value={config.llm.apiKey}
            placeholder="sk-..."
            secret
            onChange={(value) => onChange({ ...config, llm: { ...config.llm, apiKey: value } })}
          />
          <SettingField
            label="Model"
            value={config.llm.model}
            placeholder="gpt-4o-mini"
            onChange={(value) => onChange({ ...config, llm: { ...config.llm, model: value } })}
          />
        </ConfigSection>

        <ConfigSection title="Embedding" description="向量化配置影响检索与连接图，模型维度在运行状态中体现。">
          <SettingField
            label="Endpoint"
            value={config.embedding.endpoint}
            placeholder="https://api.openai.com/v1"
            onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, endpoint: value } })}
          />
          <SettingField
            label="API Key"
            value={config.embedding.apiKey}
            placeholder="sk-..."
            secret
            onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, apiKey: value } })}
          />
          <SettingField
            label="Model"
            value={config.embedding.model}
            placeholder="text-embedding-3-small"
            onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, model: value } })}
          />
        </ConfigSection>

        <ConfigSection title="文档生成" description="文档生成会先筛选相关块，再在达标结果中按上限引用。建议范围 6 到 12。">
          <SettingNumberField
            label="最大引用块数"
            value={docGenerationSettings.maxReferenceBlocks}
            min={MIN_DOC_GENERATION_REFERENCE_BLOCKS}
            max={MAX_DOC_GENERATION_REFERENCE_BLOCKS}
            onChange={(value) => {
              onDocGenerationSettingsChange({
                ...docGenerationSettings,
                maxReferenceBlocks: value,
              })
            }}
            description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}，保存时会自动限制在 ${MIN_DOC_GENERATION_REFERENCE_BLOCKS} 到 ${MAX_DOC_GENERATION_REFERENCE_BLOCKS} 之间。`}
          />
          <SettingNumberField
            label="召回候选块数"
            value={docGenerationSettings.retrievalLimit}
            min={MIN_DOC_GENERATION_RETRIEVAL_LIMIT}
            max={MAX_DOC_GENERATION_RETRIEVAL_LIMIT}
            onChange={(value) => {
              onDocGenerationSettingsChange({
                ...docGenerationSettings,
                retrievalLimit: value,
              })
            }}
            description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}。生成前先从搜索结果里取这么多候选块，再筛选引用。`}
          />
          <SettingNumberField
            label="生成温度"
            value={docGenerationSettings.temperature}
            min={MIN_DOC_GENERATION_TEMPERATURE}
            max={MAX_DOC_GENERATION_TEMPERATURE}
            step={0.05}
            onChange={(value) => {
              onDocGenerationSettingsChange({
                ...docGenerationSettings,
                temperature: value,
              })
            }}
            description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}。越低越稳，越高越发散。建议 0 到 0.4。`}
          />
          <SettingNumberField
            label="输出 Token 上限"
            value={docGenerationSettings.maxOutputTokens}
            min={MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS}
            max={MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS}
            onChange={(value) => {
              onDocGenerationSettingsChange({
                ...docGenerationSettings,
                maxOutputTokens: value,
              })
            }}
            description={`默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}。限制单次文档生成的输出长度与成本。`}
          />
        </ConfigSection>

        <ConfigSection title="块 enrich" description="控制块创建后的标签和摘要请求方式。默认逐条发送；开启队列后会在短时间内合并多条 live 请求，并按模型上下文与预留 token 自动限流。">
          <SettingCheckbox
            label="启用 live enrich 队列"
            description="仅对已启用的 live AI 生效。创建多个块时会先短暂聚合，再合并请求，以减少调用次数和费用。"
            checked={blockEnrichSettings.queueEnabled}
            onChange={(checked) => {
              onBlockEnrichSettingsChange({
                ...blockEnrichSettings,
                queueEnabled: checked,
              })
            }}
          />
          <SettingNumberField
            label="单次最多合并块数"
            value={blockEnrichSettings.maxBatchBlocks}
            min={MIN_BLOCK_ENRICH_BATCH_BLOCKS}
            max={MAX_BLOCK_ENRICH_BATCH_BLOCKS}
            onChange={(value) => {
              onBlockEnrichSettingsChange({
                ...blockEnrichSettings,
                maxBatchBlocks: value,
              })
            }}
            description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}。保存时会自动限制在 ${MIN_BLOCK_ENRICH_BATCH_BLOCKS} 到 ${MAX_BLOCK_ENRICH_BATCH_BLOCKS} 之间。`}
          />
          <SettingNumberField
            label="聚合等待时间（ms）"
            value={blockEnrichSettings.queueDebounceMs}
            min={MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
            max={MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
            onChange={(value) => {
              onBlockEnrichSettingsChange({
                ...blockEnrichSettings,
                queueDebounceMs: value,
              })
            }}
            description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs}ms。达到块数上限前，会最多等待这段时间再一起发送。`}
          />
          <SettingNumberField
            label="预留输出 Token"
            value={blockEnrichSettings.responseReserveTokens}
            min={MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
            max={MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
            onChange={(value) => {
              onBlockEnrichSettingsChange({
                ...blockEnrichSettings,
                responseReserveTokens: value,
              })
            }}
            description={`默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}。批量请求会先按模型上下文估算，再预留这部分空间给返回结果。`}
          />
        </ConfigSection>

        <ConfigSection title="日历与计划" description="控制日历页的 AI 日期建议和未来安排窗口。AI 建议只会生成待确认项，不会直接替你落正式安排。">
          <SettingCheckbox
            label="启用 AI 日期建议"
            description="块 enrich 完成后，若内容中存在明确未来日期安排，会在日历里生成待确认建议。"
            checked={calendarSettings.aiSuggestionsEnabled}
            onChange={(checked) => {
              onCalendarSettingsChange({
                ...calendarSettings,
                aiSuggestionsEnabled: checked,
              })
            }}
          />
          <SettingNumberField
            label="每块最多建议条数"
            value={calendarSettings.maxSuggestionsPerBlock}
            min={MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
            max={MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
            onChange={(value) => {
              onCalendarSettingsChange({
                ...calendarSettings,
                maxSuggestionsPerBlock: value,
              })
            }}
            description={`默认 ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}。建议限制在 ${MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK} 到 ${MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK} 条之间。`}
          />
          <SettingNumberField
            label="未来安排窗口（天）"
            value={calendarSettings.upcomingDays}
            min={MIN_CALENDAR_UPCOMING_DAYS}
            max={MAX_CALENDAR_UPCOMING_DAYS}
            onChange={(value) => {
              onCalendarSettingsChange({
                ...calendarSettings,
                upcomingDays: value,
              })
            }}
            description={`默认 ${DEFAULT_CALENDAR_SETTINGS.upcomingDays}。控制日历页右侧“未来安排”列表的日期范围。`}
          />
        </ConfigSection>

        <ConfigSection title="界面" description="控制时间轴页的辅助信息显示方式。">
          <SettingCheckbox
            label="显示左侧时间线"
            description="在时间轴页左侧显示一条极简日期时间线，并随滚动高亮当前所在日期。"
            checked={uiSettings.showMiniTimeline}
            onChange={(checked) => {
              onUISettingsChange({
                ...uiSettings,
                showMiniTimeline: checked,
              })
            }}
          />
        </ConfigSection>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { void onSave() }}
            disabled={saving}
            className="rounded bg-stone-900 px-4 py-2 text-sm font-medium text-white transition duration-150 hover:bg-stone-700 active:scale-[0.97] disabled:opacity-50"
          >
            {saving ? <><span className="spinner" />保存中…</> : '保存设置'}
          </button>
          <button
            type="button"
            onClick={() => { void onTest() }}
            disabled={testing}
            className="rounded border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700 transition duration-150 hover:bg-stone-50 active:scale-[0.97] disabled:opacity-50"
          >
            {testing ? <><span className="spinner-dark" />检测中…</> : '测试连接'}
          </button>
          <button
            type="button"
            onClick={() => { void onOpenDataDirectory() }}
            className="rounded border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700 transition duration-150 hover:bg-stone-50 active:scale-[0.97]"
          >
            打开数据目录
          </button>
          <button
            type="button"
            onClick={() => { void onOpenSettingsDirectory() }}
            className="rounded border border-stone-200 bg-white/70 px-4 py-2 text-sm font-medium text-stone-700 transition duration-150 hover:bg-stone-50 active:scale-[0.97]"
          >
            打开设置文件目录
          </button>
        </div>

        {testResult ? (
          <p className={`text-sm ${testResult.success ? 'text-emerald-600' : 'text-amber-600'}`}>
            {testResult.success
              ? `连接成功：Models ${testResult.modelsOk ? 'OK' : '失败'} / Embedding ${testResult.embeddingOk ? 'OK' : '失败'} / LLM ${testResult.llmOk ? 'OK' : '失败'} / Stream ${testResult.llmStreamingOk ? 'OK' : '失败'}`
              : testResult.error}
          </p>
        ) : null}
      </div>

      <aside className="space-y-3 2xl:min-h-0 2xl:overflow-y-auto">
        <p className="text-xs font-medium uppercase tracking-wider text-stone-400">运行状态</p>

        {([
          { label: '数据目录', value: meta?.dataDirectory ?? '加载中…' },
          {
            label: 'API 状态',
            value: !meta?.aiConfigured
              ? '未配置，当前使用 mock'
              : meta.activeAiMode === 'live'
                ? '已启用 live AI'
                : '已配置，但尚未通过测试，当前使用 mock',
          },
          { label: 'sqlite-vec', value: meta?.vectorReady ? '已加载' : '未加载，自动回退到普通检索' },
          {
            label: '向量 Schema',
            value: meta?.vectorReady ? `${meta.vectorDimension ?? '?'} 维` : '尚未初始化',
          },
          { label: 'Base URL', value: meta?.resolvedBaseUrl ?? '尚未解析' },
        ] as const).map((item) => (
          <div key={item.label} className="rounded-lg border border-stone-200 bg-white/70 px-4 py-3">
            <div className="text-xs text-stone-400">{item.label}</div>
            <div className="mt-0.5 break-all text-sm font-medium text-stone-900">{item.value}</div>
          </div>
        ))}

        {meta && meta.failedVectorCount > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-xs text-amber-400">失败向量</div>
            <div className="mt-0.5 text-sm font-medium text-amber-900">
              {meta.failedVectorCount} 个块的向量补齐失败
            </div>
            <button
              type="button"
              onClick={() => { void onRetryFailedVectors?.() }}
              disabled={!onRetryFailedVectors}
              className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition duration-150 hover:bg-amber-500 active:scale-[0.97] disabled:opacity-50"
            >
              重试失败向量
            </button>
          </div>
        )}

        {meta?.lastAiTestResult ? (
          <div className="rounded-lg border border-stone-200 bg-white/70 px-4 py-3">
            <div className="text-xs text-stone-400">最近测试</div>
            <div className="mt-0.5 text-sm font-medium text-stone-900">
              {meta.lastAiTestResult.success ? '测试通过' : '测试失败'} · {new Date(meta.lastAiTestResult.checkedAt).toLocaleString('zh-CN')}
            </div>
            <div className="mt-1 text-xs text-stone-500">
              Embedding: {meta.lastAiTestResult.embeddingModel} / {meta.lastAiTestResult.embeddingDimension ?? '未知'} 维
            </div>
            <div className="text-xs text-stone-500">LLM: {meta.lastAiTestResult.chatModel}</div>
          </div>
        ) : null}

        {meta?.tokenUsage ? (
          <div className="rounded-lg border border-stone-200 bg-white/70 px-4 py-3">
            <div className="text-xs text-stone-400">Token 用量（本次启动）</div>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <span className="text-stone-500">请求</span>
              <span className="font-medium text-stone-900">{meta.tokenUsage.requestCount}</span>
              <span className="text-stone-500">Prompt</span>
              <span className="font-medium text-stone-900">{meta.tokenUsage.promptTokens.toLocaleString()}</span>
              <span className="text-stone-500">Completion</span>
              <span className="font-medium text-stone-900">{meta.tokenUsage.completionTokens.toLocaleString()}</span>
              <span className="text-stone-500">合计</span>
              <span className="font-semibold text-stone-900">{meta.tokenUsage.totalTokens.toLocaleString()}</span>
            </div>
          </div>
        ) : null}

        {meta?.lastAiError ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            <div className="text-xs text-rose-400">最近运行错误</div>
            <div className="mt-0.5 text-sm font-medium">{meta.lastAiError}</div>
          </div>
        ) : null}
      </aside>
    </section>
  )
}
