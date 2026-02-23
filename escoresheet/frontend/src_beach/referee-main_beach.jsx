import React from 'react'
import ReactDOM from 'react-dom/client'
import RefereeApp from './RefereeApp_beach'
import './styles_beach.css'
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
  </React.StrictMode>,
)

