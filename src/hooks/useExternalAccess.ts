import { useCallback, useEffect, useState } from 'react'

import type { ExternalAccessStatus } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useToast } from '../components/toast-context'
import { useI18n } from '../i18n/useI18n'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useExternalAccess() {
  const { language } = useI18n()
  const { toast } = useToast()
  const [status, setStatus] = useState<ExternalAccessStatus | null>(null)
  const [busyAction, setBusyAction] = useState<'enable' | 'generate' | 'disable' | 'open' | 'refresh' | null>(null)

  const refreshStatus = useCallback(
    async ({
      silent = false,
      successMessage,
    }: {
      silent?: boolean
      successMessage?: string
    } = {}): Promise<ExternalAccessStatus | null> => {
      if (!silent && busyAction) {
        return null
      }

      try {
        if (!silent) {
          setBusyAction('refresh')
        }

        const nextStatus = await changbu.settings.getExternalAccessStatus()
        setStatus(nextStatus)

        if (!silent && successMessage) {
          toast('success', successMessage)
        }

        return nextStatus
      } catch (error) {
        if (!silent) {
          toast('error', getErrorMessage(error, language === 'en' ? 'Failed to read external access status.' : '读取外部接入状态失败。'))
        }

        return null
      } finally {
        if (!silent) {
          setBusyAction(null)
        }
      }
    },
    [busyAction, language, toast],
  )

  useEffect(() => {
    let active = true

    void changbu.settings.getExternalAccessStatus().then(
      (nextStatus) => {
        if (active) {
          setStatus(nextStatus)
        }
      },
      () => {
        if (active) {
          setStatus(null)
        }
      },
    )

    const unsubscribeMeta = changbu.events.onMetaChanged((event) => {
      if (event.reason === 'settings') {
        void refreshStatus({ silent: true })
      }
    })

    return () => {
      active = false
      unsubscribeMeta()
    }
  }, [refreshStatus])

  const enable = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('enable')

    try {
      const nextStatus = await changbu.settings.enableExternalAccess()
      setStatus(nextStatus)
      toast('success', language === 'en' ? 'External access enabled.' : '已启用外部接入。')
    } catch (error) {
      toast('error', getErrorMessage(error, language === 'en' ? 'Failed to enable external access.' : '启用外部接入失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, language, toast])

  const generate = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('generate')

    try {
      const nextStatus = await changbu.settings.generateExternalAccessBundle()
      setStatus(nextStatus)
      toast('success', language === 'en' ? 'Bundle generated to local Changbu directory.' : '接入包已生成到长布本地目录。')
    } catch (error) {
      toast('error', getErrorMessage(error, language === 'en' ? 'Failed to generate bundle.' : '生成接入包失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, language, toast])

  const disable = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('disable')

    try {
      const nextStatus = await changbu.settings.disableExternalAccess()
      setStatus(nextStatus)
      toast('success', language === 'en' ? 'External access disabled.' : '已停用外部接入。')
    } catch (error) {
      toast('error', getErrorMessage(error, language === 'en' ? 'Failed to disable external access.' : '停用外部接入失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, language, toast])

  const openDirectory = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('open')

    try {
      await changbu.settings.openExternalAccessDirectory()
      toast('success', language === 'en' ? 'Opened external access directory.' : '已打开接入目录。')
    } catch (error) {
      toast('error', getErrorMessage(error, language === 'en' ? 'Failed to open external access directory.' : '打开接入目录失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, language, toast])

  return {
    externalAccessStatus: status,
    externalAccessBusy: busyAction !== null,
    externalAccessBusyAction: busyAction,
    refreshExternalAccess: refreshStatus,
    enableExternalAccess: enable,
    generateExternalAccessBundle: generate,
    disableExternalAccess: disable,
    openExternalAccessDirectory: openDirectory,
  }
}
