import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { useAppStore, useSettingsStore } from './store/store'

// Dev-only: expose stores for preview-driven UI verification.
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__appStore = useAppStore
  ;(window as unknown as Record<string, unknown>).__settingsStore = useSettingsStore
}

// Apply the persisted theme + accent early to avoid a flash (App reconciles after mount).
try {
  const raw = localStorage.getItem('formatif')
  const state = raw ? JSON.parse(raw)?.state : null
  const theme = state?.theme ?? 'dark'
  const dark =
    theme === 'light'
      ? false
      : theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : true
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.dataset.accent = state?.accent ?? 'violet'
} catch {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
