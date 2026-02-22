import React from 'react'
import ReactDOM from 'react-dom/client'
import CompetitionAdminApp from './CompetitionAdminApp_beach'
import './styles_beach.css'
import 'flag-icons/css/flag-icons.min.css'
import './i18n_beach'
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScaleProvider defaultScale={1}>
      <AuthProvider>
        <AlertProvider>
          <CompetitionAdminApp />
        </AlertProvider>
      </AuthProvider>
    </ScaleProvider>
  </React.StrictMode>,
)
