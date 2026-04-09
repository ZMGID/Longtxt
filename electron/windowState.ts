export interface RectangleLike {
  x: number
  y: number
  width: number
  height: number
}

export interface SavedWindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized?: boolean
}

interface NormalizeWindowStateOptions {
  savedState: SavedWindowState | null
  workArea: RectangleLike
  defaultWidth: number
  defaultHeight: number
  minWidth: number
  minHeight: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function parseSavedWindowState(raw: string | null): SavedWindowState | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SavedWindowState>

    if (!isFiniteNumber(parsed.width) || !isFiniteNumber(parsed.height)) {
      return null
    }

    return {
      width: Math.round(parsed.width),
      height: Math.round(parsed.height),
      ...(isFiniteNumber(parsed.x) ? { x: Math.round(parsed.x) } : {}),
      ...(isFiniteNumber(parsed.y) ? { y: Math.round(parsed.y) } : {}),
      ...(typeof parsed.isMaximized === 'boolean' ? { isMaximized: parsed.isMaximized } : {}),
    }
  } catch {
    return null
  }
}

export function normalizeSavedWindowState(options: NormalizeWindowStateOptions): SavedWindowState {
  const {
    savedState,
    workArea,
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
  } = options

  const maxWidth = Math.max(minWidth, workArea.width)
  const maxHeight = Math.max(minHeight, workArea.height)
  const width = clamp(savedState?.width ?? defaultWidth, minWidth, maxWidth)
  const height = clamp(savedState?.height ?? defaultHeight, minHeight, maxHeight)

  if (!isFiniteNumber(savedState?.x) || !isFiniteNumber(savedState?.y)) {
    return {
      width,
      height,
      ...(savedState?.isMaximized ? { isMaximized: true } : {}),
    }
  }

  const maxX = workArea.x + Math.max(0, workArea.width - width)
  const maxY = workArea.y + Math.max(0, workArea.height - height)

  return {
    x: clamp(savedState.x, workArea.x, maxX),
    y: clamp(savedState.y, workArea.y, maxY),
    width,
    height,
    ...(savedState.isMaximized ? { isMaximized: true } : {}),
  }
}
