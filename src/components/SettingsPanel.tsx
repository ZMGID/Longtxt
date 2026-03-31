import { DEFAULT_DOC_GENERATION_SETTINGS, MAX_DOC_GENERATION_REFERENCE_BLOCKS, MIN_DOC_GENERATION_REFERENCE_BLOCKS } from '../../shared/config'
import type { AIConfig, ApiTestResult, AppMeta, DocGenerationSettings } from '../../shared/types'

interface SettingsPanelProps {
  config: AIConfig
  docGenerationSettings: DocGenerationSettings
  meta: AppMeta | null
  saving: boolean
  testing: boolean
  testResult: ApiTestResult | null
  onChange: (nextConfig: AIConfig) => void
  onDocGenerationSettingsChange: (nextSettings: DocGenerationSettings) => void
  onSave: () => Promise<void>
  onTest: () => Promise<void>
  onOpenDataDirectory: () => Promise<void>
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

export function SettingsPanel({
  config,
  docGenerationSettings,
  meta,
  saving,
  testing,
  testResult,
  onChange,
  onDocGenerationSettingsChange,
  onSave,
  onTest,
  onOpenDataDirectory,
}: SettingsPanelProps) {
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_340px]">
      <div className="space-y-4">
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
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-stone-400">最大引用块数</span>
            <input
              type="number"
              min={MIN_DOC_GENERATION_REFERENCE_BLOCKS}
              max={MAX_DOC_GENERATION_REFERENCE_BLOCKS}
              step={1}
              value={docGenerationSettings.maxReferenceBlocks}
              onChange={(event) => {
                const nextValue = Number(event.target.value)
                onDocGenerationSettingsChange({
                  maxReferenceBlocks: Number.isFinite(nextValue)
                    ? nextValue
                    : DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks,
                })
              }}
              className="w-full rounded border border-stone-200 bg-white/70 px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-stone-400 focus:ring-1 focus:ring-stone-200"
            />
            <p className="text-xs leading-5 text-stone-500">
              默认 10，保存时会自动限制在 {MIN_DOC_GENERATION_REFERENCE_BLOCKS} 到 {MAX_DOC_GENERATION_REFERENCE_BLOCKS} 之间。
            </p>
          </label>
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
        </div>

        {testResult ? (
          <p className={`text-sm ${testResult.success ? 'text-emerald-600' : 'text-amber-600'}`}>
            {testResult.success
              ? `连接成功：Models ${testResult.modelsOk ? 'OK' : '失败'} / Embedding ${testResult.embeddingOk ? 'OK' : '失败'} / LLM ${testResult.llmOk ? 'OK' : '失败'} / Stream ${testResult.llmStreamingOk ? 'OK' : '失败'}`
              : testResult.error}
          </p>
        ) : null}
      </div>

      <aside className="space-y-3">
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
