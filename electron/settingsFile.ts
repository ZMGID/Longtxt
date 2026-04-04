import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SETTINGS_FILE_VERSION = 1
const SETTINGS_FILE_NAME = 'changbu-settings.json'

interface SettingsFileDocument {
  version: number
  settings: Record<string, string>
}

export interface SettingsFileStore {
  filePath: string
  get(key: string): string | null
  set(key: string, value: string): void
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return Object.values(value).every((item) => typeof item === 'string')
}

function writeSettingsFile(filePath: string, settings: Record<string, string>): void {
  mkdirSync(dirname(filePath), { recursive: true })

  const payload: SettingsFileDocument = {
    version: SETTINGS_FILE_VERSION,
    settings,
  }
  const tempPath = `${filePath}.tmp`

  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  renameSync(tempPath, filePath)
}

function readSettingsFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {}
  }

  try {
    const raw = readFileSync(filePath, 'utf8')

    if (!raw.trim()) {
      return {}
    }

    const parsed = JSON.parse(raw) as Partial<SettingsFileDocument>

    if (!isStringRecord(parsed.settings)) {
      return {}
    }

    return { ...parsed.settings }
  } catch (error) {
    console.warn('[changbu] failed to parse settings file, recreating it.', error)
    return {}
  }
}

export function resolveSettingsFilePath(dataDirectory: string): string {
  return basename(dataDirectory) === 'data'
    ? join(dirname(dataDirectory), SETTINGS_FILE_NAME)
    : join(dataDirectory, SETTINGS_FILE_NAME)
}

export function createSettingsFileStore(options: {
  filePath: string
  seedValues?: Record<string, string>
}): SettingsFileStore {
  const { filePath } = options
  const seedValues = options.seedValues ?? {}
  const fileExists = existsSync(filePath)
  let settings = readSettingsFile(filePath)

  if (!fileExists && Object.keys(seedValues).length > 0) {
    settings = { ...seedValues }
  }

  if (!fileExists) {
    writeSettingsFile(filePath, settings)
  }

  return {
    filePath,
    get(key) {
      return settings[key] ?? null
    },
    set(key, value) {
      settings = {
        ...settings,
        [key]: value,
      }
      writeSettingsFile(filePath, settings)
    },
  }
}
