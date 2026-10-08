import React from 'react'
import ReactDOM from 'react-dom/client'
import RefereeApp from './RefereeApp_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import { stripCacheBustParam } from './utils_beach/appReload_beach'
import AppErrorBoundary from './components_beach/AppErrorBoundary_beach'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'
import { db } from './db_beach/db_beach'
import { installDiagnostics } from './diagnostics_beach/index_beach'

// Diagnostics mode (off unless ?diag=1 or this device's Options switch):
// first, so it sees this load and the database opening
installDiagnostics({ db, app: 'referee' })

// Remove the cache_bust a reload added (Options > Clear cache); the rest of
// the query stays: ?match= keeps a tablet on its live match.
stripCacheBustParam()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary name="referee">
      <ScaleProvider>
        <AuthProvider>
          <AlertProvider>
            <RefereeApp />
          </AlertProvider>
        </AuthProvider>
      </ScaleProvider>
      {/* volleyui confirm dialog + toasts, above every legacy overlay */}
      <div className="ov-kit ov-kit-host"><UiHost /></div>
    </AppErrorBoundary>
  </React.StrictMode>,
)

