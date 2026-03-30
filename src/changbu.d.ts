import type { ChangbuApi } from '../shared/types'

declare global {
  interface Window {
    changbu: ChangbuApi
  }
}

export {}
