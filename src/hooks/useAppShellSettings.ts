import { useEffect, useState } from 'react'

import {
  CALENDAR_SETTINGS_KEY,
  DEFAULT_CALENDAR_SETTINGS,
  UI_SETTINGS_KEY,
  parseCalendarSettings,
} from '../../shared/config'
import type { CalendarSettings } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { parseRendererUISettings, type RendererUISettings } from '../i18n/locale'

export function useAppShellSettings(): {
  calendarSettings: CalendarSettings
  uiSettings: RendererUISettings
} {
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS)
  const [uiSettings, setUiSettings] = useState<RendererUISettings>(() => parseRendererUISettings(null))

  useEffect(() => {
    let active = true

    async function syncShellSettings(): Promise<void> {
      const [savedCalendar, savedUi] = await Promise.all([
        changbu.settings.get(CALENDAR_SETTINGS_KEY),
        changbu.settings.get(UI_SETTINGS_KEY),
      ])

      if (!active) {
        return
      }

      setCalendarSettings(parseCalendarSettings(savedCalendar))
      setUiSettings(parseRendererUISettings(savedUi))
    }

    void syncShellSettings()

    const unsubscribeMeta = changbu.events.onMetaChanged((event) => {
      if (event.reason === 'settings') {
        void syncShellSettings()
      }
    })

    return () => {
      active = false
      unsubscribeMeta()
    }
  }, [])

  return {
    calendarSettings,
    uiSettings,
  }
}
