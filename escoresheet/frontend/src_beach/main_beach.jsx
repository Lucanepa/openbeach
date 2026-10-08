import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import { stripCacheBustParam } from './utils_beach/appReload_beach'
import AppErrorBoundary from './components_beach/AppErrorBoundary_beach'
import 'flag-icons/css/flag-icons.min.css'
import { initLogger } from './utils_beach/logger_beach'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { LoggingProvider } from './contexts_beach/LoggingContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'
import AndroidExitPrompt from './components_beach/AndroidExitPrompt_beach'
import { db } from './db_beach/db_beach'
import { installDiagnostics } from './diagnostics_beach/index_beach'
import { startActivityLog } from './utils_beach/activity/index_beach'
import { applyUpdateAtStart } from './hooks_beach/useServiceWorker_beach'
import { isDesktopScoretable } from './utils_beach/appLifecycle_beach'

// Diagnostics mode (off unless Options, ?diag=1 or OPENVOLLEY_DIAGNOSTICS=1
// in the desktop app): first, so it sees this load and the database opening
installDiagnostics({ db, app: 'scorer' })

// Remove the cache_bust a reload added (Options > Clear cache); the rest of
// the query stays: ?match= keeps a tablet on its live match.
stripCacheBustParam()

// The desktop app: a new build waiting at start is applied before the scorer
// touches anything (the binary is the update; see applyUpdateAtStart)
if (isDesktopScoretable()) applyUpdateAtStart()

// Initialize logger to capture console output
initLogger()

// The match activity log (scoring, corrections, sync, app start/quit, errors):
// on this device, uploaded, and a daily file in the apps (utils_beach/activity)
startActivityLog({ db })

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary name="scorer">
      <ScaleProvider>
        <AuthProvider>
          <AlertProvider>
            <LoggingProvider>
              <App />
              {/* Android app: "Exit OpenBeach?" on the Back button */}
              <AndroidExitPrompt />
            </LoggingProvider>
          </AlertProvider>
        </AuthProvider>
      </ScaleProvider>
      {/* volleyui confirm dialog + toasts, above every legacy overlay */}
      <div className="ov-kit ov-kit-host"><UiHost /></div>
    </AppErrorBoundary>
  </React.StrictMode>
)


