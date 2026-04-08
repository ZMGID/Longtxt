import type { Block } from '../../shared/types'

export function resolveSelectedGraphBlock(
  blocks: Block[],
  selectedBlockId: string | null,
  selectedBlockFallback: Block | null,
): Block | null {
  if (!selectedBlockId) {
    return null
  }

  return blocks.find((block) => block.id === selectedBlockId)
    ?? (selectedBlockFallback?.id === selectedBlockId ? selectedBlockFallback : null)
}
