import { useCallback, useRef, useState } from 'react'

import { ToastContext, type ToastType } from './toast-context'

/* ------------------------------------------------------------------ */
/*  类型                                                                */
/* ------------------------------------------------------------------ */

interface Toast {
  id: number
  type: ToastType
  message: string
  exiting: boolean
}

/* ------------------------------------------------------------------ */
/*  Provider                                                           */
/* ------------------------------------------------------------------ */

let nextId = 0

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    /* 先标记退场动画 */
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)))
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 150)
    timers.current.set(id, timer)
  }, [])

  const toast = useCallback(
    (type: ToastType, message: string) => {
      const id = nextId++
      setToasts((prev) => {
        const next = [...prev, { id, type, message, exiting: false }]
        /* 最多保留 3 条 */
        return next.length > 3 ? next.slice(next.length - 3) : next
      })
      /* 3 秒后自动消失 */
      const timer = setTimeout(() => remove(id), 3000)
      timers.current.set(id, timer)
    },
    [remove],
  )

  return (
    <ToastContext value={{ toast }}>
      {children}
      {/* Toast 容器 */}
      <div className="pointer-events-none fixed right-4 top-14 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-sm ${
              t.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : t.type === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-800'
                  : 'border-stone-200 bg-stone-50 text-stone-700'
            } ${t.exiting ? 'animate-[slideOutRight_150ms_ease-in_forwards]' : 'animate-[slideInRight_200ms_ease-out]'}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  )
}
