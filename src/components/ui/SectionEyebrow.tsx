import type { ReactNode } from 'react'

export function SectionEyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-[0.24em] text-stone-400 ${className}`.trim()}>
      {children}
    </p>
  )
}
