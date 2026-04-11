import type { AppMeta } from '../../../../shared/types'
import { formatDateByLanguage, type AppLanguage } from '../../../i18n/locale'
import { SettingsGroup, SettingsRow } from '../common'
import { TokenUsagePanel } from '../TokenUsagePanel'
import { localize, runtimeAiStatus, runtimeVectorStatus, runtimeQueueStatus } from '../utils'

export function AboutSection({ meta, language }: { meta: AppMeta | null; language: AppLanguage }) {
  return (
    <div className="space-y-10">
      <SettingsGroup title="运行与索引">
        <SettingsRow
          title={localize(language, '应用状态', 'App status')}
          description={localize(language, '这里集中显示当前 AI / 向量状态、最近测试结果和后台运行情况，不再在数据管理里重复出现。', 'Current AI / vector status, latest test results, and runtime diagnostics are summarized here instead of being duplicated elsewhere.')}
          control={
            <div className="text-right text-sm text-stone-500">
              <div className="font-semibold text-stone-900">{localize(language, '长布桌面版', 'Changbu Desktop')}</div>
              <div>{localize(language, '数据目录已连接', 'Data directory connected')}</div>
            </div>
          }
        />
        <SettingsRow title={localize(language, 'AI 模式', 'AI mode')} description={runtimeAiStatus(meta, language)} />
        <SettingsRow title={localize(language, '向量状态', 'Vector status')} description={runtimeVectorStatus(meta, language)} />
        <SettingsRow title={localize(language, '队列状态', 'Queue status')} description={runtimeQueueStatus(meta, language)} />
        <SettingsRow title="Base URL" description={meta?.resolvedBaseUrl ?? localize(language, '尚未解析', 'Not resolved yet')} />
        <SettingsRow
          title={localize(language, '最近测试', 'Latest test')}
          description={
            meta?.lastAiTestResult
              ? `${meta.lastAiTestResult.success ? localize(language, '测试通过', 'Passed') : localize(language, '测试失败', 'Failed')} · ${formatDateByLanguage(meta.lastAiTestResult.checkedAt, {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              }, language)}`
              : localize(language, '还没有 API 测试记录。', 'No API test record yet.')
          }
        />
        <SettingsRow title={localize(language, '待处理向量', 'Pending vectors')} description={localize(language, `${meta?.pendingVectorCount ?? 0} 个`, `${meta?.pendingVectorCount ?? 0}`)} />
        <SettingsRow title={localize(language, '失败向量', 'Failed vectors')} description={localize(language, `${meta?.failedVectorCount ?? 0} 个`, `${meta?.failedVectorCount ?? 0}`)} />
        {meta?.lastAiError ? <SettingsRow title={localize(language, '最近运行错误', 'Latest runtime error')} description={meta.lastAiError} /> : null}
      </SettingsGroup>

      <SettingsGroup title={localize(language, 'Token 使用', 'Token usage')}>
        <div className="grid gap-3 lg:grid-cols-2">
          <TokenUsagePanel
            title={language === 'en' ? 'Current session' : '当前会话'}
            hint={language === 'en' ? 'Usage collected since this app launch.' : '本次启动后的调用统计。'}
            usage={meta?.tokenUsage}
            language={language}
          />
          <TokenUsagePanel
            title={language === 'en' ? 'Lifetime total' : '累计总计'}
            hint={language === 'en' ? 'Cumulative usage persisted across restarts.' : '跨重启累计保存的总用量。'}
            usage={meta?.lifetimeTokenUsage}
            language={language}
          />
        </div>
      </SettingsGroup>
    </div>
  )
}
