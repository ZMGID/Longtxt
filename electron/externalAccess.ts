import { constants } from 'node:fs'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { APP_NAME } from '../shared/config'
import type { ExternalAccessSettings, ExternalAccessStatus } from '../shared/types'

export interface ExternalAccessCliLaunchSpec {
  executablePath: string
  args?: string[]
}

export interface ExternalAccessOptions {
  settingsFilePath: string
  cliLaunchSpec: ExternalAccessCliLaunchSpec
  skillRootDirectory?: string
}

interface ExternalAccessPaths {
  cliDirectory: string
  cliPath: string
  guidesDirectory: string
  integrationReadmePath: string
  agentGuidePath: string
  commandsGuidePath: string
  workflowsGuidePath: string
  examplesDirectory: string
  searchExamplePath: string
  crudExamplePath: string
  adaptersDirectory: string
  genericShellGuidePath: string
  codexGuidePath: string
  cursorGuidePath: string
  skillDirectory: string
  skillFilePath: string
}

const COMMAND_NAME = 'changbu-notes'
const SKILL_DIRECTORY_NAME = 'changbu-notes'

function quotePosixArg(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`
}

function quoteWindowsArg(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function quotePowerShellArg(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

export function formatExternalAccessDisplayExecutable(
  executablePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    return `& ${quotePowerShellArg(executablePath)}`
  }

  return quotePosixArg(executablePath)
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

function resolveExternalAccessPaths(options: ExternalAccessOptions): ExternalAccessPaths {
  const cliDirectory = join(dirname(options.settingsFilePath), 'external-access')
  const cliFilename = process.platform === 'win32' ? `${COMMAND_NAME}.cmd` : COMMAND_NAME
  const guidesDirectory = join(cliDirectory, 'guides')
  const examplesDirectory = join(cliDirectory, 'examples')
  const adaptersDirectory = join(cliDirectory, 'adapters')
  const skillRootDirectory = options.skillRootDirectory ?? join(adaptersDirectory, 'claude-code')
  const skillDirectory = join(skillRootDirectory, SKILL_DIRECTORY_NAME)

  return {
    cliDirectory,
    cliPath: join(cliDirectory, cliFilename),
    guidesDirectory,
    integrationReadmePath: join(cliDirectory, 'README.md'),
    agentGuidePath: join(guidesDirectory, 'AGENTS.md'),
    commandsGuidePath: join(guidesDirectory, 'commands.md'),
    workflowsGuidePath: join(guidesDirectory, 'workflows.md'),
    examplesDirectory,
    searchExamplePath: join(examplesDirectory, 'search-and-verify.md'),
    crudExamplePath: join(examplesDirectory, 'create-update-delete.md'),
    adaptersDirectory,
    genericShellGuidePath: join(adaptersDirectory, 'generic-shell', 'AGENTS.md'),
    codexGuidePath: join(adaptersDirectory, 'codex', 'AGENTS.md'),
    cursorGuidePath: join(adaptersDirectory, 'cursor', 'AGENTS.md'),
    skillDirectory,
    skillFilePath: join(skillDirectory, 'SKILL.md'),
  }
}

function encodeWrapperMetadata(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64')
}

function decodeWrapperMetadata(value: string): string | null {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf8').trim()
    return decoded || null
  } catch {
    return null
  }
}

function buildCliWrapper(options: ExternalAccessOptions): string {
  const commandArgs = [...(options.cliLaunchSpec.args ?? []), '--cli']
  const metadataExecutable = encodeWrapperMetadata(options.cliLaunchSpec.executablePath)
  const metadataArgs = encodeWrapperMetadata(JSON.stringify(commandArgs))

  if (process.platform === 'win32') {
    const head = quoteWindowsArg(options.cliLaunchSpec.executablePath)
    const tail = commandArgs.map(quoteWindowsArg).join(' ')
    return `@echo off\r\nREM changbu-executable-base64:${metadataExecutable}\r\nREM changbu-args-base64:${metadataArgs}\r\n${head}${tail ? ` ${tail}` : ''} %*\r\n`
  }

  const argv = [options.cliLaunchSpec.executablePath, ...commandArgs]
  return `#!/bin/sh\n# changbu-executable-base64:${metadataExecutable}\n# changbu-args-base64:${metadataArgs}\nexec ${argv.map(quotePosixArg).join(' ')} "$@"\n`
}

function parseQuotedPosixValue(rawValue: string): string | null {
  const match = rawValue.match(/^'((?:[^']|'\"'\"')+)'/)

  if (!match) {
    return null
  }

  return match[1].replace(/'\"'\"'/g, "'")
}

function extractWrapperExecutablePath(wrapperContent: string): string | null {
  const metadataMatch = wrapperContent.match(/(?:^|\r?\n)(?:#|REM)\s+changbu-executable-base64:([A-Za-z0-9+/=]+)/)
  const metadataValue = metadataMatch?.[1] ? decodeWrapperMetadata(metadataMatch[1]) : null

  if (metadataValue) {
    return metadataValue
  }

  const windowsMatch = wrapperContent.match(/(?:^|\r?\n)"([^"\r\n]+)"(?:\s|%)/)

  if (windowsMatch?.[1]) {
    return windowsMatch[1].trim() || null
  }

  const execMatch = wrapperContent.match(/(?:^|\r?\n)exec\s+(.+)/)
  const execCommand = execMatch?.[1]?.trim()

  if (!execCommand) {
    return null
  }

  return parseQuotedPosixValue(execCommand)
}

function areExecutablePathsEquivalent(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return false
  }

  const normalizeForCompare = (value: string) => process.platform === 'win32'
    ? value.trim().toLowerCase()
    : value.trim()

  return normalizeForCompare(left) === normalizeForCompare(right)
}

function buildSkillMarkdown(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `---
name: ${SKILL_DIRECTORY_NAME}
description: Search, read, create, update, and delete notes in ${APP_NAME} by calling the local ${COMMAND_NAME} CLI. Use this when the user asks about personal notes, server info, project context, saved facts, or anything stored in ${APP_NAME}.
---

# ${SKILL_DIRECTORY_NAME}

Use ${APP_NAME} as the source of truth for personal notes. Prefer querying ${APP_NAME} first instead of guessing from memory.

## Strategy

1. For broad questions, run \`${quotedCliPath} search "<query>" --limit 5 --json\`.
2. If several candidates come back, inspect the top block ids with \`${quotedCliPath} get <block-id> --json\`.
3. When the user wants a new note, use \`${quotedCliPath} create "<content>" --json\`.
4. When the user wants to modify or delete a note, use \`${quotedCliPath} update <block-id> "<content>" --json\` or \`${quotedCliPath} remove <block-id> --json\`.
5. Always mention the block id when you create, update, or delete something.

## Commands

- Search notes: \`${quotedCliPath} search "服务器信息" --limit 5 --json\`
- Search by tag: \`${quotedCliPath} tag "项目" --limit 10 --json\`
- Inspect one block: \`${quotedCliPath} get <block-id> --json\`
- List recent blocks: \`${quotedCliPath} list --limit 10 --json\`
- Create a block: \`${quotedCliPath} create "记录内容" --json\`
- Update a block: \`${quotedCliPath} update <block-id> "新的内容" --json\`
- Delete a block: \`${quotedCliPath} remove <block-id> --json\`
- Check access status: \`${quotedCliPath} doctor --json\`

## Rules

- Search before answering questions about stored knowledge.
- Use \`get\` for final confirmation when accuracy matters.
- Do not delete or overwrite notes unless the user clearly asks.
- If ${COMMAND_NAME} reports that external access is disabled, tell the user to re-enable it in ${APP_NAME} settings.
`
}

function buildIntegrationReadme(cliPath: string, skillDirectory: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 长布外部接入

这个目录提供的是**完整的通用本地接入包**，不依赖某一个 AI 工具。

核心思路只有一条：

- 任何支持 **shell / terminal** 的 AI 工具，都可以直接调用 \`${quotedCliPath}\`

## 包结构

- CLI 包装脚本：\`${cliPath}\`
- 总说明：\`README.md\`
- 通用指南：\`guides/\`
- 示例：\`examples/\`
- 各工具适配模板：\`adapters/\`

## guides/

- \`guides/AGENTS.md\`：最通用的一份接入规则
- \`guides/commands.md\`：CLI 命令说明
- \`guides/workflows.md\`：检索 / 确认 / 写入工作流

## examples/

- \`examples/search-and-verify.md\`
- \`examples/create-update-delete.md\`

## adapters/

- \`adapters/generic-shell/AGENTS.md\`
- \`adapters/codex/AGENTS.md\`
- \`adapters/cursor/AGENTS.md\`
- Claude / 其他支持 Skill 的模板目录：\`${skillDirectory}\`

## 推荐给其他工具的接入方式

1. 让工具具备 shell 执行能力
2. 优先使用 \`guides/AGENTS.md\` 作为通用规则
3. 再按工具选择 \`adapters/\` 里的对应模板
4. 让工具通过 CLI 来访问长布，而不是直接读数据库

## 推荐工作流

1. 先搜：\`${quotedCliPath} search "服务器信息" --limit 5 --json\`
2. 再确认：\`${quotedCliPath} get <block-id> --json\`
3. 再决定是否创建 / 更新 / 删除

## 常用命令

- 搜索：\`${quotedCliPath} search "关键词" --limit 5 --json\`
- 按标签搜索：\`${quotedCliPath} tag "标签名" --limit 10 --json\`
- 读取单条：\`${quotedCliPath} get <block-id> --json\`
- 列最近内容：\`${quotedCliPath} list --limit 10 --json\`
- 新建：\`${quotedCliPath} create "记录内容" --json\`
- 更新：\`${quotedCliPath} update <block-id> "新的内容" --json\`
- 删除：\`${quotedCliPath} remove <block-id> --json\`
- 列标签：\`${quotedCliPath} tags --json\`
- 自检：\`${quotedCliPath} doctor --json\`

## 适用范围

这套接入可以直接给下面这类工具复用：

- Claude Code
- Codex / Codex CLI
- Cursor Agent
- 任何支持本地 shell 的其他 agent / automation tool

只要它能执行本地命令，就能接长布。
`
}

function buildAgentGuide(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 长布笔记接入说明

把长布当作用户个人知识库，所有查询都优先通过本地 CLI 完成。

## 工具边界

- 只通过 \`${quotedCliPath}\` 访问长布内容
- 不要直接读数据库或自己猜测笔记内容

## 查询规则

1. 回答涉及笔记内容的问题前，先运行 \`${quotedCliPath} search "<query>" --limit 5 --json\`
2. 如果候选结果不止一个，继续运行 \`${quotedCliPath} get <block-id> --json\` 做确认
3. 高准确性问题必须先 get 再回答

## 写入规则

- 新建：\`${quotedCliPath} create "<content>" --json\`
- 更新：\`${quotedCliPath} update <block-id> "<content>" --json\`
- 删除：\`${quotedCliPath} remove <block-id> --json\`
- 任何创建、更新、删除动作都要回报 block id
- 如果用户没有明确要求，不要删除或覆盖已有内容

## 补充规则

- 用户按标签找内容时，用 \`${quotedCliPath} tag "<tagName>" --limit 10 --json\`
- 用户想看最近内容时，用 \`${quotedCliPath} list --limit 10 --json\`
- 如果 CLI 提示外部接入未启用，告知用户去长布设置里重新启用
`
}

function buildCommandsGuide(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 长布 CLI 命令说明

## 基本原则

- 所有命令都支持 \`--json\`
- 对外回答前，优先先查再读
- 真正写入前要确认用户意图

## 命令

- 自检：\`${quotedCliPath} doctor --json\`
- 搜索：\`${quotedCliPath} search "关键词" --limit 5 --json\`
- 标签搜索：\`${quotedCliPath} tag "标签名" --limit 10 --json\`
- 读取单条：\`${quotedCliPath} get <block-id> --json\`
- 列最近：\`${quotedCliPath} list --limit 10 --json\`
- 新建：\`${quotedCliPath} create "记录内容" --json\`
- 更新：\`${quotedCliPath} update <block-id> "新的内容" --json\`
- 删除：\`${quotedCliPath} remove <block-id> --json\`
- 列标签：\`${quotedCliPath} tags --json\`

## 推荐参数

- 一般搜索先用 \`--limit 5\`
- 标签浏览一般可用 \`--limit 10\`
- 需要稳定结构时一律加 \`--json\`
`
}

function buildWorkflowsGuide(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 长布接入工作流

## 1. 查询已有知识

1. 先搜：\`${quotedCliPath} search "<query>" --limit 5 --json\`
2. 如果结果不止一个，再读：\`${quotedCliPath} get <block-id> --json\`
3. 用读到的真实内容回答，不要靠猜

## 2. 按标签浏览

1. 用 \`${quotedCliPath} tag "<tagName>" --limit 10 --json\`
2. 如果需要确认内容，再对候选块执行 \`get\`

## 3. 新增记录

1. 直接执行 \`${quotedCliPath} create "<content>" --json\`
2. 返回 block id
3. 必要时提醒用户后续可继续补充或修改

## 4. 修改已有记录

1. 先搜到目标
2. 确认 block id
3. 执行 \`${quotedCliPath} update <block-id> "<content>" --json\`
4. 返回更新后的 block id

## 5. 删除记录

1. 先确认用户是明确要删
2. 再确认 block id
3. 执行 \`${quotedCliPath} remove <block-id> --json\`
`
}

function buildSearchExample(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 示例：搜索并确认

用户：在长布中查看我的服务器信息。

建议步骤：

1. 运行 \`${quotedCliPath} search "服务器信息" --limit 5 --json\`
2. 从结果里选最相关的 block id
3. 再运行 \`${quotedCliPath} get <block-id> --json\`
4. 根据真实内容回答
`
}

function buildCrudExample(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# 示例：新增、更新、删除

## 新增

\`${quotedCliPath} create "记录一条新的服务器备注" --json\`

## 更新

\`${quotedCliPath} update <block-id> "更新后的服务器备注" --json\`

## 删除

\`${quotedCliPath} remove <block-id> --json\`

任何写入动作结束后，都应该回报 block id。
`
}

function buildGenericShellAdapter(cliPath: string): string {
  return buildAgentGuide(cliPath)
}

function buildCodexAdapter(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# Codex / Codex CLI 接入模板

把长布当作外部知识库，优先使用本地 CLI，而不是直接读取数据库。

## 规则

- 先搜：\`${quotedCliPath} search "<query>" --limit 5 --json\`
- 再确认：\`${quotedCliPath} get <block-id> --json\`
- 写入时返回 block id
- 用户未明确要求时，不要删除内容
`
}

function buildCursorAdapter(cliPath: string): string {
  const quotedCliPath = formatExternalAccessDisplayExecutable(cliPath)

  return `# Cursor Agent 接入模板

当任务涉及长布里的用户笔记、事实、项目上下文时，优先调用本地 CLI。

## 推荐流程

1. \`${quotedCliPath} search "<query>" --limit 5 --json\`
2. 必要时 \`${quotedCliPath} get <block-id> --json\`
3. 如需写入，再执行 create / update / remove
`
}

export async function getExternalAccessStatus(
  settings: ExternalAccessSettings,
  options: ExternalAccessOptions,
): Promise<ExternalAccessStatus> {
  const paths = resolveExternalAccessPaths(options)
  const executablePath = options.cliLaunchSpec.executablePath
  const wrapperContent = await (async () => {
    if (!await pathExists(paths.cliPath)) {
      return null
    }

    try {
      return await readFile(paths.cliPath, 'utf8')
    } catch {
      return null
    }
  })()
  const wrapperExecutablePath = wrapperContent ? extractWrapperExecutablePath(wrapperContent) : null
  const [
    integrationReadmeExists,
    agentGuideExists,
    commandsGuideExists,
    workflowsGuideExists,
    searchExampleExists,
    crudExampleExists,
    genericShellGuideExists,
    codexGuideExists,
    cursorGuideExists,
    executableExists,
    cliExists,
    skillExists,
    wrapperExecutableExists,
  ] = await Promise.all([
    pathExists(paths.integrationReadmePath),
    pathExists(paths.agentGuidePath),
    pathExists(paths.commandsGuidePath),
    pathExists(paths.workflowsGuidePath),
    pathExists(paths.searchExamplePath),
    pathExists(paths.crudExamplePath),
    pathExists(paths.genericShellGuidePath),
    pathExists(paths.codexGuidePath),
    pathExists(paths.cursorGuidePath),
    pathExists(executablePath),
    pathExists(paths.cliPath),
    pathExists(paths.skillFilePath),
    wrapperExecutablePath ? pathExists(wrapperExecutablePath) : Promise.resolve(false),
  ])

  const issues: string[] = []

  if (!settings.enabled) {
    issues.push('外部接入未启用。')
  }

  if (settings.enabled && !executableExists) {
    issues.push('当前长布可执行文件不存在，CLI 无法启动。')
  }

  if (settings.enabled && !cliExists) {
    issues.push('本地 CLI 包装脚本还没有生成。')
  }

  if (settings.enabled && cliExists && !wrapperExecutablePath) {
    issues.push('CLI 包装脚本缺少有效的启动路径，请重新生成。')
  }

  if (settings.enabled && wrapperExecutablePath && !wrapperExecutableExists) {
    issues.push('CLI 包装脚本仍指向旧的长布可执行文件，请重新生成。')
  }

  if (settings.enabled && wrapperExecutablePath && !areExecutablePathsEquivalent(wrapperExecutablePath, executablePath)) {
    issues.push('CLI 包装脚本与当前长布可执行文件路径不一致，请重新生成。')
  }

  if (settings.enabled && !integrationReadmeExists) {
    issues.push('通用接入说明 README 还没有生成。')
  }

  if (settings.enabled && !agentGuideExists) {
    issues.push('通用 AGENTS 提示文件还没有生成。')
  }

  if (settings.enabled && !commandsGuideExists) {
    issues.push('命令说明还没有生成。')
  }

  if (settings.enabled && !workflowsGuideExists) {
    issues.push('工作流说明还没有生成。')
  }

  if (settings.enabled && (!searchExampleExists || !crudExampleExists)) {
    issues.push('示例文件还没有生成完整。')
  }

  if (settings.enabled && !genericShellGuideExists) {
    issues.push('generic-shell 适配模板还没有生成。')
  }

  if (settings.enabled && !codexGuideExists) {
    issues.push('Codex 适配模板还没有生成。')
  }

  if (settings.enabled && !cursorGuideExists) {
    issues.push('Cursor 适配模板还没有生成。')
  }

  if (settings.enabled && !skillExists) {
    issues.push('Claude Skill 模板还没有生成，但不影响通用 CLI 使用。')
  }

  return {
    enabled: settings.enabled,
    available: settings.enabled
      && executableExists
      && cliExists
      && Boolean(wrapperExecutablePath)
      && wrapperExecutableExists
      && areExecutablePathsEquivalent(wrapperExecutablePath, executablePath)
      && integrationReadmeExists
      && agentGuideExists
      && commandsGuideExists
      && workflowsGuideExists
      && searchExampleExists
      && crudExampleExists
      && genericShellGuideExists
      && codexGuideExists
      && cursorGuideExists,
    generatedAt: settings.generatedAt,
    skillTarget: settings.skillTarget,
    cliPath: paths.cliPath,
    cliDirectory: paths.cliDirectory,
    guidesDirectory: paths.guidesDirectory,
    integrationReadmePath: paths.integrationReadmePath,
    integrationReadmeExists,
    agentGuidePath: paths.agentGuidePath,
    agentGuideExists,
    commandsGuidePath: paths.commandsGuidePath,
    workflowsGuidePath: paths.workflowsGuidePath,
    examplesDirectory: paths.examplesDirectory,
    adaptersDirectory: paths.adaptersDirectory,
    skillDirectory: paths.skillDirectory,
    executablePath,
    executableExists,
    cliExists,
    skillExists,
    doctorCommand: `${formatExternalAccessDisplayExecutable(paths.cliPath)} doctor --json`,
    searchCommandExample: `${formatExternalAccessDisplayExecutable(paths.cliPath)} search "服务器信息" --limit 5 --json`,
    issues,
  }
}

export async function setupExternalAccessFiles(options: ExternalAccessOptions): Promise<void> {
  const paths = resolveExternalAccessPaths(options)

  await mkdir(paths.cliDirectory, { recursive: true })
  await mkdir(paths.guidesDirectory, { recursive: true })
  await mkdir(paths.examplesDirectory, { recursive: true })
  await mkdir(join(paths.adaptersDirectory, 'generic-shell'), { recursive: true })
  await mkdir(join(paths.adaptersDirectory, 'codex'), { recursive: true })
  await mkdir(join(paths.adaptersDirectory, 'cursor'), { recursive: true })
  await mkdir(paths.skillDirectory, { recursive: true })

  await writeFile(paths.cliPath, buildCliWrapper(options), 'utf8')
  await writeFile(paths.integrationReadmePath, buildIntegrationReadme(paths.cliPath, paths.skillDirectory), 'utf8')
  await writeFile(paths.agentGuidePath, buildAgentGuide(paths.cliPath), 'utf8')
  await writeFile(paths.commandsGuidePath, buildCommandsGuide(paths.cliPath), 'utf8')
  await writeFile(paths.workflowsGuidePath, buildWorkflowsGuide(paths.cliPath), 'utf8')
  await writeFile(paths.searchExamplePath, buildSearchExample(paths.cliPath), 'utf8')
  await writeFile(paths.crudExamplePath, buildCrudExample(paths.cliPath), 'utf8')
  await writeFile(paths.genericShellGuidePath, buildGenericShellAdapter(paths.cliPath), 'utf8')
  await writeFile(paths.codexGuidePath, buildCodexAdapter(paths.cliPath), 'utf8')
  await writeFile(paths.cursorGuidePath, buildCursorAdapter(paths.cliPath), 'utf8')

  if (process.platform !== 'win32') {
    await chmod(paths.cliPath, 0o755)
  }

  await writeFile(paths.skillFilePath, buildSkillMarkdown(paths.cliPath), 'utf8')
}
