import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc'
import type { AiInsightSnapshotInput, DailyReviewSnapshotInput, RendererExportOptions } from '../../shared/types'
import type { AppContext } from '../appContext'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

function sanitizeExportOptions(options: Partial<RendererExportOptions> | undefined): RendererExportOptions {
  return {
    includeAttachments: Boolean(options?.includeAttachments),
    includeSettings: Boolean(options?.includeSettings),
    tagFilter: options?.tagFilter,
    dateRange: options?.dateRange,
  }
}

export function createIpcHandlers(context: AppContext, extraHandlers: Record<string, IpcHandler> = {}) {
  return {
    [IPC_CHANNELS.blocks.create]: (_event: unknown, content: string) => context.createBlock(content),
    [IPC_CHANNELS.blocks.get]: (_event: unknown, id: string) => context.getBlock(id),
    [IPC_CHANNELS.blocks.list]: (_event: unknown, params?: { offset?: number; limit?: number }) => context.listBlocks(params),
    [IPC_CHANNELS.blocks.listByDate]: (_event: unknown, date: string) => context.listBlocksByDate(date),
    [IPC_CHANNELS.blocks.update]: (_event: unknown, id: string, content: string) => context.updateBlock(id, content),
    [IPC_CHANNELS.blocks.remove]: (_event: unknown, id: string) => context.removeBlock(id),
    [IPC_CHANNELS.blocks.removeMany]: (_event: unknown, ids: string[]) => context.removeBlocks(ids),
    [IPC_CHANNELS.blocks.findRelated]: (_event: unknown, blockId: string, limit?: number) => context.findRelatedBlocks(blockId, limit),
    [IPC_CHANNELS.search.blocks]: (_event: unknown, query: string, limit?: number) => context.searchBlocks(query, limit),
    [IPC_CHANNELS.search.byTag]: (_event: unknown, tagName: string, limit?: number) => context.searchByTag(tagName, limit),
    [IPC_CHANNELS.search.generate]: (_event: unknown, topic: string) => context.generateDocument(topic),
    [IPC_CHANNELS.attachments.saveImage]: (_event: unknown, dataUrl: string, filenameHint?: string) => context.saveImage(dataUrl, filenameHint),
    [IPC_CHANNELS.graph.getData]: (_event: unknown, tagNames?: string[]) => context.getGraphData(tagNames),
    [IPC_CHANNELS.tags.add]: (_event: unknown, blockId: string, tagName: string) => context.addTag(blockId, tagName),
    [IPC_CHANNELS.tags.remove]: (_event: unknown, blockId: string, tagId: string) => context.removeTag(blockId, tagId),
    [IPC_CHANNELS.tags.list]: (_event: unknown, query?: string) => context.listTags(query),
    [IPC_CHANNELS.snapshots.save]: (_event: unknown, topic: string, content: string, blockIds: string[], notebookId?: string | null) =>
      context.saveSnapshot(topic, content, blockIds, notebookId),
    [IPC_CHANNELS.snapshots.list]: (_event: unknown, query?: string, notebookId?: string | null) => context.listSnapshots(query, notebookId),
    [IPC_CHANNELS.snapshots.get]: (_event: unknown, id: string) => context.getSnapshot(id),
    [IPC_CHANNELS.snapshots.remove]: (_event: unknown, id: string) => context.removeSnapshot(id),
    [IPC_CHANNELS.calendar.listYears]: () => context.listCalendarYears(),
    [IPC_CHANNELS.calendar.getYearHeatmap]: (_event: unknown, year: number) => context.getCalendarHeatmap(year),
    [IPC_CHANNELS.calendar.getDayDetail]: (_event: unknown, date: string) => context.getCalendarDayDetail(date),
    [IPC_CHANNELS.calendar.listUpcoming]: (_event: unknown, limitDays?: number) => context.listUpcomingCalendarEntries(limitDays),
    [IPC_CHANNELS.calendar.createEntry]: (_event: unknown, input: Parameters<AppContext['createCalendarEntry']>[0]) => context.createCalendarEntry(input),
    [IPC_CHANNELS.calendar.updateEntry]: (_event: unknown, id: string, patch: Parameters<AppContext['updateCalendarEntry']>[1]) =>
      context.updateCalendarEntry(id, patch),
    [IPC_CHANNELS.calendar.removeEntry]: (_event: unknown, id: string) => context.removeCalendarEntry(id),
    [IPC_CHANNELS.calendar.acceptSuggestion]: (
      _event: unknown,
      suggestionId: string,
      overrides?: Parameters<AppContext['acceptCalendarSuggestion']>[1],
    ) => context.acceptCalendarSuggestion(suggestionId, overrides),
    [IPC_CHANNELS.calendar.dismissSuggestion]: (_event: unknown, suggestionId: string) => context.dismissCalendarSuggestion(suggestionId),
    [IPC_CHANNELS.notebooks.list]: () => context.listNotebooks(),
    [IPC_CHANNELS.notebooks.get]: (_event: unknown, id: string) => context.getNotebook(id),
    [IPC_CHANNELS.notebooks.create]: (_event: unknown, title?: string) => context.createNotebook(title),
    [IPC_CHANNELS.notebooks.update]: (_event: unknown, id: string, title: string) => context.updateNotebook(id, title),
    [IPC_CHANNELS.notebooks.remove]: (_event: unknown, id: string) => context.removeNotebook(id),
    [IPC_CHANNELS.notebooks.addBlock]: (_event: unknown, notebookId: string, blockId: string) => context.addBlockToNotebook(notebookId, blockId),
    [IPC_CHANNELS.notebooks.removeItem]: (_event: unknown, notebookId: string, itemId: string) => context.removeNotebookItem(notebookId, itemId),
    [IPC_CHANNELS.notebooks.reorderItems]: (_event: unknown, notebookId: string, itemIds: string[]) => context.reorderNotebookItems(notebookId, itemIds),
    [IPC_CHANNELS.notebooks.createBlock]: (_event: unknown, notebookId: string, content: string) => context.createNotebookBlock(notebookId, content),
    [IPC_CHANNELS.notebooks.createStructureItem]: (_event: unknown, notebookId: string, input: Parameters<AppContext['createNotebookStructureItem']>[1]) =>
      context.createNotebookStructureItem(notebookId, input),
    [IPC_CHANNELS.notebooks.updateStructureItem]: (
      _event: unknown,
      notebookId: string,
      itemId: string,
      patch: Parameters<AppContext['updateNotebookStructureItem']>[2],
    ) => context.updateNotebookStructureItem(notebookId, itemId, patch),
    [IPC_CHANNELS.notebooks.getReferencePreview]: (_event: unknown, notebookId: string, topic?: string) =>
      context.getNotebookReferencePreview(notebookId, topic),
    [IPC_CHANNELS.notebooks.updateReferenceReview]: (
      _event: unknown,
      notebookId: string,
      blockId: string,
      patch: Parameters<AppContext['updateNotebookReferenceReview']>[2],
      topic?: string,
    ) => context.updateNotebookReferenceReview(notebookId, blockId, patch, topic),
    [IPC_CHANNELS.notebooks.generateDocument]: (_event: unknown, notebookId: string, topic?: string) =>
      context.generateNotebookDocument(notebookId, topic),
    [IPC_CHANNELS.exports.markdown]: (_event: unknown, options?: RendererExportOptions) => context.exportMarkdown(sanitizeExportOptions(options)),
    [IPC_CHANNELS.exports.json]: (_event: unknown, options?: RendererExportOptions) => context.exportJson(sanitizeExportOptions(options)),
    [IPC_CHANNELS.imports.previewMarkdown]: () => context.previewImportMarkdown(),
    [IPC_CHANNELS.imports.previewJson]: () => context.previewImportJson(),
    [IPC_CHANNELS.imports.confirm]: (_event: unknown, importId: string, conflictStrategy: Parameters<AppContext['confirmImport']>[1]) =>
      context.confirmImport(importId, conflictStrategy),
    [IPC_CHANNELS.data.getOverview]: () => context.getDataManagementOverview(),
    [IPC_CHANNELS.data.cleanupOrphanAttachments]: () => context.cleanupOrphanAttachments(),
    [IPC_CHANNELS.data.rebuildAttachmentIndex]: () => context.rebuildAttachmentIndex(),
    [IPC_CHANNELS.data.rebuildAllVectors]: () => context.rebuildAllVectors(),
    [IPC_CHANNELS.review.generateDaily]: (_event: unknown, dateKey: string, forceRefresh?: boolean) =>
      context.generateDailyReview(dateKey, forceRefresh),
    [IPC_CHANNELS.review.generateInsight]: (_event: unknown, methodId: Parameters<AppContext['generateAiInsight']>[0], dateKey: string, forceRefresh?: boolean) =>
      context.generateAiInsight(methodId, dateKey, forceRefresh),
    [IPC_CHANNELS.review.startDailyGeneration]: (_event: unknown, dateKey: string, forceRefresh?: boolean) =>
      context.startDailyReviewGeneration(dateKey, forceRefresh),
    [IPC_CHANNELS.review.startInsightGeneration]: (
      _event: unknown,
      methodId: Parameters<AppContext['generateAiInsight']>[0],
      dateKey: string,
      forceRefresh?: boolean,
    ) => context.startAiInsightGeneration(methodId, dateKey, forceRefresh),
    [IPC_CHANNELS.review.saveDailySnapshot]: (_event: unknown, input: DailyReviewSnapshotInput) =>
      context.saveDailyReviewSnapshot(input),
    [IPC_CHANNELS.review.saveInsightSnapshot]: (_event: unknown, input: AiInsightSnapshotInput) =>
      context.saveAiInsightSnapshot(input),
    [IPC_CHANNELS.settings.get]: (_event: unknown, key: string) => context.getSetting(key),
    [IPC_CHANNELS.settings.set]: (_event: unknown, key: string, value: string) => context.setSetting(key, value),
    [IPC_CHANNELS.settings.testApi]: (_event: unknown, config: Parameters<AppContext['testApi']>[0]) => context.testApi(config),
    [IPC_CHANNELS.settings.openDataDirectory]: () => context.openDataDirectory(),
    [IPC_CHANNELS.settings.openSettingsDirectory]: () => context.openSettingsDirectory(),
    [IPC_CHANNELS.settings.getMeta]: () => context.getMeta(),
    [IPC_CHANNELS.settings.getExternalAccessStatus]: () => context.getExternalAccessStatus(),
    [IPC_CHANNELS.settings.enableExternalAccess]: () => context.enableExternalAccess(),
    [IPC_CHANNELS.settings.generateExternalAccessBundle]: () => context.generateExternalAccessBundle(),
    [IPC_CHANNELS.settings.setupExternalAccess]: () => context.setupExternalAccess(),
    [IPC_CHANNELS.settings.disableExternalAccess]: () => context.disableExternalAccess(),
    [IPC_CHANNELS.settings.openExternalAccessDirectory]: () => context.openExternalAccessDirectory(),
    [IPC_CHANNELS.vectors.retryFailed]: () => context.retryFailedVectors(),
    ...extraHandlers,
  }
}

export function registerIpcHandlers(context: AppContext, extraHandlers: Record<string, IpcHandler> = {}): () => void {
  const handlers = createIpcHandlers(context, extraHandlers)

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }

  return () => {
    for (const channel of Object.keys(handlers)) {
      ipcMain.removeHandler(channel)
    }
  }
}
