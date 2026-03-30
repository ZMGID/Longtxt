import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../shared/ipc'
import type { AppContext } from '../appContext'

export function createIpcHandlers(context: AppContext) {
  return {
    [IPC_CHANNELS.blocks.create]: (_event: unknown, content: string) => context.createBlock(content),
    [IPC_CHANNELS.blocks.get]: (_event: unknown, id: string) => context.getBlock(id),
    [IPC_CHANNELS.blocks.list]: (_event: unknown, params?: { offset?: number; limit?: number }) => context.listBlocks(params),
    [IPC_CHANNELS.blocks.update]: (_event: unknown, id: string, content: string) => context.updateBlock(id, content),
    [IPC_CHANNELS.blocks.remove]: (_event: unknown, id: string) => context.removeBlock(id),
    [IPC_CHANNELS.search.blocks]: (_event: unknown, query: string, limit?: number) => context.searchBlocks(query, limit),
    [IPC_CHANNELS.search.byTag]: (_event: unknown, tagName: string, limit?: number) => context.searchByTag(tagName, limit),
    [IPC_CHANNELS.search.generate]: (_event: unknown, topic: string) => context.generateDocument(topic),
    [IPC_CHANNELS.attachments.saveImage]: (_event: unknown, dataUrl: string, filenameHint?: string) => context.saveImage(dataUrl, filenameHint),
    [IPC_CHANNELS.graph.getData]: (_event: unknown, tagNames?: string[]) => context.getGraphData(tagNames),
    [IPC_CHANNELS.tags.add]: (_event: unknown, blockId: string, tagName: string) => context.addTag(blockId, tagName),
    [IPC_CHANNELS.tags.remove]: (_event: unknown, blockId: string, tagId: string) => context.removeTag(blockId, tagId),
    [IPC_CHANNELS.tags.list]: (_event: unknown, query?: string) => context.listTags(query),
    [IPC_CHANNELS.snapshots.save]: (_event: unknown, topic: string, content: string, blockIds: string[]) => context.saveSnapshot(topic, content, blockIds),
    [IPC_CHANNELS.snapshots.list]: (_event: unknown, query?: string) => context.listSnapshots(query),
    [IPC_CHANNELS.snapshots.get]: (_event: unknown, id: string) => context.getSnapshot(id),
    [IPC_CHANNELS.snapshots.remove]: (_event: unknown, id: string) => context.removeSnapshot(id),
    [IPC_CHANNELS.exports.markdown]: (_event: unknown, options: Parameters<AppContext['exportMarkdown']>[0]) => context.exportMarkdown(options),
    [IPC_CHANNELS.exports.json]: (_event: unknown, options: Parameters<AppContext['exportJson']>[0]) => context.exportJson(options),
    [IPC_CHANNELS.imports.previewMarkdown]: (_event: unknown, filePaths?: string[]) => context.previewImportMarkdown(filePaths),
    [IPC_CHANNELS.imports.previewJson]: (_event: unknown, filePath?: string) => context.previewImportJson(filePath),
    [IPC_CHANNELS.imports.confirm]: (_event: unknown, importId: string, conflictStrategy: Parameters<AppContext['confirmImport']>[1]) =>
      context.confirmImport(importId, conflictStrategy),
    [IPC_CHANNELS.settings.get]: (_event: unknown, key: string) => context.getSetting(key),
    [IPC_CHANNELS.settings.set]: (_event: unknown, key: string, value: string) => context.setSetting(key, value),
    [IPC_CHANNELS.settings.testApi]: (_event: unknown, config: Parameters<AppContext['testApi']>[0]) => context.testApi(config),
    [IPC_CHANNELS.settings.openDataDirectory]: () => context.openDataDirectory(),
    [IPC_CHANNELS.settings.getMeta]: () => context.getMeta(),
  }
}

export function registerIpcHandlers(context: AppContext): () => void {
  const handlers = createIpcHandlers(context)

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler)
  }

  return () => {
    for (const channel of Object.keys(handlers)) {
      ipcMain.removeHandler(channel)
    }
  }
}
