import type { BlockStatus } from '../../shared/types'
import { useI18n } from '../i18n/useI18n'

const styles: Record<BlockStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
  skipped: 'border-slate-200 bg-slate-100 text-slate-700',
}

interface StatusPillProps {
  status: BlockStatus
}

export function StatusPill({ status }: StatusPillProps) {
  const { t } = useI18n()
  const labels: Record<BlockStatus, string> = {
    pending: t('status.pending'),
    ready: t('status.ready'),
    error: t('status.error'),
    skipped: t('status.skipped'),
  }

  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
