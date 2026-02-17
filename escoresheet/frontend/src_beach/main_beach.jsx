import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App_beach'
import './styles_beach.css'
import 'flag-icons/css/flag-icons.min.css'
import { initLogger } from './utils_beach/logger_beach'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { LoggingProvider } from './contexts_beach/LoggingContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'

// Initialize logger to capture console output
initLogger()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScaleProvider>
      <AuthProvider>
        <AlertProvider>
          <LoggingProvider>
            <App />
          </LoggingProvider>
        </AlertProvider>
      </AuthProvider>
    </ScaleProvider>
  </React.StrictMode>
)


