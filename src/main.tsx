import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { QueryClientProvider } from '@tanstack/react-query'

import App from './App'
import SettingsWindowApp from './SettingsWindowApp'
import './index.css'
import { queryClient } from './lib/queryClient'

const windowMode = new URLSearchParams(window.location.search).get('window')
const rootAppElement = windowMode === 'settings' ? <SettingsWindowApp /> : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {rootAppElement}
    </QueryClientProvider>
  </StrictMode>,
)
