// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it } from 'vitest'

import { createSettingsFileStore, resolveSettingsFilePath } from '../settingsFile'

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

    store.set('ui_settings', '{"showMiniTimeline":false}')

    const saved = JSON.parse(readFileSync(filePath, 'utf8')) as {
      version: number
      settings: Record<string, string>
    }

    expect(saved.version).toBe(1)
    expect(saved.settings.ai_config).toContain('api.example.com')
    expect(saved.settings.ui_settings).toBe('{"showMiniTimeline":false}')
  })
})
