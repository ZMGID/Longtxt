import type { SettingsSectionId } from './types'

function NavIcon({ section }: { section: SettingsSectionId }) {
  switch (section) {
    case 'about':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="10" r="7" />
          <path d="M10 13v-3" />
          <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'general':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 10h12" />
          <path d="M4 6h12" />
          <path d="M4 14h8" />
        </svg>
      )
    case 'ai':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3v4" />
          <path d="M10 13v4" />
          <path d="M3 10h4" />
          <path d="M13 10h4" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      )
    case 'external-access':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 6.5h3" />
          <path d="M10.5 13.5h3" />
          <path d="M9.5 10.5 6.5 13.5" />
          <path d="M10.5 9.5 13.5 6.5" />
          <rect x="3.5" y="3.5" width="13" height="13" rx="3" />
        </svg>
      )
    case 'backup':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6.5A1.5 1.5 0 0 1 5.5 5h7L16 8.5V14a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 13.5Z" />
          <path d="M12.5 5v3.5H16" />
          <path d="M10 8.5v4" />
          <path d="m8.5 11 1.5 1.5L11.5 11" />
        </svg>
      )
    case 'files':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6.5h5l1.5 1.5h6A1.5 1.5 0 0 1 17.5 9.5v5A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5Z" />
        </svg>
      )
    case 'advanced':
      return (
        <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 3.5v2" />
          <path d="M10 14.5v2" />
          <path d="m14.95 5.05-1.4 1.4" />
          <path d="m6.45 13.55-1.4 1.4" />
          <path d="M16.5 10h-2" />
          <path d="M5.5 10h-2" />
          <path d="m14.95 14.95-1.4-1.4" />
          <path d="m6.45 6.45-1.4-1.4" />
          <circle cx="10" cy="10" r="3" />
        </svg>
      )
  }
}

export function SettingsNavButton({
  section,
  label,
  hint,
  active,
  badge,
  onClick,
  testId,
}: {
  section: SettingsSectionId
  label: string
  hint: string
  active: boolean
  badge?: string
  onClick: () => void
  testId?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left transition ${
        active ? 'bg-stone-200/80 text-stone-900' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="shrink-0"><NavIcon section={section} /></span>
        <span className="min-w-0">
          <span className="block text-[15px] font-medium">{label}</span>
        </span>
      </span>
      {badge ? <span className="rounded-full bg-stone-300 px-2 py-0.5 text-[10px] font-semibold text-stone-700">{badge}</span> : null}
      <span className="sr-only">{hint}</span>
    </button>
  )
}
