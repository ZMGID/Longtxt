import { useEffect, useState } from 'react'

import {
  CALENDAR_SETTINGS_KEY,
  DEFAULT_CALENDAR_SETTINGS,
  DEFAULT_UI_SETTINGS,
  UI_SETTINGS_KEY,
  parseCalendarSettings,
  parseUISettings,
} from '../../shared/config'
import type { CalendarSettings, UISettings } from '../../shared/types'
import { changbu } from '../lib/changbu'

export function useAppShellSettings(): {
  calendarSettings: CalendarSettings
  uiSettings: UISettings
} {
  const [calendarSettings, setCalendarSettings] = useState<CalendarSettings>(DEFAULT_CALENDAR_SETTINGS)
  const [uiSettings, setUiSettings] = useState<UISettings>(DEFAULT_UI_SETTINGS)

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
      setUiSettings(parseUISettings(savedUi))
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
