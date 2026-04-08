import { useEffect } from 'react'

export const GLOBAL_SCROLLBAR_ACTIVE_CLASS = 'is-scrolling'
export const GLOBAL_SCROLLBAR_IDLE_DELAY_MS = 720

export function GlobalScrollbarManager() {
  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const root = document.documentElement
    let clearActiveTimer: ReturnType<typeof window.setTimeout> | null = null

    function stopShowingScrollbar(): void {
      root.classList.remove(GLOBAL_SCROLLBAR_ACTIVE_CLASS)
      if (clearActiveTimer) {
        window.clearTimeout(clearActiveTimer)
        clearActiveTimer = null
      }
    }

    function revealScrollbar(): void {
      root.classList.add(GLOBAL_SCROLLBAR_ACTIVE_CLASS)

      if (clearActiveTimer) {
        window.clearTimeout(clearActiveTimer)
      }

      clearActiveTimer = window.setTimeout(() => {
        root.classList.remove(GLOBAL_SCROLLBAR_ACTIVE_CLASS)
        clearActiveTimer = null
      }, GLOBAL_SCROLLBAR_IDLE_DELAY_MS)
    }

    const listenerOptions: AddEventListenerOptions = {
      passive: true,
      capture: true,
    }

    window.addEventListener('wheel', revealScrollbar, listenerOptions)
    window.addEventListener('touchmove', revealScrollbar, listenerOptions)
    window.addEventListener('scroll', revealScrollbar, listenerOptions)

    return () => {
      window.removeEventListener('wheel', revealScrollbar, listenerOptions)
      window.removeEventListener('touchmove', revealScrollbar, listenerOptions)
      window.removeEventListener('scroll', revealScrollbar, listenerOptions)
      stopShowingScrollbar()
    }
  }, [])

  return null
}
