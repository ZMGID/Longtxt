/**
 * 导入导出模块
 *
 * 提供 Markdown / JSON 导出、导入预览与确认执行等公共方法。
 */

import { join } from 'node:path'

import type {
  AppLanguage,
  Block,
  BlockProcessingErrorCode,
} from '../shared/types'
import { getBlocksByIds, updateBlockState } from './db/blocks'
import { confirmImportJob, exportJsonBundle, exportMarkdownBundle, previewJsonImport, previewMarkdownImport } from './services/importExport'
import type { AppContextOptions } from './appContext-types'

/** 需要持久化到文件的设置键集合 */
const FILE_BACKED_SETTING_KEYS = new Set([
  'ai_config',
  'ai_last_test_result',
  'token_usage_totals',
  'block_enrich_settings',
  'calendar_settings',
  'doc_generation_settings',
  'external_access_settings',
  'ui_settings',
])

export interface ImportExportDeps {
  db: import('better-sqlite3').Database
  options: AppContextOptions
  settingsStore: { get: (key: string) => string | null; set: (key: string, value: string) => void }
  emitBlockChangedWithDerivedInvalidation: (event: { block: Block; reason: 'created' | 'updated' | 'enriched' | 'deleted' | 'tagged' }) => void
  emitTouchedNotebooks: (ids: string[], reason: string) => void
  emitMetaChanged: (event: import('../shared/types').MetaChangedEvent) => void
  trackTask: <T>(task: Promise<T>) => Promise<T>
  getUiSettings: () => { language: AppLanguage }
  getBlockProcessingDecision: (content: string) => { shouldProcess: boolean; errorCode: BlockProcessingErrorCode | null; errorMessage: string | null }
  scheduleEnrich: (blockId: string, content: string, generation: number) => void
  advanceBlockEnrichGeneration: (blockId: string) => number
  enqueueBlocksForVectorReindex: (blocks: Array<Pick<Block, 'id' | 'updatedAt'>>) => void
  scheduleCurrentVectorReindex: (options?: { fullRebuild?: boolean }) => void
  t: (zh: string, en: string) => string
  /** 导入任务缓存 */
  importJobs: Map<string, Awaited<ReturnType<typeof previewMarkdownImport>>['job']>
  /** 向量功能是否可用 */
  vectorReady: boolean
}

export interface ImportExportModule {
  exportMarkdown: (options: import('../shared/types').ExportOptions) => Promise<{ path: string; count: number } | null>
  exportJson: (options: import('../shared/types').ExportOptions) => Promise<{ path: string; count: number } | null>
  previewImportMarkdown: (filePaths?: string[]) => Promise<import('../shared/types').ImportPreview | null>
  previewImportJson: (filePath?: string) => Promise<import('../shared/types').ImportPreview | null>
  confirmImport: (importId: string, conflictStrategy: import('../shared/types').ImportConflictStrategy) => Promise<{ imported: number }>
}

export function createImportExportModule(deps: ImportExportDeps): ImportExportModule {
  const {
    db,
    options,
    settingsStore,
    emitBlockChangedWithDerivedInvalidation,
    emitTouchedNotebooks,
    emitMetaChanged,
    trackTask,
    getUiSettings,
    getBlockProcessingDecision,
    scheduleEnrich,
    advanceBlockEnrichGeneration,
    enqueueBlocksForVectorReindex,
    scheduleCurrentVectorReindex,
    t,
    importJobs,
  } = deps

  return {
    async exportMarkdown(exportOptions) {
      const language = getUiSettings().language
      const targetDirectory =
        exportOptions.targetPath ??
        (options.chooseDirectory ? await options.chooseDirectory(
          language === 'en' ? 'Choose Markdown export directory' : '选择 Markdown 导出目录',
        ) : null)

      if (!targetDirectory) {
        return null
      }

      return exportMarkdownBundle(db, targetDirectory, exportOptions)
    },

    async exportJson(exportOptions) {
      const defaultPath = join(options.dataDirectory, `changbu-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
      const language = getUiSettings().language
      const targetFilePath =
        exportOptions.targetPath ??
        (options.chooseSavePath
          ? await options.chooseSavePath({
              title: language === 'en' ? 'Export JSON backup' : '导出 JSON 备份',
              defaultPath,
              filters: [{ name: 'JSON', extensions: ['json'] }],
            })
          : null)

      if (!targetFilePath) {
        return null
      }

      const settingsSnapshot = exportOptions.includeSettings
        ? Object.fromEntries(
            Array.from(FILE_BACKED_SETTING_KEYS)
              .map((key) => [key, settingsStore.get(key)] as const)
              .filter((entry): entry is [string, string] => entry[1] !== null),
          )
        : null

      return exportJsonBundle(db, targetFilePath, exportOptions, settingsSnapshot)
    },

    async previewImportMarkdown(filePaths) {
      const language = getUiSettings().language
      const resolvedFilePaths =
        filePaths && filePaths.length > 0
          ? filePaths
          : options.chooseOpenPaths
            ? await options.chooseOpenPaths({
                title: language === 'en' ? 'Select Markdown files' : '选择 Markdown 文件',
                filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
                properties: ['openFile', 'multiSelections'],
              })
            : []

      if (resolvedFilePaths.length === 0) {
        return null
      }

      const { preview, job } = await previewMarkdownImport(resolvedFilePaths)
      importJobs.set(preview.importId, job)
      return preview
    },

    async previewImportJson(filePath) {
      const language = getUiSettings().language
      const resolvedFilePath =
        filePath ??
        (options.chooseOpenPaths
          ? (
              await options.chooseOpenPaths({
                title: language === 'en' ? 'Select JSON backup file' : '选择 JSON 备份文件',
                filters: [{ name: 'JSON', extensions: ['json'] }],
                properties: ['openFile'],
              })
            )[0]
          : undefined)

      if (!resolvedFilePath) {
        return null
      }

      const { preview, job } = await previewJsonImport(db, resolvedFilePath)
      importJobs.set(preview.importId, job)
      return preview
    },

    async confirmImport(importId, conflictStrategy) {
      const job = importJobs.get(importId)

      if (!job) {
        throw new Error(t('导入预览已失效，请重新选择文件。', 'Import preview expired. Please choose files again.'))
      }

      let result: Awaited<ReturnType<typeof confirmImportJob>>

      try {
        result = await confirmImportJob(db, options.dataDirectory, job, conflictStrategy)
      } finally {
        importJobs.delete(importId)
      }

      const importedBlocks = getBlocksByIds(db, result.importedIds)
      const createdBlocks = getBlocksByIds(db, result.createdIds)
      const updatedBlocks = getBlocksByIds(db, result.updatedIds)
      const processableImportedBlocks: Block[] = []
      const touchedNotebookIds = new Set<string>()

      for (const block of updatedBlocks) {
        const { touchNotebooksForBlock } = await import('./db/notebooks')
        for (const notebookId of touchNotebooksForBlock(db, block.id, new Date().toISOString())) {
          touchedNotebookIds.add(notebookId)
        }
      }

      for (const block of createdBlocks) {
        emitBlockChangedWithDerivedInvalidation({
          block,
          reason: 'created',
        })
      }

      for (const block of updatedBlocks) {
        emitBlockChangedWithDerivedInvalidation({
          block,
          reason: 'updated',
        })
      }

      for (const block of importedBlocks) {
        const decision = getBlockProcessingDecision(block.content)

        if (decision.shouldProcess) {
          processableImportedBlocks.push(block)
          continue
        }

        const skippedBlock = updateBlockState(db, {
          id: block.id,
          status: 'skipped',
          aiMode: block.aiMode,
          updatedAt: block.updatedAt,
          errorCode: decision.errorCode,
          errorMessage: decision.errorMessage,
        })

        emitBlockChangedWithDerivedInvalidation({
          block: skippedBlock,
          reason: 'enriched',
        })
      }

      emitTouchedNotebooks(Array.from(touchedNotebookIds), 'updated')

      if (job.format === 'markdown') {
        void trackTask(
          (async () => {
            for (const block of processableImportedBlocks) {
              const enrichGeneration = advanceBlockEnrichGeneration(block.id)
              scheduleEnrich(block.id, block.content, enrichGeneration)
            }
          })(),
        )
      }

      if (job.format === 'json' && job.settingsSnapshot) {
        let settingsChanged = false

        for (const [key, value] of Object.entries(job.settingsSnapshot)) {
          if (settingsStore.get(key) === value) {
            continue
          }

          settingsStore.set(key, value)
          settingsChanged = true
        }

        if (settingsChanged) {
          emitMetaChanged({
            reason: 'settings',
          })
        }
      }

      enqueueBlocksForVectorReindex(processableImportedBlocks)

      if (processableImportedBlocks.length > 0) {
        scheduleCurrentVectorReindex()
      }

      void trackTask(
        (async () => {
          const { cleanupOrphanAttachments } = await import('./services/attachments')
          return cleanupOrphanAttachments(db, options.dataDirectory)
        })(),
      )
      return result
    },
  }
}
