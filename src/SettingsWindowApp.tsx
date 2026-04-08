import { ChangbuEventBridge } from './components/ChangbuEventBridge'
import { SettingsPanel } from './components/SettingsPanel'
import { ToastProvider } from './components/Toast'
import { useSettingsController } from './hooks/useSettingsController'

export default function SettingsWindowApp() {
  return (
    <ToastProvider>
      <SettingsWindowInner />
    </ToastProvider>
  )
}

function SettingsWindowInner() {
  const settingsPanelProps = useSettingsController()

  return (
    <>
      <ChangbuEventBridge />

      <div className="flex h-screen flex-col overflow-hidden bg-[#f7f5f2] text-stone-900">
        <div className="window-drag-region flex h-11 shrink-0 items-center justify-end px-3">
          <button
            type="button"
            aria-label="关闭设置窗口"
            data-testid="settings-window-close"
            onClick={() => window.close()}
            className="window-no-drag flex h-8 w-8 items-center justify-center rounded-md text-stone-400 transition hover:bg-black/[0.04] hover:text-stone-700"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="m5 5 10 10" />
              <path d="M15 5 5 15" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 px-0 pb-0">
          <SettingsPanel {...settingsPanelProps} />
        </div>
      </div>
    </>
  )
}
