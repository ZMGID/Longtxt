// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createSettingsFileStore, readSettingFromDisk, resolveSettingsFilePath } from '../settingsFile'

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    const directory = directories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('settings file store', () => {
  it('resolves production data directories to a sibling settings file', () => {
    expect(resolveSettingsFilePath('/tmp/changbu/data')).toBe('/tmp/changbu/changbu-settings.json')
    expect(resolveSettingsFilePath('/tmp/changbu-test-123')).toBe('/tmp/changbu-test-123/changbu-settings.json')
  })

  it('creates a standalone settings file and persists values there', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changbu-settings-file-'))
    directories.push(directory)
    const filePath = join(directory, 'changbu-settings.json')
    const store = createSettingsFileStore({
      filePath,
      seedValues: {
        ai_config: '{"llm":{"endpoint":"https://api.example.com"}}',
      },
    })

    expect(existsSync(filePath)).toBe(true)
    expect(store.get('ai_config')).toContain('api.example.com')

    store.set('ui_settings', '{"showMiniTimeline":false,"language":"en"}')

    const saved = JSON.parse(readFileSync(filePath, 'utf8')) as {
      version: number
      settings: Record<string, string>
    }

    expect(saved.version).toBe(1)
    expect(saved.settings.ai_config).toContain('api.example.com')
    expect(saved.settings.ui_settings).toBe('{"showMiniTimeline":false,"language":"en"}')
    expect(readSettingFromDisk(filePath, 'ui_settings')).toBe('{"showMiniTimeline":false,"language":"en"}')
  })

  it('merges updates from multiple store instances without overwriting unrelated keys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changbu-settings-file-'))
    directories.push(directory)
    const filePath = join(directory, 'changbu-settings.json')
    const firstStore = createSettingsFileStore({ filePath })
    const secondStore = createSettingsFileStore({ filePath })

    firstStore.set('ui_settings', '{"showMiniTimeline":true,"language":"zh"}')
    secondStore.set('main_window_state', '{"width":1400,"height":900}')

    const saved = JSON.parse(readFileSync(filePath, 'utf8')) as {
      version: number
      settings: Record<string, string>
    }

    expect(saved.settings.ui_settings).toBe('{"showMiniTimeline":true,"language":"zh"}')
    expect(saved.settings.main_window_state).toBe('{"width":1400,"height":900}')
    expect(readSettingFromDisk(filePath, 'main_window_state')).toBe('{"width":1400,"height":900}')
    expect(secondStore.get('ui_settings')).toBe('{"showMiniTimeline":true,"language":"zh"}')
  })

  it('recovers from a stale settings lock file before writing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'changbu-settings-file-'))
    directories.push(directory)
    const filePath = join(directory, 'changbu-settings.json')
    const lockPath = `${filePath}.lock`
    const store = createSettingsFileStore({ filePath })

    writeFileSync(lockPath, 'stale lock')
    const staleTime = new Date(Date.now() - 10_000)
    utimesSync(lockPath, staleTime, staleTime)

    store.set('ui_settings', '{"showMiniTimeline":false,"language":"en"}')

    expect(readSettingFromDisk(filePath, 'ui_settings')).toBe('{"showMiniTimeline":false,"language":"en"}')
    expect(existsSync(lockPath)).toBe(false)
  })
})
