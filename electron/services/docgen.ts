import type { Block, DocGenerationChunk, SearchResult } from '../../shared/types'
import type { LLMProvider } from './ai'

function reciprocalRank(rank: number): number {
  return 1 / (60 + rank)
}

// The search score is reciprocal-rank based. These thresholds therefore map
// directly to roughly "single-source top 5" and "single-source top 10".
const STRONG_SINGLE_SOURCE_SCORE_THRESHOLD = reciprocalRank(5)
const WEAK_REFERENCE_SCORE_THRESHOLD = reciprocalRank(10)

function isStrongReference(result: SearchResult): boolean {
  return result.matchSource.length >= 2 || result.score >= STRONG_SINGLE_SOURCE_SCORE_THRESHOLD
}

function isWeakReference(result: SearchResult): boolean {
  return result.score >= WEAK_REFERENCE_SCORE_THRESHOLD
}

export function selectDocumentReferenceBlocks(results: SearchResult[], maxReferenceBlocks: number): Block[] {
  const maxResults = Math.max(0, Math.floor(maxReferenceBlocks))

  if (maxResults === 0 || results.length === 0) {
    return []
  }

  const strongMatches = results.filter(isStrongReference)

  if (strongMatches.length >= maxResults) {
    return strongMatches.slice(0, maxResults).map((result) => result.block)
  }

  const selectedIds = new Set(strongMatches.map((result) => result.block.id))
  const weakMatches = results.filter((result) => !selectedIds.has(result.block.id) && isWeakReference(result))

  return [...strongMatches, ...weakMatches]
    .slice(0, maxResults)
    .map((result) => result.block)
}

export async function* streamDocumentGeneration(
  requestId: string,
  topic: string,
  blocks: Block[],
  provider: LLMProvider,
  mode: DocGenerationChunk['mode'],
): AsyncGenerator<DocGenerationChunk> {
  let fullText = ''

  for await (const delta of provider.streamDocument(topic, blocks)) {
    fullText += delta
    yield {
      requestId,
      topic,
      delta,
      done: false,
      mode,
    }
  }

  yield {
    requestId,
    topic,
    delta: '',
    done: true,
    mode,
    fullText,
  }
}
