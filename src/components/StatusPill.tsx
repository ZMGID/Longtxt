import type { BlockStatus } from '../../shared/types'

const styles: Record<BlockStatus, string> = {
  pending: 'border-amber-200 bg-amber-50 text-amber-800',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-rose-200 bg-rose-50 text-rose-800',
}

const labels: Record<BlockStatus, string> = {
  pending: '处理中',
  ready: '已就绪',
  error: '异常',
}

interface StatusPillProps {
  status: BlockStatus
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[11px] font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
