import { useI18n } from '../i18n/useI18n'

export function ViewLoadingMask({ title }: { title: string }) {
  const { t } = useI18n()

  return (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
      <div className="relative flex w-full max-w-2xl flex-col items-center justify-center overflow-hidden rounded-[28px] border border-black/[0.06] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,241,233,0.92))] px-8 py-14 text-center shadow-[0_24px_60px_rgba(28,25,23,0.08)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.95),rgba(255,255,255,0)_60%)]" />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-stone-200 bg-white/90 shadow-sm">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
        </div>
        <p className="relative mt-5 text-sm font-medium tracking-[0.08em] text-stone-500">{t('app.view.loadingPreparing', { title })}</p>
        <h3 className="relative mt-2 text-[22px] font-semibold tracking-[-0.02em] text-stone-900">{t('app.view.loadingTitle')}</h3>
        <p className="relative mt-3 max-w-lg text-sm leading-7 text-stone-500">
          {t('app.view.loadingHint')}
        </p>
      </div>
    </div>
  )
}
