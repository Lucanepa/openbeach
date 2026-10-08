import React from 'react'
import ReactDOM from 'react-dom/client'
import ScoreboardApp from './ScoreboardApp_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import { stripCacheBustParam } from './utils_beach/appReload_beach'
import AppErrorBoundary from './components_beach/AppErrorBoundary_beach'
import './i18n_beach'
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'

// Remove the cache_bust a reload added (Options > Clear cache); the rest of
// the query stays: ?match= keeps a tablet on its live match.
stripCacheBustParam()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary name="scoreboard">
      <AuthProvider>
        <AlertProvider>
          <ScoreboardApp />
        </AlertProvider>
      </AuthProvider>
      {/* volleyui confirm dialog + toasts, above every legacy overlay */}
      <div className="ov-kit ov-kit-host"><UiHost /></div>
    </AppErrorBoundary>
  </React.StrictMode>,
)
