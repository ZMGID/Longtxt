import type { Block, BlockBatchRemoveResult } from '../../shared/types'
import { changbu } from './changbu'

function isMissingHandlerError(error: unknown, channel: string): boolean {
  return error instanceof Error && error.message.includes(`No handler registered for '${channel}'`)
}

export async function listBlocksByDateCompat(date: string): Promise<Block[]> {
  try {
    return await changbu.blocks.listByDate(date)
  } catch (error) {
    if (!isMissingHandlerError(error, 'blocks:list-by-date')) {
      throw error
    }

    const detail = await changbu.calendar.getDayDetail(date)
    return detail.blocks
  }
}

export async function removeBlocksCompat(ids: string[]): Promise<BlockBatchRemoveResult> {
  const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)))

  if (uniqueIds.length === 0) {
    return {
      removed: 0,
      removedIds: [],
    }
  }

  try {
    return await changbu.blocks.removeMany(uniqueIds)
  } catch (error) {
    if (!isMissingHandlerError(error, 'blocks:remove-many')) {
      throw error
    }

    for (const id of uniqueIds) {
      await changbu.blocks.remove(id)
    }

    return {
      removed: uniqueIds.length,
      removedIds: uniqueIds,
    }
  }
}
