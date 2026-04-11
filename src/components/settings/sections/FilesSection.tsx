import type { AppLanguage } from '../../../i18n/locale'
import { ActionButton } from '../../ui/ActionButton'
import { SettingsGroup, SettingsRow } from '../common'
import { localize } from '../utils'

interface FilesSectionProps {
  onOpenDataDirectory: () => Promise<void>
  onOpenSettingsDirectory: () => Promise<void>
  language: AppLanguage
  fileActionPending: 'data-directory' | 'settings-directory' | null
  onFileAction: (action: 'data-directory' | 'settings-directory', task: () => Promise<void>, fallbackMessage: string) => Promise<void>
}

export function FilesSection({
  onOpenDataDirectory,
  onOpenSettingsDirectory,
  language,
  fileActionPending,
  onFileAction,
}: FilesSectionProps) {
  return (
    <SettingsGroup title={localize(language, '本地文件', 'Local files')}>
      <SettingsRow
        title={localize(language, '打开数据目录', 'Open data directory')}
        description={localize(language, '查看数据库、附件等运行数据。', 'Inspect runtime data such as the database and attachments.')}
        control={
          <ActionButton
            onClick={() => {
              void onFileAction('data-directory', onOpenDataDirectory, localize(language, '打开数据目录失败。', 'Failed to open data directory.'))
            }}
            disabled={fileActionPending !== null}
          >
            {localize(language, '打开数据目录', 'Open data directory')}
          </ActionButton>
        }
      />
      <SettingsRow
        title={localize(language, '打开设置文件目录', 'Open settings directory')}
        description={localize(language, '查看 changbu-settings.json 等持久化配置文件。', 'Inspect persisted config files such as changbu-settings.json.')}
        control={
          <ActionButton
            onClick={() => {
              void onFileAction('settings-directory', onOpenSettingsDirectory, localize(language, '打开设置文件目录失败。', 'Failed to open settings directory.'))
            }}
            disabled={fileActionPending !== null}
          >
            {localize(language, '打开设置文件目录', 'Open settings directory')}
          </ActionButton>
        }
      />
    </SettingsGroup>
  )
}
