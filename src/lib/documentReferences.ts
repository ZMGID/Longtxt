import type { Block, SearchResult } from '../../shared/types'
import { buildSearchPreview } from '../../shared/searchPreview'

export async function loadDocumentReferences(
  loadBlocks: (blockIds: string[]) => Promise<Block[]>,
  blockIds: string[],
  query = '',
): Promise<SearchResult[]> {
  if (blockIds.length === 0) {
    return []
  }

  const loadedBlocks = await loadBlocks(blockIds)
  const blockMap = new Map(loadedBlocks.map((block) => [block.id, block]))

  return blockIds.flatMap((blockId) => {
    const block = blockMap.get(blockId)

    if (!block) {
      return []
    }

    return [{
      block,
      score: 0,
      matchSource: [],
      preview: buildSearchPreview(block.content, query),
    }]
  })
}
