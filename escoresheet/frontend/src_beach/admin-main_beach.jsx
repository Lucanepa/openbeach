import React from 'react'
import ReactDOM from 'react-dom/client'
import CompetitionAdminApp from './CompetitionAdminApp_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import { stripCacheBustParam } from './utils_beach/appReload_beach'
import 'flag-icons/css/flag-icons.min.css'
import './i18n_beach'
import { AlertProvider } from './contexts_beach/AlertContext_beach'
import { AuthProvider } from './contexts_beach/AuthContext_beach'
import { ScaleProvider } from './contexts_beach/ScaleContext_beach'

// Remove the cache_bust a reload added (Options > Clear cache); the rest of
// the query stays: ?match= keeps a tablet on its live match.
stripCacheBustParam()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScaleProvider defaultScale={1}>
      <AuthProvider>
        <AlertProvider>
          <CompetitionAdminApp />
        </AlertProvider>
      </AuthProvider>
    </ScaleProvider>
    {/* volleyui confirm dialog + toasts, above every legacy overlay */}
    <div className="ov-kit ov-kit-host"><UiHost /></div>
  </React.StrictMode>,
)
