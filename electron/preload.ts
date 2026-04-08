import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type {
  AppQuitStateChangedEvent,
  BlockChangedEvent,
  CalendarChangedEvent,
  ChangbuApi,
  DocGenerationChunk,
  MetaChangedEvent,
  NotebookChangedEvent,
  ReviewGenerationChunk,
  RendererExportOptions,
} from '../shared/types'

const blockListeners = new Set<(event: BlockChangedEvent) => void>()
const notebookListeners = new Set<(event: NotebookChangedEvent) => void>()
const metaListeners = new Set<(event: MetaChangedEvent) => void>()
const calendarListeners = new Set<(event: CalendarChangedEvent) => void>()
const docListeners = new Set<(chunk: DocGenerationChunk) => void>()
const reviewListeners = new Set<(chunk: ReviewGenerationChunk) => void>()
const quitStateListeners = new Set<(state: AppQuitStateChangedEvent) => void>()

function sanitizeExportOptions(options: Partial<RendererExportOptions> | undefined): RendererExportOptions {
  return {
    includeAttachments: Boolean(options?.includeAttachments),
    includeSettings: Boolean(options?.includeSettings),
    tagFilter: options?.tagFilter,
    dateRange: options?.dateRange,
  }
}

ipcRenderer.on(IPC_CHANNELS.events.blockChanged, (_event, payload: BlockChangedEvent) => {
  for (const listener of blockListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.notebooksChanged, (_event, payload: NotebookChangedEvent) => {
  for (const listener of notebookListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.metaChanged, (_event, payload: MetaChangedEvent) => {
  for (const listener of metaListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.calendarChanged, (_event, payload: CalendarChangedEvent) => {
  for (const listener of calendarListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.docGenerationChunk, (_event, payload: DocGenerationChunk) => {
  for (const listener of docListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.reviewGenerationChunk, (_event, payload: ReviewGenerationChunk) => {
  for (const listener of reviewListeners) {
    listener(payload)
  }
})

ipcRenderer.on(IPC_CHANNELS.events.quitStateChanged, (_event, payload: AppQuitStateChangedEvent) => {
  for (const listener of quitStateListeners) {
    listener(payload)
  }
})

const api: ChangbuApi = {
  blocks: {
    create: (content) => ipcRenderer.invoke(IPC_CHANNELS.blocks.create, content),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.blocks.get, id),
    list: (params) => ipcRenderer.invoke(IPC_CHANNELS.blocks.list, params),
    listByDate: (date) => ipcRenderer.invoke(IPC_CHANNELS.blocks.listByDate, date),
    update: (id, content) => ipcRenderer.invoke(IPC_CHANNELS.blocks.update, id, content),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.blocks.remove, id),
    removeMany: (ids) => ipcRenderer.invoke(IPC_CHANNELS.blocks.removeMany, ids),
    findRelated: (blockId, limit) => ipcRenderer.invoke(IPC_CHANNELS.blocks.findRelated, blockId, limit),
  },
  search: {
    blocks: (query, limit) => ipcRenderer.invoke(IPC_CHANNELS.search.blocks, query, limit),
    byTag: (tagName, limit) => ipcRenderer.invoke(IPC_CHANNELS.search.byTag, tagName, limit),
    generate: (topic) => ipcRenderer.invoke(IPC_CHANNELS.search.generate, topic),
  },
  attachments: {
    saveImage: (dataUrl, filenameHint) => ipcRenderer.invoke(IPC_CHANNELS.attachments.saveImage, dataUrl, filenameHint),
  },
  graph: {
    getData: (tagNames) => ipcRenderer.invoke(IPC_CHANNELS.graph.getData, tagNames),
  },
  tags: {
    add: (blockId, tagName) => ipcRenderer.invoke(IPC_CHANNELS.tags.add, blockId, tagName),
    remove: (blockId, tagId) => ipcRenderer.invoke(IPC_CHANNELS.tags.remove, blockId, tagId),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.tags.list, query),
  },
  snapshots: {
    save: (topic, content, blockIds, notebookId) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.save, topic, content, blockIds, notebookId),
    list: (query, notebookId) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.list, query, notebookId),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.get, id),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.remove, id),
  },
  calendar: {
    listYears: () => ipcRenderer.invoke(IPC_CHANNELS.calendar.listYears),
    getYearHeatmap: (year) => ipcRenderer.invoke(IPC_CHANNELS.calendar.getYearHeatmap, year),
    getDayDetail: (date) => ipcRenderer.invoke(IPC_CHANNELS.calendar.getDayDetail, date),
    listUpcoming: (limitDays) => ipcRenderer.invoke(IPC_CHANNELS.calendar.listUpcoming, limitDays),
    createEntry: (input) => ipcRenderer.invoke(IPC_CHANNELS.calendar.createEntry, input),
    updateEntry: (id, patch) => ipcRenderer.invoke(IPC_CHANNELS.calendar.updateEntry, id, patch),
    removeEntry: (id) => ipcRenderer.invoke(IPC_CHANNELS.calendar.removeEntry, id),
    acceptSuggestion: (suggestionId, overrides) => ipcRenderer.invoke(IPC_CHANNELS.calendar.acceptSuggestion, suggestionId, overrides),
    dismissSuggestion: (suggestionId) => ipcRenderer.invoke(IPC_CHANNELS.calendar.dismissSuggestion, suggestionId),
  },
  notebooks: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.notebooks.list),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.get, id),
    create: (title) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.create, title),
    update: (id, title) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.update, id, title),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.remove, id),
    addBlock: (notebookId, blockId) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.addBlock, notebookId, blockId),
    removeItem: (notebookId, itemId) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.removeItem, notebookId, itemId),
    reorderItems: (notebookId, itemIds) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.reorderItems, notebookId, itemIds),
    createBlock: (notebookId, content) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.createBlock, notebookId, content),
    createStructureItem: (notebookId, input) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.createStructureItem, notebookId, input),
    updateStructureItem: (notebookId, itemId, patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.notebooks.updateStructureItem, notebookId, itemId, patch),
    getReferencePreview: (notebookId, topic) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.getReferencePreview, notebookId, topic),
    updateReferenceReview: (notebookId, blockId, patch, topic) =>
      ipcRenderer.invoke(IPC_CHANNELS.notebooks.updateReferenceReview, notebookId, blockId, patch, topic),
    generateDocument: (notebookId, topic) => ipcRenderer.invoke(IPC_CHANNELS.notebooks.generateDocument, notebookId, topic),
  },
  exports: {
    markdown: (options) => ipcRenderer.invoke(IPC_CHANNELS.exports.markdown, sanitizeExportOptions(options)),
    json: (options) => ipcRenderer.invoke(IPC_CHANNELS.exports.json, sanitizeExportOptions(options)),
  },
  imports: {
    previewMarkdown: () => ipcRenderer.invoke(IPC_CHANNELS.imports.previewMarkdown),
    previewJson: () => ipcRenderer.invoke(IPC_CHANNELS.imports.previewJson),
    confirm: (importId, conflictStrategy) => ipcRenderer.invoke(IPC_CHANNELS.imports.confirm, importId, conflictStrategy),
  },
  data: {
    getOverview: () => ipcRenderer.invoke(IPC_CHANNELS.data.getOverview),
    cleanupOrphanAttachments: () => ipcRenderer.invoke(IPC_CHANNELS.data.cleanupOrphanAttachments),
    rebuildAttachmentIndex: () => ipcRenderer.invoke(IPC_CHANNELS.data.rebuildAttachmentIndex),
    rebuildAllVectors: () => ipcRenderer.invoke(IPC_CHANNELS.data.rebuildAllVectors),
  },
  review: {
    openWindow: (mode, dateKey) => ipcRenderer.invoke(IPC_CHANNELS.review.openWindow, mode, dateKey),
    generateDaily: (dateKey, forceRefresh) => ipcRenderer.invoke(IPC_CHANNELS.review.generateDaily, dateKey, forceRefresh),
    generateInsight: (methodId, dateKey, forceRefresh) => ipcRenderer.invoke(IPC_CHANNELS.review.generateInsight, methodId, dateKey, forceRefresh),
    listInsightHistory: (methodId, limit) => ipcRenderer.invoke(IPC_CHANNELS.review.listInsightHistory, methodId, limit),
    startDailyGeneration: (dateKey, forceRefresh) => ipcRenderer.invoke(IPC_CHANNELS.review.startDailyGeneration, dateKey, forceRefresh),
    startInsightGeneration: (methodId, dateKey, forceRefresh) =>
      ipcRenderer.invoke(IPC_CHANNELS.review.startInsightGeneration, methodId, dateKey, forceRefresh),
    saveDailySnapshot: (input) => ipcRenderer.invoke(IPC_CHANNELS.review.saveDailySnapshot, input),
    saveInsightSnapshot: (input) => ipcRenderer.invoke(IPC_CHANNELS.review.saveInsightSnapshot, input),
  },
  settings: {
    get: (key) => ipcRenderer.invoke(IPC_CHANNELS.settings.get, key),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.settings.set, key, value),
    testApi: (config) => ipcRenderer.invoke(IPC_CHANNELS.settings.testApi, config),
    openWindow: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openWindow),
    openDataDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openDataDirectory),
    openSettingsDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openSettingsDirectory),
    getMeta: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getMeta),
    getExternalAccessStatus: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getExternalAccessStatus),
    enableExternalAccess: () => ipcRenderer.invoke(IPC_CHANNELS.settings.enableExternalAccess),
    generateExternalAccessBundle: () => ipcRenderer.invoke(IPC_CHANNELS.settings.generateExternalAccessBundle),
    setupExternalAccess: () => ipcRenderer.invoke(IPC_CHANNELS.settings.setupExternalAccess),
    disableExternalAccess: () => ipcRenderer.invoke(IPC_CHANNELS.settings.disableExternalAccess),
    openExternalAccessDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openExternalAccessDirectory),
  },
  vectors: {
    retryFailed: () => ipcRenderer.invoke(IPC_CHANNELS.vectors.retryFailed),
  },
  events: {
    onBlockChanged(listener) {
      blockListeners.add(listener)
      return () => {
        blockListeners.delete(listener)
      }
    },
    onNotebooksChanged(listener) {
      notebookListeners.add(listener)
      return () => {
        notebookListeners.delete(listener)
      }
    },
    onMetaChanged(listener) {
      metaListeners.add(listener)
      return () => {
        metaListeners.delete(listener)
      }
    },
    onCalendarChanged(listener) {
      calendarListeners.add(listener)
      return () => {
        calendarListeners.delete(listener)
      }
    },
    onDocGenerationChunk(listener) {
      docListeners.add(listener)
      return () => {
        docListeners.delete(listener)
      }
    },
    onReviewGenerationChunk(listener) {
      reviewListeners.add(listener)
      return () => {
        reviewListeners.delete(listener)
      }
    },
    onQuitStateChanged(listener) {
      quitStateListeners.add(listener)
      return () => {
        quitStateListeners.delete(listener)
      }
    },
  },
}

contextBridge.exposeInMainWorld('changbu', api)
