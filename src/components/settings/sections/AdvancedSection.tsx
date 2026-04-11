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
} from '../../../../shared/config'
import type { AppMeta, BlockEnrichSettings, CalendarSettings, DocGenerationSettings } from '../../../../shared/types'
import type { AppLanguage } from '../../../i18n/locale'
import { ActionButton } from '../../ui/ActionButton'
import { SettingsGroup, SettingsRow, SettingNumberField, SettingSwitch } from '../common'
import { localize, rebuildAllVectorsDisabledReason } from '../utils'

interface AdvancedSectionProps {
  docGenerationSettings: DocGenerationSettings
  blockEnrichSettings: BlockEnrichSettings
  calendarSettings: CalendarSettings
  meta: AppMeta | null
  onDocGenerationSettingsChange: (settings: DocGenerationSettings) => void
  onBlockEnrichSettingsChange: (settings: BlockEnrichSettings) => void
  onCalendarSettingsChange: (settings: CalendarSettings) => void
  onRetryFailedVectors?: () => Promise<void>
  onCleanupOrphanAttachments?: () => Promise<void>
  onRebuildAttachmentIndex?: () => Promise<void>
  onRebuildAllVectors?: () => Promise<void>
  language: AppLanguage
}

export function AdvancedSection({
  docGenerationSettings,
  blockEnrichSettings,
  calendarSettings,
  meta,
  onDocGenerationSettingsChange,
  onBlockEnrichSettingsChange,
  onCalendarSettingsChange,
  onRetryFailedVectors,
  onCleanupOrphanAttachments,
  onRebuildAttachmentIndex,
  onRebuildAllVectors,
  language,
}: AdvancedSectionProps) {
  const isEn = language === 'en'

  return (
    <div className="space-y-10" data-testid="settings-advanced-panel">
      <SettingsGroup title={localize(language, '文档生成', 'Document generation')}>
        <SettingsRow
          title={localize(language, '最大引用块数', 'Max reference blocks')}
          description={isEn
            ? `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}. Automatically clamped to ${MIN_DOC_GENERATION_REFERENCE_BLOCKS}–${MAX_DOC_GENERATION_REFERENCE_BLOCKS} when saved.`
            : `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}，保存时会自动限制在 ${MIN_DOC_GENERATION_REFERENCE_BLOCKS} 到 ${MAX_DOC_GENERATION_REFERENCE_BLOCKS} 之间。`}
          control={
            <SettingNumberField
              label={localize(language, '最大引用块数', 'Max reference blocks')}
              value={docGenerationSettings.maxReferenceBlocks}
              min={MIN_DOC_GENERATION_REFERENCE_BLOCKS}
              max={MAX_DOC_GENERATION_REFERENCE_BLOCKS}
              onChange={(value) => {
                onDocGenerationSettingsChange({
                  ...docGenerationSettings,
                  maxReferenceBlocks: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks}`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '召回候选块数', 'Candidate recall limit')}
          description={localize(language, '生成前先从搜索结果里取这么多候选块，再筛选引用。', 'Pull this many candidate blocks from search before filtering references.')}
          control={
            <SettingNumberField
              label={localize(language, '召回候选块数', 'Candidate recall limit')}
              value={docGenerationSettings.retrievalLimit}
              min={MIN_DOC_GENERATION_RETRIEVAL_LIMIT}
              max={MAX_DOC_GENERATION_RETRIEVAL_LIMIT}
              onChange={(value) => {
                onDocGenerationSettingsChange({
                  ...docGenerationSettings,
                  retrievalLimit: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit}`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '生成温度', 'Generation temperature')}
          description={localize(language, '越低越稳，越高越发散。建议 0 到 0.4。', 'Lower is more stable; higher is more divergent. Recommended: 0 to 0.4.')}
          control={
            <SettingNumberField
              label={localize(language, '生成温度', 'Generation temperature')}
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
              description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.temperature}`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '模型流式输出', 'Streaming output')}
          description={localize(language, '开启后，每日回顾和 AI 洞察会边生成边显示；关闭后等待完整结果再展示。', 'When enabled, Daily Review and AI Insights render while generating. When disabled, they wait for the full result.')}
          control={
            <SettingSwitch
              label={localize(language, '模型流式输出', 'Streaming output')}
              checked={docGenerationSettings.streamOutput}
              onChange={(checked) => {
                onDocGenerationSettingsChange({
                  ...docGenerationSettings,
                  streamOutput: checked,
                })
              }}
            />
          }
        />
        <SettingsRow
          title={localize(language, '输出 Token 上限', 'Max output tokens')}
          description={localize(language, '限制单次文档生成的输出长度与成本。', 'Cap output length and cost for a single generation run.')}
          control={
            <SettingNumberField
              label={localize(language, '输出 Token 上限', 'Max output tokens')}
              value={docGenerationSettings.maxOutputTokens}
              min={MIN_DOC_GENERATION_MAX_OUTPUT_TOKENS}
              max={MAX_DOC_GENERATION_MAX_OUTPUT_TOKENS}
              onChange={(value) => {
                onDocGenerationSettingsChange({
                  ...docGenerationSettings,
                  maxOutputTokens: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}`, `Default ${DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens}`)}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={localize(language, '块 enrich', 'Block enrich')}>
        <SettingsRow
          title={localize(language, '启用 live enrich 队列', 'Enable live enrich queue')}
          description={localize(language, '仅对已启用的 live AI 生效。创建多个块时会先短暂聚合，再合并请求，以减少调用次数和费用。', 'Only applies when live AI is enabled. Multiple new blocks are briefly batched together to reduce request count and cost.')}
          control={
            <SettingSwitch
              label={localize(language, '启用 live enrich 队列', 'Enable live enrich queue')}
              checked={blockEnrichSettings.queueEnabled}
              onChange={(checked) => {
                onBlockEnrichSettingsChange({
                  ...blockEnrichSettings,
                  queueEnabled: checked,
                })
              }}
            />
          }
        />
        <SettingsRow
          title={localize(language, '单次最多合并块数', 'Max blocks per batch')}
          description={isEn
            ? `Automatically clamped to ${MIN_BLOCK_ENRICH_BATCH_BLOCKS}–${MAX_BLOCK_ENRICH_BATCH_BLOCKS} when saved.`
            : `保存时会自动限制在 ${MIN_BLOCK_ENRICH_BATCH_BLOCKS} 到 ${MAX_BLOCK_ENRICH_BATCH_BLOCKS} 之间。`}
          control={
            <SettingNumberField
              label={localize(language, '单次最多合并块数', 'Max blocks per batch')}
              value={blockEnrichSettings.maxBatchBlocks}
              min={MIN_BLOCK_ENRICH_BATCH_BLOCKS}
              max={MAX_BLOCK_ENRICH_BATCH_BLOCKS}
              onChange={(value) => {
                onBlockEnrichSettingsChange({
                  ...blockEnrichSettings,
                  maxBatchBlocks: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks}`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '聚合等待时间', 'Batch wait time')}
          description={localize(language, '达到块数上限前，会最多等待这段时间再一起发送。', 'Before reaching the block cap, requests wait up to this long before being sent together.')}
          control={
            <SettingNumberField
              label={localize(language, '聚合等待时间', 'Batch wait time')}
              value={blockEnrichSettings.queueDebounceMs}
              min={MIN_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
              max={MAX_BLOCK_ENRICH_QUEUE_DEBOUNCE_MS}
              onChange={(value) => {
                onBlockEnrichSettingsChange({
                  ...blockEnrichSettings,
                  queueDebounceMs: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs} ms`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs} ms`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '预留输出 Token', 'Reserved output tokens')}
          description={localize(language, '批量请求会先按模型上下文估算，再预留这部分空间给返回结果。', 'Batch requests estimate model context first, then reserve this amount of space for the response.')}
          control={
            <SettingNumberField
              label={localize(language, '预留输出 Token', 'Reserved output tokens')}
              value={blockEnrichSettings.responseReserveTokens}
              min={MIN_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
              max={MAX_BLOCK_ENRICH_RESPONSE_RESERVE_TOKENS}
              onChange={(value) => {
                onBlockEnrichSettingsChange({
                  ...blockEnrichSettings,
                  responseReserveTokens: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}`, `Default ${DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens}`)}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={localize(language, '日历窗口', 'Calendar window')}>
        <SettingsRow
          title={localize(language, '每块最多建议条数', 'Max suggestions per block')}
          description={localize(language, '限制 AI 从单个块里抽取未来安排的数量。', 'Limit how many future plans AI can extract from a single block.')}
          control={
            <SettingNumberField
              label={localize(language, '每块最多建议条数', 'Max suggestions per block')}
              value={calendarSettings.maxSuggestionsPerBlock}
              min={MIN_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
              max={MAX_CALENDAR_MAX_SUGGESTIONS_PER_BLOCK}
              onChange={(value) => {
                onCalendarSettingsChange({
                  ...calendarSettings,
                  maxSuggestionsPerBlock: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}`, `Default ${DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock}`)}
            />
          }
        />
        <SettingsRow
          title={localize(language, '未来安排窗口', 'Upcoming window')}
          description={localize(language, '控制日历页"未来安排"列表的日期范围。', 'Control the date range shown in Calendar → Upcoming.')}
          control={
            <SettingNumberField
              label={localize(language, '未来安排窗口', 'Upcoming window')}
              value={calendarSettings.upcomingDays}
              min={MIN_CALENDAR_UPCOMING_DAYS}
              max={MAX_CALENDAR_UPCOMING_DAYS}
              onChange={(value) => {
                onCalendarSettingsChange({
                  ...calendarSettings,
                  upcomingDays: value,
                })
              }}
              description={localize(language, `默认 ${DEFAULT_CALENDAR_SETTINGS.upcomingDays} 天`, `Default ${DEFAULT_CALENDAR_SETTINGS.upcomingDays} days`)}
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup title={localize(language, '维护工具', 'Maintenance tools')}>
        <SettingsRow
          title={localize(language, '清理孤儿附件', 'Clean orphan attachments')}
          description={localize(language, '删除已经不再被任何块引用的附件文件和记录，适合导入覆盖或大量删除内容之后做一次整理。', 'Remove attachment files and records that are no longer referenced by any block. Useful after overwrite imports or large deletions.')}
          control={
            <ActionButton
              onClick={() => { void onCleanupOrphanAttachments?.() }}
              disabled={!onCleanupOrphanAttachments}
              testId="settings-cleanup-attachments"
            >
              {localize(language, '开始清理', 'Start cleanup')}
            </ActionButton>
          }
        />
        <SettingsRow
          title={localize(language, '重试失败向量', 'Retry failed vectors')}
          description={localize(language, `${meta?.failedVectorCount ?? 0} 个失败向量可以重新入队，再由后台按当前模式继续处理。`, `${meta?.failedVectorCount ?? 0} failed vectors can be queued again and processed in the background using the current mode.`)}
          control={
            <ActionButton
              onClick={() => { void onRetryFailedVectors?.() }}
              disabled={!onRetryFailedVectors || (meta?.failedVectorCount ?? 0) === 0}
              testId="settings-retry-vectors"
            >
              {localize(language, '重试失败向量', 'Retry failed vectors')}
            </ActionButton>
          }
        />
        <SettingsRow
          title={localize(language, '重建附件索引', 'Rebuild attachment index')}
          description={localize(language, '重新扫描块里的附件引用，补齐附件关系，并顺带清理扫描过程中发现的孤儿附件。', 'Rescan attachment references in blocks, repair attachment links, and clean any orphans found during the scan.')}
          control={
            <ActionButton
              onClick={() => { void onRebuildAttachmentIndex?.() }}
              disabled={!onRebuildAttachmentIndex}
              testId="settings-rebuild-attachments"
            >
              {localize(language, '重建附件索引', 'Rebuild attachment index')}
            </ActionButton>
          }
        />
        <SettingsRow
          title={localize(language, '重建全部向量', 'Rebuild all vectors')}
          description={
            rebuildAllVectorsDisabledReason(meta, language)
              ? localize(language, `当前不可用：${rebuildAllVectorsDisabledReason(meta, language)}`, `Currently unavailable: ${rebuildAllVectorsDisabledReason(meta, language)}`)
              : localize(language, '把全部块重新排队，按当前 embedding 配置完整重建向量索引。', 'Queue every block again and rebuild vector indexes using the current embedding configuration.')
          }
          control={
            <ActionButton
              onClick={() => { void onRebuildAllVectors?.() }}
              disabled={!onRebuildAllVectors || Boolean(rebuildAllVectorsDisabledReason(meta, language))}
              testId="settings-rebuild-vectors"
            >
              {localize(language, '重建全部向量', 'Rebuild all vectors')}
            </ActionButton>
          }
        />
      </SettingsGroup>
    </div>
  )
}
