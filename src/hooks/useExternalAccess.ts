import { useCallback, useEffect, useState } from 'react'

import type { ExternalAccessStatus } from '../../shared/types'
import { changbu } from '../lib/changbu'
import { useToast } from '../components/toast-context'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function useExternalAccess() {
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
          toast('error', getErrorMessage(error, '读取外部接入状态失败。'))
        }

        return null
      } finally {
        if (!silent) {
          setBusyAction(null)
        }
      }
    },
    [busyAction, toast],
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
      toast('success', '已启用外部接入。')
    } catch (error) {
      toast('error', getErrorMessage(error, '启用外部接入失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, toast])

  const generate = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('generate')

    try {
      const nextStatus = await changbu.settings.generateExternalAccessBundle()
      setStatus(nextStatus)
      toast('success', '接入包已生成到长布本地目录。')
    } catch (error) {
      toast('error', getErrorMessage(error, '生成接入包失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, toast])

  const disable = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('disable')

    try {
      const nextStatus = await changbu.settings.disableExternalAccess()
      setStatus(nextStatus)
      toast('success', '已停用外部接入。')
    } catch (error) {
      toast('error', getErrorMessage(error, '停用外部接入失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, toast])

  const openDirectory = useCallback(async (): Promise<void> => {
    if (busyAction) {
      return
    }

    setBusyAction('open')

    try {
      await changbu.settings.openExternalAccessDirectory()
      toast('success', '已打开接入目录。')
    } catch (error) {
      toast('error', getErrorMessage(error, '打开接入目录失败。'))
    } finally {
      setBusyAction(null)
    }
  }, [busyAction, toast])

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
