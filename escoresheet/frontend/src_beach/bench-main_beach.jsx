import React from 'react'
import ReactDOM from 'react-dom/client'
import BenchApp from './BenchApp'
import './styles_beach.css'
import './i18n_beach'  // Initialize i18n for localization
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AlertProvider>
        <BenchApp />
      </AlertProvider>
    </AuthProvider>
  </React.StrictMode>,
)

