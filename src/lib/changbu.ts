import type { ChangbuApi } from '../../shared/types'

function getApi(): ChangbuApi {
  if (!window.changbu) {
    throw new Error('长布桌面 API 尚未注入。请通过 Electron 启动应用。')
  }

  return window.changbu
}

export const changbu = {
  get blocks() {
    return getApi().blocks
  },
  get search() {
    return getApi().search
  },
  get attachments() {
    return getApi().attachments
  },
  get graph() {
    return getApi().graph
  },
  get tags() {
    return getApi().tags
  },
  get snapshots() {
    return getApi().snapshots
  },
  get exports() {
    return getApi().exports
  },
  get imports() {
    return getApi().imports
  },
  get settings() {
    return getApi().settings
  },
  get events() {
    return getApi().events
  },
}
