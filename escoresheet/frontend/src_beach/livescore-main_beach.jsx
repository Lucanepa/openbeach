import React from 'react'
import ReactDOM from 'react-dom/client'
import LivescoreApp from './LivescoreApp'
import './styles_beach.css'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AlertProvider>
        <LivescoreApp />
      </AlertProvider>
    </AuthProvider>
  </React.StrictMode>,
)

