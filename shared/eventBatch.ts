import type { AppEventBatch, Block, BlockChangedEvent, LightweightBlockChangedEvent } from './types'

function createSyntheticDeletedBlock(blockId: string): Block {
  return {
    id: blockId,
    content: '',
    summary: null,
    tags: [],
    createdAt: '',
    updatedAt: '',
    status: 'ready',
    aiMode: 'mock',
    errorMessage: null,
  }
}

export function hydrateBlockChangedEvent(
  change: LightweightBlockChangedEvent,
  batch: Pick<AppEventBatch, 'blockPayloads'>,
): BlockChangedEvent | null {
  if (change.reason === 'deleted') {
    return {
      reason: change.reason,
      block: batch.blockPayloads[change.blockId] ?? createSyntheticDeletedBlock(change.blockId),
    }
  }

  const block = batch.blockPayloads[change.blockId]

  if (!block) {
    return null
  }

  return {
    reason: change.reason,
    block,
  }
}

export function expandBlockChangedEvents(batch: AppEventBatch): BlockChangedEvent[] {
  return batch.blockChanges
    .map((change) => hydrateBlockChangedEvent(change, batch))
    .filter((event): event is BlockChangedEvent => Boolean(event))
}
