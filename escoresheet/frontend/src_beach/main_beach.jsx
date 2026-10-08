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

// Remove the cache_bust a reload added (Options > Clear cache); the rest of
// the query stays: ?match= keeps a tablet on its live match.
stripCacheBustParam()

// Initialize logger to capture console output
initLogger()

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


