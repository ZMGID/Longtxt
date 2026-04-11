import type { ReactNode } from 'react'

export function SettingField({
  label,
  value,
  placeholder,
  onChange,
  secret = false,
}: {
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  secret?: boolean
}) {
  return (
    <label className="block w-full max-w-[420px] space-y-1.5">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      />
    </label>
  )
}

export function SettingNumberField({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  description: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="block w-full max-w-[240px] space-y-1.5">
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = Number(event.target.value)
          onChange(Number.isFinite(nextValue) ? nextValue : value)
        }}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      />
      <p className="text-xs leading-5 text-stone-500">{description}</p>
    </label>
  )
}

export function SettingSwitch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-label={label}
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange(!checked)
        }
      }}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
        checked ? 'bg-violet-500' : 'bg-stone-300'
      } ${disabled ? 'cursor-not-allowed opacity-45' : ''}`}
    >
      <span
        className={`absolute h-5 w-5 rounded-full bg-white shadow-sm transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
      />
    </button>
  )
}

export function SettingSelect({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  testId?: string
}) {
  return (
    <label className="block w-full min-w-[180px] space-y-1.5">
      <span className="sr-only">{label}</span>
      <select
        aria-label={label}
        data-testid={testId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none transition focus:border-violet-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

export function SettingsRow({
  title,
  description,
  control,
}: {
  title: string
  description: ReactNode
  control?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-200 py-5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-stone-900">{title}</div>
        <div className="mt-1 text-sm leading-6 text-stone-500">{description}</div>
      </div>
      {control ? <div className="flex shrink-0 flex-wrap items-center gap-2">{control}</div> : null}
    </div>
  )
}

export function SettingsGroup({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="pt-2">
      <h3 className="mb-3 text-[13px] font-semibold text-stone-900">{title}</h3>
      <div>{children}</div>
    </section>
  )
}
