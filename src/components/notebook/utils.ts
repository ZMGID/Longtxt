import type { Notebook, NotebookSummary } from '../../../shared/types'

export type NotebookLayoutMode = 'two-pane' | 'single-pane'
export type NotebookPanelMode = 'docked' | 'collapsed'

interface NotebookStats {
  itemCount: number
  blockCount: number
  structureCount: number
}

export const SINGLE_PANE_BREAKPOINT = 980
export function resolveLayoutMode(width: number): NotebookLayoutMode {
  return width < SINGLE_PANE_BREAKPOINT ? 'single-pane' : 'two-pane'
}

export function reorderItemIds(itemIds: string[], activeIndex: number, targetIndex: number): string[] {
  if (activeIndex === targetIndex || activeIndex < 0 || targetIndex < 0 || activeIndex >= itemIds.length || targetIndex >= itemIds.length) {
    return itemIds
  }

  const next = [...itemIds]
  const [moved] = next.splice(activeIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function moveItemIds(itemIds: string[], activeId: string, targetId: string): string[] {
  return reorderItemIds(itemIds, itemIds.indexOf(activeId), itemIds.indexOf(targetId))
}

export function notebookListSummaryLabel(notebook: Pick<NotebookSummary, keyof NotebookStats>): string {
  return `${notebook.itemCount} 项内容 · ${notebook.blockCount} 个引用块 / ${notebook.structureCount} 个结构项`
}

export function notebookHeaderSummaryLabel(notebook: Pick<Notebook, keyof NotebookStats>): string {
  return `${notebook.itemCount} 项内容 · ${notebook.blockCount} 个引用块 · ${notebook.structureCount} 个结构项`
}
