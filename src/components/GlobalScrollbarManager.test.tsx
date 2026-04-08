import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GlobalScrollbarManager,
  GLOBAL_SCROLLBAR_ACTIVE_CLASS,
  GLOBAL_SCROLLBAR_IDLE_DELAY_MS,
} from './GlobalScrollbarManager'

describe('GlobalScrollbarManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.documentElement.classList.remove(GLOBAL_SCROLLBAR_ACTIVE_CLASS)
  })

  afterEach(() => {
    cleanup()
    document.documentElement.classList.remove(GLOBAL_SCROLLBAR_ACTIVE_CLASS)
    vi.useRealTimers()
  })

  it('shows the global scrollbar class while scrolling and removes it after idle timeout', () => {
    render(<GlobalScrollbarManager />)

    window.dispatchEvent(new WheelEvent('wheel'))
    expect(document.documentElement.classList.contains(GLOBAL_SCROLLBAR_ACTIVE_CLASS)).toBe(true)

    vi.advanceTimersByTime(GLOBAL_SCROLLBAR_IDLE_DELAY_MS - 1)
    expect(document.documentElement.classList.contains(GLOBAL_SCROLLBAR_ACTIVE_CLASS)).toBe(true)

    vi.advanceTimersByTime(1)
    expect(document.documentElement.classList.contains(GLOBAL_SCROLLBAR_ACTIVE_CLASS)).toBe(false)
  })

  it('clears the global scrollbar class on unmount', () => {
    const view = render(<GlobalScrollbarManager />)

    window.dispatchEvent(new Event('scroll'))
    expect(document.documentElement.classList.contains(GLOBAL_SCROLLBAR_ACTIVE_CLASS)).toBe(true)

    view.unmount()
    expect(document.documentElement.classList.contains(GLOBAL_SCROLLBAR_ACTIVE_CLASS)).toBe(false)
  })
})
