import type { ReactNode } from 'react'

interface ActionButtonProps {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'default' | 'primary' | 'dark' | 'danger' | 'quiet' | 'active'
  primary?: boolean
  accent?: boolean
  danger?: boolean
  active?: boolean
  size?: 'sm' | 'xs'
  radius?: 'md' | 'lg' | 'full'
  title?: string
  ariaLabel?: string
  testId?: string
  className?: string
}

const VARIANT_CLASSES: Record<NonNullable<ActionButtonProps['variant']>, string> = {
  default: 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
  primary: 'border-violet-500 bg-violet-500 text-white hover:bg-violet-600',
  dark: 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  quiet: 'border-stone-200 bg-transparent text-stone-600 hover:bg-white/70 hover:text-stone-900',
  active: 'border-stone-900 bg-stone-900 text-white hover:bg-stone-800',
}

const SIZE_CLASSES: Record<NonNullable<ActionButtonProps['size']>, string> = {
  sm: 'px-3 py-2 text-sm',
  xs: 'px-2.5 py-1.5 text-xs',
}

const RADIUS_CLASSES: Record<NonNullable<ActionButtonProps['radius']>, string> = {
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full',
}

export function ActionButton({
  children,
  onClick,
  disabled = false,
  variant = 'default',
  primary = false,
  accent = false,
  danger = false,
  active = false,
  size = 'sm',
  radius = 'md',
  title,
  ariaLabel,
  testId,
  className = '',
}: ActionButtonProps) {
  const resolvedVariant = variant !== 'default'
    ? variant
    : primary
      ? 'primary'
      : accent
        ? 'dark'
        : danger
          ? 'danger'
          : active
            ? 'active'
            : 'default'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      className={[
        'border font-medium transition disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT_CLASSES[resolvedVariant],
        SIZE_CLASSES[size],
        RADIUS_CLASSES[radius],
        className,
      ].join(' ').trim()}
    >
      {children}
    </button>
  )
}
