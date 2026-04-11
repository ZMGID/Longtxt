import type { ImportConflictStrategy, ImportPreview } from '../../../../shared/types'
import type { AppLanguage } from '../../../i18n/locale'
import { ActionButton } from '../../ui/ActionButton'
import { SettingsGroup, SettingsRow } from '../common'
import { localize } from '../utils'

interface BackupSectionProps {
  importPreview: ImportPreview | null
  onCreateBackup: () => Promise<void>
  onLoadBackupPreview: () => Promise<void>
  onConfirmImport: (strategy: ImportConflictStrategy) => Promise<void>
  onDismissImportPreview: () => void
  language: AppLanguage
}

export function BackupSection({
  importPreview,
  onCreateBackup,
  onLoadBackupPreview,
  onConfirmImport,
  onDismissImportPreview,
  language,
}: BackupSectionProps) {
  const isEn = language === 'en'

  return (
    <div className="space-y-10">
      <SettingsGroup title={localize(language, '备份', 'Backups')}>
        <SettingsRow
          title={localize(language, '创建备份', 'Create backup')}
          description={localize(language, '导出当前块数据、附件和设置快照，适合完整迁移、归档和手动留档。', 'Export current blocks, attachments, and settings snapshots for migration, archiving, or manual safekeeping.')}
          control={
            <ActionButton primary onClick={() => { void onCreateBackup() }} testId="settings-create-backup">
              {localize(language, '创建备份', 'Create backup')}
            </ActionButton>
          }
        />
        <SettingsRow
          title={localize(language, '加载备份', 'Load backup')}
          description={localize(language, '读取 JSON 备份并先展示预览，再决定如何处理冲突。', 'Read a JSON backup, inspect the preview first, then decide how to handle conflicts.')}
          control={
            <ActionButton onClick={() => { void onLoadBackupPreview() }} testId="settings-load-backup">
              {localize(language, '加载备份', 'Load backup')}
            </ActionButton>
          }
        />
      </SettingsGroup>

      {importPreview ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4" data-testid="settings-import-preview">
          <div className="text-sm font-semibold text-amber-900">{localize(language, '备份预览', 'Backup preview')}</div>
          <div className="mt-1 text-xs leading-5 text-amber-800">
            {isEn
              ? `${importPreview.format.toUpperCase()} · ${importPreview.totalFiles} files / ${importPreview.totalBlocks} blocks · ${importPreview.conflicts} conflicts`
              : `${importPreview.format.toUpperCase()} · ${importPreview.totalFiles} 个文件 / ${importPreview.totalBlocks} 个块 · 冲突 ${importPreview.conflicts}`}
          </div>
          {importPreview.includesSettings ? (
            <div className="mt-1 text-xs leading-5 text-amber-800">
              {isEn
                ? `Includes settings snapshot · ${importPreview.settingsEntryCount ?? 0} settings entries will be restored during import`
                : `含设置快照 · ${importPreview.settingsEntryCount ?? 0} 项设置会在导入时一并恢复`}
            </div>
          ) : null}
          <div className="mt-3 space-y-1 text-xs text-amber-800">
            {importPreview.samples.map((sample) => (
              <p key={`${sample.filename}-${sample.preview}`}>{sample.filename}{isEn ? ': ' : '：'}{sample.preview}</p>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {importPreview.conflicts > 0 ? (
              <>
                <ActionButton onClick={() => { void onConfirmImport('skip_all') }}>
                  {localize(language, '全部跳过冲突', 'Skip all conflicts')}
                </ActionButton>
                <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                  {localize(language, '全部覆盖冲突', 'Overwrite all conflicts')}
                </ActionButton>
              </>
            ) : (
              <ActionButton primary onClick={() => { void onConfirmImport('overwrite_all') }}>
                {localize(language, '确认导入', 'Confirm import')}
              </ActionButton>
            )}
            <ActionButton onClick={onDismissImportPreview}>{localize(language, '取消', 'Cancel')}</ActionButton>
          </div>
        </section>
      ) : null}
    </div>
  )
}
