import type { Block, SearchResult } from '../../shared/types'

export async function loadDocumentReferences(
  loadBlock: (blockId: string) => Promise<Block>,
  blockIds: string[],
): Promise<SearchResult[]> {
  const loaded = await Promise.allSettled(blockIds.map((blockId) => loadBlock(blockId)))

  return loaded.flatMap((result) => {
    if (result.status !== 'fulfilled') {
      return []
    }

    return [{
      block: result.value,
      score: 0,
      matchSource: [],
    }]
  })
}
