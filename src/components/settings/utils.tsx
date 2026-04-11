import type { ReactNode } from 'react'

import {
  DEFAULT_BLOCK_ENRICH_SETTINGS,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_DOC_GENERATION_SETTINGS,
} from '../../../shared/config'
import type {
  AppMeta,
  BlockEnrichSettings,
  CalendarSettings,
  DocGenerationSettings,
  TokenUsage,
} from '../../../shared/types'
import { formatDateByLanguage, formatNumberByLanguage, type AppLanguage } from '../../i18n/locale'
import type { SettingsNavGroup, SettingsPageTitle, SettingsSectionId } from './types'

export function buildSettingsNavGroups(language: AppLanguage): SettingsNavGroup[] {
  if (language === 'en') {
    return [
      {
        title: 'Options',
        items: [
          { id: 'about', label: 'About', hint: 'Runtime status and diagnostics' },
          { id: 'general', label: 'General', hint: 'Daily feature switches' },
          { id: 'ai', label: 'Model & API', hint: 'LLM / Embedding' },
          { id: 'external-access', label: 'External Access', hint: 'CLI and generic integrations' },
          { id: 'files', label: 'Files', hint: 'Open data and settings folders' },
        ],
      },
      {
        title: 'Maintenance',
        items: [
          { id: 'backup', label: 'Backup', hint: 'Export and import backup' },
          { id: 'advanced', label: 'Advanced', hint: 'Low-frequency tuning' },
        ],
      },
    ]
  }

  return [
    {
      title: '选项',
      items: [
        { id: 'about', label: '关于', hint: '运行状态与诊断' },
        { id: 'general', label: '常用', hint: '日常功能开关' },
        { id: 'ai', label: '模型与接口', hint: 'LLM / Embedding' },
        { id: 'external-access', label: '外部接入', hint: 'CLI 与通用接入' },
        { id: 'files', label: '文件与目录', hint: '打开数据与设置' },
      ],
    },
    {
      title: '维护',
      items: [
        { id: 'backup', label: '备份与恢复', hint: '导出与加载备份' },
        { id: 'advanced', label: '高级设置', hint: '低频参数调优' },
      ],
    },
  ]
}

export function formatCompactStat(value: number, language: AppLanguage): string {
  return formatNumberByLanguage(value, language)
}

export function formatExternalAccessTime(value: string | null, language: AppLanguage): string {
  if (!value) {
    return language === 'en' ? 'not generated' : '尚未生成'
  }

  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : formatDateByLanguage(date, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }, language)
}

export function renderMonospaceValue(value: string): ReactNode {
  return <span className="break-all font-mono text-[12px] text-stone-600">{value}</span>
}

export function normalizeTokenUsage(usage: TokenUsage | null | undefined): TokenUsage {
  return usage ?? {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    requestCount: 0,
  }
}

export function localize(language: AppLanguage, zh: string, en: string): string {
  return language === 'en' ? en : zh
}

export function runtimeAiStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta?.aiConfigured) {
    return localize(language, '未配置，当前使用 mock', 'Not configured. Using mock.')
  }

  if (meta.activeAiMode === 'live') {
    return meta.lastAiError
      ? localize(language, 'live AI 已启用，但最近运行失败', 'Live AI is enabled, but the latest run failed.')
      : localize(language, 'live AI 已启用', 'Live AI is enabled.')
  }

  return localize(language, '配置已保存，但当前仍停留在 mock', 'Config is saved, but the app is still in mock mode.')
}

export function runtimeVectorStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta?.vectorReady) {
    return localize(language, '已降级：搜索仍可用，但仅标签 + FTS，不走向量召回', 'Degraded: search still works, but only via tags + FTS without vector recall.')
  }

  if (!meta.vectorSchemaReady) {
    return localize(language, '向量可用，但 Schema 仍在准备', 'Vectors are available, but the schema is still being prepared.')
  }

  return localize(language, `可用 · ${meta.vectorDimension ?? '?'} 维`, `Ready · ${meta.vectorDimension ?? '?'} dim`)
}

export function runtimeQueueStatus(meta: AppMeta | null, language: AppLanguage): string {
  if (!meta) {
    return localize(language, '加载中…', 'Loading…')
  }

  if (meta.failedVectorCount > 0) {
    return localize(language, `失败待重试 · ${meta.failedVectorCount} 个块`, `Failed and waiting for retry · ${meta.failedVectorCount} blocks`)
  }

  if (meta.pendingVectorCount > 0) {
    return meta.vectorQueueProcessing
      ? localize(language, `处理中 · ${meta.pendingVectorCount} 个待补齐`, `Processing · ${meta.pendingVectorCount} pending`)
      : localize(language, `积压中 · ${meta.pendingVectorCount} 个待补齐`, `Backlogged · ${meta.pendingVectorCount} pending`)
  }

  return localize(language, '正常', 'Normal')
}

export function rebuildAllVectorsDisabledReason(meta: AppMeta | null, language: AppLanguage): string | null {
  if (!meta) {
    return localize(language, '正在加载当前状态。', 'Loading current status.')
  }

  if (!meta.vectorReady) {
    return localize(language, '当前数据库未启用向量索引。', 'Vector index is not enabled for the current database.')
  }

  if (meta.aiConfigured && meta.activeAiMode !== 'live') {
    return localize(language, '已配置 AI 但尚未完成测试，请先完成连接测试。', 'AI is configured but not verified yet. Run a connection test first.')
  }

  return null
}

export function countAdvancedOverrides(
  docGenerationSettings: DocGenerationSettings,
  blockEnrichSettings: BlockEnrichSettings,
  calendarSettings: CalendarSettings,
): number {
  let count = 0

  if (docGenerationSettings.maxReferenceBlocks !== DEFAULT_DOC_GENERATION_SETTINGS.maxReferenceBlocks) count += 1
  if (docGenerationSettings.retrievalLimit !== DEFAULT_DOC_GENERATION_SETTINGS.retrievalLimit) count += 1
  if (docGenerationSettings.temperature !== DEFAULT_DOC_GENERATION_SETTINGS.temperature) count += 1
  if (docGenerationSettings.maxOutputTokens !== DEFAULT_DOC_GENERATION_SETTINGS.maxOutputTokens) count += 1
  if (docGenerationSettings.streamOutput !== DEFAULT_DOC_GENERATION_SETTINGS.streamOutput) count += 1
  if (blockEnrichSettings.queueEnabled !== DEFAULT_BLOCK_ENRICH_SETTINGS.queueEnabled) count += 1
  if (blockEnrichSettings.maxBatchBlocks !== DEFAULT_BLOCK_ENRICH_SETTINGS.maxBatchBlocks) count += 1
  if (blockEnrichSettings.queueDebounceMs !== DEFAULT_BLOCK_ENRICH_SETTINGS.queueDebounceMs) count += 1
  if (blockEnrichSettings.responseReserveTokens !== DEFAULT_BLOCK_ENRICH_SETTINGS.responseReserveTokens) count += 1
  if (calendarSettings.maxSuggestionsPerBlock !== DEFAULT_CALENDAR_SETTINGS.maxSuggestionsPerBlock) count += 1
  if (calendarSettings.upcomingDays !== DEFAULT_CALENDAR_SETTINGS.upcomingDays) count += 1

  return count
}

export function getSettingsPageTitle(activeSection: SettingsSectionId, language: AppLanguage): SettingsPageTitle {
  if (language === 'en') {
    switch (activeSection) {
      case 'about':
        return { eyebrow: 'About', title: 'App info and runtime status', description: 'Browse current status, latest tests, and diagnostics from one place.' }
      case 'general':
        return { eyebrow: 'General', title: 'Common features', description: 'Keep daily switches here and avoid diving into advanced settings.' }
      case 'ai':
        return { eyebrow: 'Model & API', title: 'Model and API', description: 'Configure LLM / Embedding, then test manually after saving.' }
      case 'external-access':
        return { eyebrow: 'External Access', title: 'External access', description: 'Operate first, check paths second. Generates generic integration bundle by default.' }
      case 'backup':
        return { eyebrow: 'Backup', title: 'Backup and restore', description: 'Export full JSON backups, or preview and import past backups.' }
      case 'files':
        return { eyebrow: 'Files', title: 'Files and directories', description: 'Open data and settings directories directly for troubleshooting.' }
      case 'advanced':
        return { eyebrow: 'Advanced', title: 'Advanced settings', description: 'Low-frequency tuning and maintenance tools live here.' }
    }
  }

  switch (activeSection) {
    case 'about':
      return { eyebrow: '关于', title: '应用信息与运行状态', description: '像系统设置一样浏览当前状态、最近测试结果和运行诊断。' }
    case 'general':
      return { eyebrow: '常用', title: '常用功能', description: '把日常会用到的功能开关留在外层，避免先钻进高级参数。' }
    case 'ai':
      return { eyebrow: '模型与接口', title: '模型与接口', description: '配置 LLM / Embedding，并在保存后手动测试连接。' }
    case 'external-access':
      return { eyebrow: '外部接入', title: '外部接入', description: '先操作，再看路径。这里默认生成通用接入包，Claude 只是附带模板。' }
    case 'backup':
      return { eyebrow: '备份与恢复', title: '备份与恢复', description: '导出完整 JSON 备份，或预览后加载历史备份。' }
    case 'files':
      return { eyebrow: '文件与目录', title: '文件与目录', description: '直接打开数据目录和设置文件目录，便于排查和手动复制。' }
    case 'advanced':
      return { eyebrow: '高级设置', title: '高级设置', description: '低频参数和维护工具都收在这里，只在需要调优或维护时再打开。' }
  }
}
