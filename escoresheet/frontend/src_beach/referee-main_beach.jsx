import React from 'react'
import ReactDOM from 'react-dom/client'
import RefereeApp from './RefereeApp_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScaleProvider>
      <AuthProvider>
        <AlertProvider>
          <RefereeApp />
        </AlertProvider>
      </AuthProvider>
    </ScaleProvider>
    {/* volleyui confirm dialog + toasts, above every legacy overlay */}
    <div className="ov-kit ov-kit-host"><UiHost /></div>
  </React.StrictMode>,
)

