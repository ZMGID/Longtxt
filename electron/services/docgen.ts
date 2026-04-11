import type { Block, DocGenerationChunk, SearchResult } from '../../shared/types'
import type { LLMProvider } from './ai-types'

export interface ReferenceSelectionFlags {
  excluded?: boolean
  locked?: boolean
  pinned?: boolean
}

export interface ReferenceSelectionInput {
  result: SearchResult
  flags?: ReferenceSelectionFlags
}

export interface SelectedReferenceResult {
  result: SearchResult
  reason: 'pinned' | 'locked' | 'strong' | 'weak'
}

export interface DocumentPromptContext {
  writingGuide?: string | null
  temperature?: number
  maxTokens?: number
}

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

export function selectDocumentReferenceResults(
  inputs: ReferenceSelectionInput[],
  maxReferenceBlocks: number,
): SelectedReferenceResult[] {
  const maxResults = Math.max(0, Math.floor(maxReferenceBlocks))

  if (maxResults === 0 || inputs.length === 0) {
    return []
  }

  const selectedIds = new Set<string>()
  const selected: SelectedReferenceResult[] = []

  function append(
    reason: SelectedReferenceResult['reason'],
    predicate: (input: ReferenceSelectionInput) => boolean,
  ): void {
    for (const input of inputs) {
      if (selected.length >= maxResults) {
        return
      }

      if (selectedIds.has(input.result.block.id) || input.flags?.excluded || !predicate(input)) {
        continue
      }

      selected.push({
        result: input.result,
        reason,
      })
      selectedIds.add(input.result.block.id)
    }
  }

  append('pinned', (input) => Boolean(input.flags?.pinned))
  append('locked', (input) => Boolean(input.flags?.locked))
  append('strong', (input) => isStrongReference(input.result))
  append('weak', (input) => isWeakReference(input.result))

  return selected
}

export function selectDocumentReferenceBlocks(results: SearchResult[], maxReferenceBlocks: number): Block[] {
  return selectDocumentReferenceResults(
    results.map((result) => ({ result })),
    maxReferenceBlocks,
  ).map((item) => item.result.block)
}

export async function* streamDocumentGeneration(
  requestId: string,
  topic: string,
  blocks: Block[],
  provider: LLMProvider,
  mode: DocGenerationChunk['mode'],
  promptContext?: DocumentPromptContext,
): AsyncGenerator<DocGenerationChunk> {
  let fullText = ''

  for await (const delta of provider.streamDocument(topic, blocks, promptContext)) {
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
