import type { ExternalAccessStatus } from '../../../../shared/types'
import type { AppLanguage } from '../../../i18n/locale'
import { ActionButton } from '../../ui/ActionButton'
import { SettingsGroup, SettingsRow } from '../common'
import { formatExternalAccessTime, localize, renderMonospaceValue } from '../utils'

interface ExternalAccessSectionProps {
  externalAccessStatus: ExternalAccessStatus | null
  externalAccessBusy: boolean
  externalAccessBusyAction?: 'enable' | 'generate' | 'disable' | 'open' | 'refresh' | null
  onEnableExternalAccess: () => Promise<void>
  onGenerateExternalAccessBundle: () => Promise<void>
  onDisableExternalAccess: () => Promise<void>
  onRefreshExternalAccess: () => Promise<void>
  onOpenExternalAccessDirectory: () => Promise<void>
  onCopyCommand: () => Promise<void>
  language: AppLanguage
}

export function ExternalAccessSection({
  externalAccessStatus,
  externalAccessBusy,
  externalAccessBusyAction,
  onEnableExternalAccess,
  onGenerateExternalAccessBundle,
  onDisableExternalAccess,
  onRefreshExternalAccess,
  onOpenExternalAccessDirectory,
  onCopyCommand,
  language,
}: ExternalAccessSectionProps) {
  return (
    <div className="space-y-10">
      <SettingsGroup title={localize(language, '快速操作', 'Quick actions')}>
        <SettingsRow
          title={localize(language, '接入开关', 'Access switch')}
          description={
            externalAccessStatus
              ? externalAccessStatus.enabled
                ? localize(language, '当前已启用。CLI 在执行真实读写前会检查这个状态。', 'Currently enabled. The CLI checks this state before performing real reads or writes.')
                : localize(language, '当前未启用。先启用，外部工具才可以真正读写长布内容。', 'Currently disabled. Enable it first so external tools can actually read and write Changbu data.')
              : localize(language, '正在读取外部接入状态。', 'Loading external access status.')
          }
          control={
            <>
              <ActionButton
                primary
                disabled={externalAccessBusy || externalAccessStatus?.enabled === true}
                onClick={() => {
                  void onEnableExternalAccess()
                }}
                testId="settings-enable-external-access"
              >
                {externalAccessBusyAction === 'enable' ? localize(language, '启用中…', 'Enabling…') : localize(language, '启用接入', 'Enable access')}
              </ActionButton>
              <ActionButton
                disabled={externalAccessBusy || !externalAccessStatus?.enabled}
                onClick={() => {
                  void onDisableExternalAccess()
                }}
                testId="settings-disable-external-access"
              >
                {externalAccessBusyAction === 'disable' ? localize(language, '停用中…', 'Disabling…') : localize(language, '停用接入', 'Disable access')}
              </ActionButton>
              <ActionButton
                disabled={externalAccessBusy}
                onClick={() => {
                  void onRefreshExternalAccess()
                }}
                testId="settings-refresh-external-access"
              >
                {externalAccessBusyAction === 'refresh' ? localize(language, '刷新中…', 'Refreshing…') : localize(language, '刷新状态', 'Refresh status')}
              </ActionButton>
            </>
          }
        />
        <SettingsRow
          title={localize(language, '生成接入包', 'Generate bundle')}
          description={localize(language, '生成物统一放在长布自己的接入目录里。你要给 Claude、Codex 或别的工具用，都从这里拿。', 'All generated files live in Changbu\'s own external-access directory. Use this bundle for Claude, Codex, or any other tool.')}
          control={
            <>
              <ActionButton
                primary
                disabled={externalAccessBusy}
                onClick={() => {
                  void onGenerateExternalAccessBundle()
                }}
                testId="settings-generate-external-access"
              >
                {externalAccessBusyAction === 'generate' ? localize(language, '生成中…', 'Generating…') : externalAccessStatus?.generatedAt ? localize(language, '重新生成接入包', 'Regenerate bundle') : localize(language, '生成接入包', 'Generate bundle')}
              </ActionButton>
              <ActionButton
                disabled={externalAccessBusy || !externalAccessStatus}
                onClick={() => {
                  void onOpenExternalAccessDirectory()
                }}
                testId="settings-open-external-access-directory"
              >
                {externalAccessBusyAction === 'open' ? localize(language, '打开中…', 'Opening…') : localize(language, '打开接入目录', 'Open bundle directory')}
              </ActionButton>
              <ActionButton
                disabled={!externalAccessStatus}
                onClick={() => {
                  void onCopyCommand()
                }}
                testId="settings-copy-external-access-command"
              >
                {localize(language, '复制示例查询命令', 'Copy sample search command')}
              </ActionButton>
            </>
          }
        />
        <SettingsRow
          title={localize(language, '当前结果', 'Current result')}
          description={
            externalAccessStatus
              ? [
                  `${localize(language, '接入', 'Access')}: ${externalAccessStatus.enabled ? localize(language, '已启用', 'enabled') : localize(language, '未启用', 'disabled')}`,
                  `CLI: ${externalAccessStatus.cliExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                  `${localize(language, '总说明', 'README')}: ${externalAccessStatus.integrationReadmeExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                  `${localize(language, '通用规则', 'AGENTS')}: ${externalAccessStatus.agentGuideExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                  `${localize(language, '适配器', 'Adapters')}: ${externalAccessStatus.skillExists ? localize(language, '已生成', 'generated') : localize(language, '未生成', 'missing')}`,
                ].join(' · ')
              : localize(language, '正在读取状态。', 'Loading status.')
          }
        />
      </SettingsGroup>

      <SettingsGroup title={localize(language, '生成产物', 'Generated files')}>
        <SettingsRow
          title={localize(language, '接入包目录', 'Bundle directory')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliDirectory) : localize(language, '生成后会显示接入包根目录。', 'The bundle root directory appears after generation.')}
        />
        <SettingsRow
          title={localize(language, 'CLI 路径', 'CLI path')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.cliPath) : localize(language, '生成后会显示本地 CLI 包装脚本路径。', 'The local CLI wrapper path appears after generation.')}
        />
        <SettingsRow
          title="README"
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.integrationReadmePath) : localize(language, '生成后会显示通用接入说明 README。', 'The shared integration README appears after generation.')}
        />
        <SettingsRow
          title="AGENTS"
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.agentGuidePath) : localize(language, '生成后会显示可复用的 AGENTS.md 提示文件。', 'A reusable AGENTS.md prompt file appears after generation.')}
        />
        <SettingsRow
          title={localize(language, '命令说明', 'Commands guide')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.commandsGuidePath) : localize(language, '生成后会显示 CLI 命令说明。', 'The CLI commands guide appears after generation.')}
        />
        <SettingsRow
          title={localize(language, '工作流说明', 'Workflow guide')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.workflowsGuidePath) : localize(language, '生成后会显示检索与写入工作流说明。', 'The search and write workflow guide appears after generation.')}
        />
        <SettingsRow
          title={localize(language, '示例目录', 'Examples directory')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.examplesDirectory) : localize(language, '生成后会显示 examples 目录。', 'The examples directory appears after generation.')}
        />
        <SettingsRow
          title={localize(language, '适配器目录', 'Adapters directory')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.adaptersDirectory) : localize(language, '生成后会显示 adapters 目录。', 'The adapters directory appears after generation.')}
        />
        <SettingsRow
          title={localize(language, 'Claude 模板目录', 'Claude template directory')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.skillDirectory) : localize(language, '生成后会显示 Claude 模板目录。', 'The Claude template directory appears after generation.')}
        />
        <SettingsRow
          title={localize(language, '可执行文件', 'Executable')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.executablePath) : localize(language, '加载中…', 'Loading…')}
        />
        <SettingsRow
          title={localize(language, '最近生成时间', 'Last generated')}
          description={formatExternalAccessTime(externalAccessStatus?.generatedAt ?? null, language)}
        />
        <SettingsRow
          title={localize(language, '自检命令', 'Doctor command')}
          description={externalAccessStatus ? renderMonospaceValue(externalAccessStatus.doctorCommand) : localize(language, '生成后会显示 doctor 命令。', 'The doctor command appears after generation.')}
        />
      </SettingsGroup>

      <SettingsGroup title={localize(language, '问题与说明', 'Issues and notes')}>
        <SettingsRow
          title={localize(language, '当前问题', 'Current issues')}
          description={
            externalAccessStatus
              ? externalAccessStatus.issues.length > 0
                ? (
                  <ul className="space-y-1">
                    {externalAccessStatus.issues.map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                )
                : localize(language, '没有检测到问题。', 'No issues detected.')
              : localize(language, '正在读取状态。', 'Loading status.')
          }
        />
        <SettingsRow
          title={localize(language, '说明', 'Notes')}
          description={localize(language, '这里默认生成的是完整通用接入包：包含 guides、examples 和 adapters。Claude 只是 adapters 里的一个模板，不再自动塞进它自己的目录。外部 CLI 目前支持 search、tag、get、list、create、update、remove、tags、doctor。', 'By default this generates a full generic bundle with guides, examples, and adapters. Claude is only one template inside adapters and is no longer copied into its own directory automatically. The external CLI currently supports search, tag, get, list, create, update, remove, tags, and doctor.')}
        />
      </SettingsGroup>
    </div>
  )
}
