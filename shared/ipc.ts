export const IPC_CHANNELS = {
  blocks: {
    create: 'blocks:create',
    get: 'blocks:get',
    list: 'blocks:list',
    update: 'blocks:update',
    remove: 'blocks:remove',
    findRelated: 'blocks:find-related',
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
  notebooks: {
    list: 'notebooks:list',
    get: 'notebooks:get',
    create: 'notebooks:create',
    update: 'notebooks:update',
    remove: 'notebooks:remove',
    addBlock: 'notebooks:add-block',
    removeItem: 'notebooks:remove-item',
    reorderItems: 'notebooks:reorder-items',
    createBlock: 'notebooks:create-block',
    createStructureItem: 'notebooks:create-structure-item',
    updateStructureItem: 'notebooks:update-structure-item',
    getReferencePreview: 'notebooks:get-reference-preview',
    updateReferenceReview: 'notebooks:update-reference-review',
    generateDocument: 'notebooks:generate-document',
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
  vectors: {
    retryFailed: 'vectors:retry-failed',
  },
  events: {
    blockChanged: 'events:block-changed',
    docGenerationChunk: 'events:doc-generation-chunk',
  },
} as const
