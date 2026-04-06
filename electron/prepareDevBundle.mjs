import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const APP_NAME = '长布'
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(scriptDirectory, '..')
const electronAppRoot = join(projectRoot, 'node_modules', 'electron', 'dist', 'Electron.app')
const infoPlistPath = join(electronAppRoot, 'Contents', 'Info.plist')
const iconSourcePath = join(projectRoot, 'build', 'icon.icns')
const iconTargetPath = join(electronAppRoot, 'Contents', 'Resources', 'electron.icns')

function replacePlistString(content, key, value) {
  return content.replace(new RegExp(`(<key>${key}</key>\\s*<string>)([^<]*)(</string>)`), `$1${value}$3`)
}

if (process.platform !== 'darwin') {
  process.exit(0)
}

if (!existsSync(infoPlistPath) || !existsSync(iconSourcePath)) {
  process.exit(0)
}

const originalPlist = readFileSync(infoPlistPath, 'utf8')
const nextPlist = replacePlistString(replacePlistString(originalPlist, 'CFBundleDisplayName', APP_NAME), 'CFBundleName', APP_NAME)

if (nextPlist !== originalPlist) {
  writeFileSync(infoPlistPath, nextPlist, 'utf8')
}

copyFileSync(iconSourcePath, iconTargetPath)
