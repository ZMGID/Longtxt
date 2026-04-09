// @vitest-environment node

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createAppContext, type AppContext } from '../appContext'
import { formatExternalAccessDisplayExecutable } from '../externalAccess'

const createdContexts: AppContext[] = []
const createdDirectories: string[] = []

function makeTempDirectory(prefix: string): string {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  createdDirectories.push(directory)
  return directory
}

function makeContext() {
  const rootDirectory = makeTempDirectory('changbu-external-access-')
  const dataDirectory = join(rootDirectory, 'data')
  const settingsDirectory = join(rootDirectory, 'settings')
  const executablePath = join(rootDirectory, 'ChangbuExecutable')
  const settingsFilePath = join(settingsDirectory, 'changbu-settings.json')
  const openPath = vi.fn(async () => '')

  writeFileSync(executablePath, '#!/bin/sh\nexit 0\n', 'utf8')

  const context = createAppContext({
    dataDirectory,
    settingsFilePath,
    cliLaunchSpec: {
      executablePath,
      args: ['--inspect-test'],
    },
    openPath,
  })

  createdContexts.push(context)

  return {
    context,
    rootDirectory,
    settingsDirectory,
    executablePath,
    openPath,
  }
}

afterEach(() => {
  while (createdContexts.length > 0) {
    createdContexts.pop()?.dispose()
  }

  while (createdDirectories.length > 0) {
    const directory = createdDirectories.pop()

    if (directory) {
      rmSync(directory, { recursive: true, force: true })
    }
  }
})

describe('external access integration', () => {
  it('formats Windows display commands with a PowerShell call operator', () => {
    expect(formatExternalAccessDisplayExecutable('C:\\Program Files\\Changbu\\changbu-notes.cmd', 'win32')).toBe(
      "& 'C:\\Program Files\\Changbu\\changbu-notes.cmd'",
    )
  })

  it('generates CLI wrapper and Claude skill through app context', async () => {
    const { context, settingsDirectory, executablePath, openPath } = makeContext()

    const initialStatus = await context.getExternalAccessStatus()
    expect(initialStatus.enabled).toBe(false)
    expect(initialStatus.available).toBe(false)
    expect(initialStatus.cliExists).toBe(false)
    expect(initialStatus.integrationReadmeExists).toBe(false)
    expect(initialStatus.agentGuideExists).toBe(false)
    expect(initialStatus.skillExists).toBe(false)
    expect(initialStatus.guidesDirectory).toContain('guides')
    expect(initialStatus.examplesDirectory).toContain('examples')
    expect(initialStatus.adaptersDirectory).toContain('adapters')
    expect(initialStatus.executablePath).toBe(executablePath)

    const enabledStatus = await context.setupExternalAccess()
    expect(enabledStatus.enabled).toBe(true)
    expect(enabledStatus.available).toBe(true)
    expect(enabledStatus.cliExists).toBe(true)
    expect(enabledStatus.integrationReadmeExists).toBe(true)
    expect(enabledStatus.agentGuideExists).toBe(true)
    expect(enabledStatus.skillExists).toBe(true)

    const cliPath = join(settingsDirectory, 'external-access', process.platform === 'win32' ? 'changbu-notes.cmd' : 'changbu-notes')
    const integrationReadmePath = join(settingsDirectory, 'external-access', 'README.md')
    const agentGuidePath = join(settingsDirectory, 'external-access', 'guides', 'AGENTS.md')
    const commandsGuidePath = join(settingsDirectory, 'external-access', 'guides', 'commands.md')
    const workflowsGuidePath = join(settingsDirectory, 'external-access', 'guides', 'workflows.md')
    const searchExamplePath = join(settingsDirectory, 'external-access', 'examples', 'search-and-verify.md')
    const crudExamplePath = join(settingsDirectory, 'external-access', 'examples', 'create-update-delete.md')
    const genericShellPath = join(settingsDirectory, 'external-access', 'adapters', 'generic-shell', 'AGENTS.md')
    const codexPath = join(settingsDirectory, 'external-access', 'adapters', 'codex', 'AGENTS.md')
    const cursorPath = join(settingsDirectory, 'external-access', 'adapters', 'cursor', 'AGENTS.md')
    const skillPath = join(settingsDirectory, 'external-access', 'adapters', 'claude-code', 'changbu-notes', 'SKILL.md')

    expect(existsSync(cliPath)).toBe(true)
    expect(existsSync(integrationReadmePath)).toBe(true)
    expect(existsSync(agentGuidePath)).toBe(true)
    expect(existsSync(commandsGuidePath)).toBe(true)
    expect(existsSync(workflowsGuidePath)).toBe(true)
    expect(existsSync(searchExamplePath)).toBe(true)
    expect(existsSync(crudExamplePath)).toBe(true)
    expect(existsSync(genericShellPath)).toBe(true)
    expect(existsSync(codexPath)).toBe(true)
    expect(existsSync(cursorPath)).toBe(true)
    expect(existsSync(skillPath)).toBe(true)

    const cliContent = readFileSync(cliPath, 'utf8')
    const integrationReadme = readFileSync(integrationReadmePath, 'utf8')
    const agentGuide = readFileSync(agentGuidePath, 'utf8')
    const commandsGuide = readFileSync(commandsGuidePath, 'utf8')
    const workflowsGuide = readFileSync(workflowsGuidePath, 'utf8')
    const genericShellGuide = readFileSync(genericShellPath, 'utf8')
    const codexGuide = readFileSync(codexPath, 'utf8')
    const cursorGuide = readFileSync(cursorPath, 'utf8')
    const skillContent = readFileSync(skillPath, 'utf8')

    expect(cliContent).toContain(executablePath)
    expect(cliContent).toContain('changbu-executable-base64:')
    expect(cliContent).toContain('--cli')
    expect(integrationReadme).toContain('完整的通用本地接入包')
    expect(integrationReadme).toContain('adapters/codex/AGENTS.md')
    expect(agentGuide).toContain('把长布当作用户个人知识库')
    expect(commandsGuide).toContain('长布 CLI 命令说明')
    expect(workflowsGuide).toContain('长布接入工作流')
    expect(genericShellGuide).toContain('把长布当作用户个人知识库')
    expect(codexGuide).toContain('Codex / Codex CLI 接入模板')
    expect(cursorGuide).toContain('Cursor Agent 接入模板')
    expect(skillContent).toContain('search "服务器信息" --limit 5 --json')
    expect(skillContent).toContain('changbu-notes')
    expect(skillContent).toContain('Search, read, create, update, and delete notes')

    await context.openExternalAccessDirectory()
    expect(openPath).toHaveBeenCalledWith(join(settingsDirectory, 'external-access'))

    const disabledStatus = await context.disableExternalAccess()
    expect(disabledStatus.enabled).toBe(false)
    expect(disabledStatus.available).toBe(false)
    expect(disabledStatus.issues).toContain('外部接入未启用。')
  })

  it('marks external access unavailable when wrapper points to a stale executable path', async () => {
    const { context, settingsDirectory } = makeContext()

    await context.setupExternalAccess()

    const cliPath = join(settingsDirectory, 'external-access', process.platform === 'win32' ? 'changbu-notes.cmd' : 'changbu-notes')
    const staleExecutablePath = join(settingsDirectory, 'Moved-ChangbuExecutable')
    const cliContent = readFileSync(cliPath, 'utf8')
    const staleCliContent = cliContent.replace(/changbu-executable-base64:[A-Za-z0-9+/=]+/, `changbu-executable-base64:${Buffer.from(staleExecutablePath, 'utf8').toString('base64')}`)

    writeFileSync(cliPath, staleCliContent, 'utf8')

    const status = await context.getExternalAccessStatus()

    expect(status.available).toBe(false)
    expect(status.issues).toContain('CLI 包装脚本仍指向旧的长布可执行文件，请重新生成。')
    expect(status.issues).toContain('CLI 包装脚本与当前长布可执行文件路径不一致，请重新生成。')
  })

  it('generates english guides and status output when ui language is english', async () => {
    const { context, settingsDirectory } = makeContext()
    await context.setSetting('ui_settings', JSON.stringify({
      showMiniTimeline: true,
      language: 'en',
    }))

    const enabledStatus = await context.setupExternalAccess()
    expect(enabledStatus.enabled).toBe(true)
    expect(enabledStatus.searchCommandExample).toContain('search "server info" --limit 5 --json')

    const integrationReadmePath = join(settingsDirectory, 'external-access', 'README.md')
    const agentGuidePath = join(settingsDirectory, 'external-access', 'guides', 'AGENTS.md')
    const skillPath = join(settingsDirectory, 'external-access', 'adapters', 'claude-code', 'changbu-notes', 'SKILL.md')

    const integrationReadme = readFileSync(integrationReadmePath, 'utf8')
    const agentGuide = readFileSync(agentGuidePath, 'utf8')
    const skillContent = readFileSync(skillPath, 'utf8')

    expect(integrationReadme).toContain('Changbu External Access')
    expect(agentGuide).toContain('Notes Integration')
    expect(skillContent).toContain('search "server info" --limit 5 --json')
  })
})
