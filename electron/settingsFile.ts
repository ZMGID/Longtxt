import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const SETTINGS_FILE_VERSION = 1
const SETTINGS_FILE_NAME = 'changbu-settings.json'
const SETTINGS_FILE_LOCK_STALE_MS = 5_000
const SETTINGS_FILE_LOCK_TIMEOUT_MS = 5_000
const SETTINGS_FILE_LOCK_WAIT_MS = 25
const settingsFileSleepBuffer = new Int32Array(new SharedArrayBuffer(4))

interface SettingsFileDocument {
  version: number
  settings: Record<string, string>
}

export interface SettingsFileStore {
  filePath: string
  get(key: string): string | null
  set(key: string, value: string): void
}

function sleepSync(ms: number): void {
  Atomics.wait(settingsFileSleepBuffer, 0, 0, ms)
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

function releaseSettingsFileLock(lockPath: string): void {
  try {
    unlinkSync(lockPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }
}

function withSettingsFileLock<T>(filePath: string, task: () => T): T {
  mkdirSync(dirname(filePath), { recursive: true })

  const lockPath = `${filePath}.lock`
  const deadline = Date.now() + SETTINGS_FILE_LOCK_TIMEOUT_MS

  while (true) {
    try {
      const fileDescriptor = openSync(lockPath, 'wx')
      closeSync(fileDescriptor)
      break
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException

      if (nodeError.code !== 'EEXIST') {
        throw error
      }

      try {
        const ageMs = Date.now() - statSync(lockPath).mtimeMs

        if (ageMs >= SETTINGS_FILE_LOCK_STALE_MS) {
          releaseSettingsFileLock(lockPath)
          continue
        }
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code === 'ENOENT') {
          continue
        }

        throw statError
      }

      if (Date.now() >= deadline) {
        throw new Error(`Timed out acquiring settings file lock for ${filePath}`)
      }

      sleepSync(SETTINGS_FILE_LOCK_WAIT_MS)
    }
  }

  try {
    return task()
  } finally {
    releaseSettingsFileLock(lockPath)
  }
}

export function readSettingFromDisk(filePath: string, key: string): string | null {
  return readSettingsFile(filePath)[key] ?? null
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
    settings = withSettingsFileLock(filePath, () => {
      const latestSettings = readSettingsFile(filePath)

      if (existsSync(filePath)) {
        return latestSettings
      }

      const initialSettings = Object.keys(latestSettings).length > 0 ? latestSettings : settings
      writeSettingsFile(filePath, initialSettings)
      return initialSettings
    })
  }

  return {
    filePath,
    get(key) {
      settings = readSettingsFile(filePath)
      return settings[key] ?? null
    },
    set(key, value) {
      settings = withSettingsFileLock(filePath, () => {
        const nextSettings = {
          ...readSettingsFile(filePath),
          [key]: value,
        }
        writeSettingsFile(filePath, nextSettings)
        return nextSettings
      })
    },
  }
}
