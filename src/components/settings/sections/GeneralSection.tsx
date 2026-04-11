import type { CalendarSettings, UISettings } from '../../../../shared/types'
import { getLanguageFromUISettings, getLanguageLabel, withRendererLanguage, type AppLanguage } from '../../../i18n/locale'
import type { MessageKey } from '../../../i18n/messages'
import { SettingsGroup, SettingsRow, SettingSelect, SettingSwitch } from '../common'
import { localize } from '../utils'

interface GeneralSectionProps {
  calendarSettings: CalendarSettings
  uiSettings: UISettings
  onCalendarSettingsChange: (settings: CalendarSettings) => void
  onUISettingsChange: (settings: UISettings) => void
  language: AppLanguage
  t: (key: MessageKey) => string
}

export function GeneralSection({
  calendarSettings,
  uiSettings,
  onCalendarSettingsChange,
  onUISettingsChange,
  language,
  t,
}: GeneralSectionProps) {
  return (
    <SettingsGroup title={localize(language, '功能开关', 'Feature switches')}>
      <SettingsRow
        title={localize(language, '启用 AI 日期建议', 'Enable AI date suggestions')}
        description={localize(language, '块 enrich 完成后，若内容里有明确未来日期安排，会在日历里生成 AI 建议；开启自动加入后会直接成为正式安排。', 'After block enrichment finishes, Changbu can turn clear future plans into calendar suggestions. If auto-add is on, those suggestions become real entries immediately.')}
        control={
          <SettingSwitch
            label={localize(language, '启用 AI 日期建议', 'Enable AI date suggestions')}
            checked={calendarSettings.aiSuggestionsEnabled}
            onChange={(checked) => {
              onCalendarSettingsChange({
                ...calendarSettings,
                aiSuggestionsEnabled: checked,
              })
            }}
          />
        }
      />
      <SettingsRow
        title={localize(language, 'AI 建议自动加入日历', 'Auto-add AI suggestions to calendar')}
        description={calendarSettings.aiSuggestionsEnabled
          ? localize(language, '识别到明确的未来安排后，直接创建正式日历事项，不再等待手动确认。', 'When a future plan is clearly recognized, create a real calendar entry immediately instead of waiting for manual confirmation.')
          : localize(language, '先启用 AI 日期建议后，才可以打开自动加入。', 'Enable AI date suggestions first before turning on auto-add.')}
        control={
          <SettingSwitch
            label={localize(language, 'AI 建议自动加入日历', 'Auto-add AI suggestions to calendar')}
            checked={calendarSettings.autoAcceptAiSuggestions}
            disabled={!calendarSettings.aiSuggestionsEnabled}
            onChange={(checked) => {
              onCalendarSettingsChange({
                ...calendarSettings,
                autoAcceptAiSuggestions: checked,
              })
            }}
          />
        }
      />
      <SettingsRow
        title={localize(language, '显示左侧时间线', 'Show left-side mini timeline')}
        description={localize(language, '在时间轴页左侧显示极简日期时间线，并随滚动高亮当前所在日期。', 'Show a compact date timeline on the left side of Timeline and highlight the current day while scrolling.')}
        control={
          <SettingSwitch
            label={localize(language, '显示左侧时间线', 'Show left-side mini timeline')}
            checked={uiSettings.showMiniTimeline}
            onChange={(checked) => {
              onUISettingsChange({
                ...uiSettings,
                showMiniTimeline: checked,
              })
            }}
          />
        }
      />
      <SettingsRow
        title={t('settings.general.languageLabel')}
        description={t('settings.general.languageHint')}
        control={
          <SettingSelect
            label={t('settings.general.languageLabel')}
            value={getLanguageFromUISettings(uiSettings)}
            testId={t('settings.language.selectTestId')}
            options={[
              { value: 'zh', label: getLanguageLabel('zh', language) },
              { value: 'en', label: getLanguageLabel('en', language) },
            ]}
            onChange={(nextLanguage) => {
              onUISettingsChange(withRendererLanguage(uiSettings, nextLanguage === 'en' ? 'en' : 'zh') as UISettings)
            }}
          />
        }
      />
    </SettingsGroup>
  )
}
