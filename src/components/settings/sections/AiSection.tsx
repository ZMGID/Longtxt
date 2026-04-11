import type { AIConfig } from '../../../../shared/types'
import type { MessageKey } from '../../../i18n/messages'
import type { AppLanguage } from '../../../i18n/locale'
import { SettingsGroup, SettingsRow, SettingField, SettingSwitch } from '../common'
import { localize } from '../utils'

interface AiSectionProps {
  config: AIConfig
  onChange: (config: AIConfig) => void
  language: AppLanguage
  t: (key: MessageKey) => string
  multimodalStatusLabel: string
}

export function AiSection({
  config,
  onChange,
  language,
  t,
  multimodalStatusLabel,
}: AiSectionProps) {
  return (
    <div className="space-y-10">
      <SettingsGroup title="LLM">
        <SettingsRow
          title="Endpoint"
          description={localize(language, '用于摘要、文档生成与 AI 写作流程。', 'Used for summaries, document generation, and AI writing flows.')}
          control={
            <SettingField
              label="Endpoint"
              value={config.llm.endpoint}
              placeholder="https://api.openai.com/v1"
              onChange={(value) => onChange({ ...config, llm: { ...config.llm, endpoint: value } })}
            />
          }
        />
        <SettingsRow
          title="API Key"
          description={localize(language, '保存后会写入本地设置文件。', 'Saved into the local settings file after you click save.')}
          control={
            <SettingField
              label="API Key"
              value={config.llm.apiKey}
              placeholder="sk-..."
              secret
              onChange={(value) => onChange({ ...config, llm: { ...config.llm, apiKey: value } })}
            />
          }
        />
        <SettingsRow
          title="Model"
          description={localize(language, '例如 gpt-4o-mini。', 'For example, gpt-4o-mini.')}
          control={
            <SettingField
              label="Model"
              value={config.llm.model}
              placeholder="gpt-4o-mini"
              onChange={(value) => onChange({ ...config, llm: { ...config.llm, model: value } })}
            />
          }
        />
        <SettingsRow
          title={t('settings.ai.multimodalLabel')}
          description={`${t('settings.ai.multimodalHint')} · ${multimodalStatusLabel}`}
          control={
            <SettingSwitch
              label={t('settings.ai.multimodalLabel')}
              checked={config.multimodalImageAnalysisEnabled}
              onChange={(checked) => onChange({ ...config, multimodalImageAnalysisEnabled: checked })}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Embedding">
        <SettingsRow
          title="Endpoint"
          description={localize(language, '用于向量检索、连接图和语义召回。', 'Used for vector search, graph relationships, and semantic recall.')}
          control={
            <SettingField
              label="Endpoint"
              value={config.embedding.endpoint}
              placeholder="https://api.openai.com/v1"
              onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, endpoint: value } })}
            />
          }
        />
        <SettingsRow
          title="API Key"
          description={localize(language, '如需单独的 embedding 提供方，可与 LLM 使用不同密钥。', 'If you use a separate embedding provider, it can use a different key from the LLM.')}
          control={
            <SettingField
              label="API Key"
              value={config.embedding.apiKey}
              placeholder="sk-..."
              secret
              onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, apiKey: value } })}
            />
          }
        />
        <SettingsRow
          title="Model"
          description={localize(language, '例如 text-embedding-3-small。', 'For example, text-embedding-3-small.')}
          control={
            <SettingField
              label="Model"
              value={config.embedding.model}
              placeholder="text-embedding-3-small"
              onChange={(value) => onChange({ ...config, embedding: { ...config.embedding, model: value } })}
            />
          }
        />
      </SettingsGroup>
    </div>
  )
}
