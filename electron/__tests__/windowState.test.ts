// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { normalizeSavedWindowState, parseSavedWindowState } from '../windowState'

describe('window state helpers', () => {
  it('parses valid saved window state payloads', () => {
    expect(parseSavedWindowState('{"x":24,"y":48,"width":1300,"height":900,"isMaximized":true}')).toEqual({
      x: 24,
      y: 48,
      width: 1300,
      height: 900,
      isMaximized: true,
    })
  })

  it('drops invalid payloads', () => {
    expect(parseSavedWindowState('{"width":"wide","height":900}')).toBeNull()
    expect(parseSavedWindowState('{oops')).toBeNull()
  })

  it('clamps restored bounds into the current work area', () => {
    expect(normalizeSavedWindowState({
      savedState: {
        x: -400,
        y: 2000,
        width: 3000,
        height: 200,
      },
      workArea: {
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
      },
      defaultWidth: 1220,
      defaultHeight: 820,
      minWidth: 620,
      minHeight: 560,
    })).toEqual({
      x: 0,
      y: 340,
      width: 1440,
      height: 560,
    })
  })

  it('falls back to default size when no saved position is available', () => {
    expect(normalizeSavedWindowState({
      savedState: null,
      workArea: {
        x: 0,
        y: 0,
        width: 900,
        height: 700,
      },
      defaultWidth: 1220,
      defaultHeight: 820,
      minWidth: 620,
      minHeight: 560,
    })).toEqual({
      width: 900,
      height: 700,
    })
  })
})
