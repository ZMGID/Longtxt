import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { BlockChangedEvent, CalendarChangedEvent, ChangbuApi, DocGenerationChunk, MetaChangedEvent, NotebookChangedEvent } from '../shared/types'

const blockListeners = new Set<(event: BlockChangedEvent) => void>()
const notebookListeners = new Set<(event: NotebookChangedEvent) => void>()
const metaListeners = new Set<(event: MetaChangedEvent) => void>()
const calendarListeners = new Set<(event: CalendarChangedEvent) => void>()
const docListeners = new Set<(chunk: DocGenerationChunk) => void>()

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

const api: ChangbuApi = {
  blocks: {
    create: (content) => ipcRenderer.invoke(IPC_CHANNELS.blocks.create, content),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.blocks.get, id),
    list: (params) => ipcRenderer.invoke(IPC_CHANNELS.blocks.list, params),
    update: (id, content) => ipcRenderer.invoke(IPC_CHANNELS.blocks.update, id, content),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.blocks.remove, id),
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
    markdown: (options) => ipcRenderer.invoke(IPC_CHANNELS.exports.markdown, options),
    json: (options) => ipcRenderer.invoke(IPC_CHANNELS.exports.json, options),
  },
  imports: {
    previewMarkdown: (filePaths) => ipcRenderer.invoke(IPC_CHANNELS.imports.previewMarkdown, filePaths),
    previewJson: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.imports.previewJson, filePath),
    confirm: (importId, conflictStrategy) => ipcRenderer.invoke(IPC_CHANNELS.imports.confirm, importId, conflictStrategy),
  },
  settings: {
    get: (key) => ipcRenderer.invoke(IPC_CHANNELS.settings.get, key),
    set: (key, value) => ipcRenderer.invoke(IPC_CHANNELS.settings.set, key, value),
    testApi: (config) => ipcRenderer.invoke(IPC_CHANNELS.settings.testApi, config),
    openDataDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openDataDirectory),
    openSettingsDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.settings.openSettingsDirectory),
    getMeta: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getMeta),
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
  },
}

contextBridge.exposeInMainWorld('changbu', api)
