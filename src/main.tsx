import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import { GlobalScrollbarManager } from './components/GlobalScrollbarManager'
import { I18nProvider } from './i18n/I18nProvider'
import ReviewWindowApp from './ReviewWindowApp'
import SettingsWindowApp from './SettingsWindowApp'
import './index.css'
import { queryClient } from './lib/queryClient'

const windowMode = new URLSearchParams(window.location.search).get('window')
const rootAppElement = windowMode === 'settings'
  ? <SettingsWindowApp />
  : windowMode === 'review'
    ? <ReviewWindowApp />
    : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <GlobalScrollbarManager />
        {rootAppElement}
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
