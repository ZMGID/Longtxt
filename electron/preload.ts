import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '../shared/ipc'
import type { BlockChangedEvent, ChangbuApi, DocGenerationChunk } from '../shared/types'

const blockListeners = new Set<(event: BlockChangedEvent) => void>()
const docListeners = new Set<(chunk: DocGenerationChunk) => void>()

ipcRenderer.on(IPC_CHANNELS.events.blockChanged, (_event, payload: BlockChangedEvent) => {
  for (const listener of blockListeners) {
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
    save: (topic, content, blockIds) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.save, topic, content, blockIds),
    list: (query) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.list, query),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.get, id),
    remove: (id) => ipcRenderer.invoke(IPC_CHANNELS.snapshots.remove, id),
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
    getMeta: () => ipcRenderer.invoke(IPC_CHANNELS.settings.getMeta),
  },
  events: {
    onBlockChanged(listener) {
      blockListeners.add(listener)
      return () => {
        blockListeners.delete(listener)
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
