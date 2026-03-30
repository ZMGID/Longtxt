export const IPC_CHANNELS = {
  blocks: {
    create: 'blocks:create',
    get: 'blocks:get',
    list: 'blocks:list',
    update: 'blocks:update',
    remove: 'blocks:remove',
  },
  search: {
    blocks: 'search:blocks',
    byTag: 'search:by-tag',
    generate: 'search:generate',
  },
  attachments: {
    saveImage: 'attachments:save-image',
  },
  graph: {
    getData: 'graph:get-data',
  },
  tags: {
    add: 'tags:add',
    remove: 'tags:remove',
    list: 'tags:list',
  },
  snapshots: {
    save: 'snapshots:save',
    list: 'snapshots:list',
    get: 'snapshots:get',
    remove: 'snapshots:remove',
  },
  exports: {
    markdown: 'exports:markdown',
    json: 'exports:json',
  },
  imports: {
    previewMarkdown: 'imports:preview-markdown',
    previewJson: 'imports:preview-json',
    confirm: 'imports:confirm',
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    testApi: 'settings:test-api',
    openDataDirectory: 'settings:open-data-directory',
    getMeta: 'settings:get-meta',
  },
  events: {
    blockChanged: 'events:block-changed',
    docGenerationChunk: 'events:doc-generation-chunk',
  },
} as const
