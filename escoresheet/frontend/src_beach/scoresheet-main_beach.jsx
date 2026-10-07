import React from 'react'
import ReactDOM from 'react-dom/client'
import ScoresheetApp from './ScoresheetApp_beach'
import './tailwind_beach.css' // also brings in styles_beach.css (legacy layer) and the volleyui tokens
import { UiHost } from './ui/volleyui/UiHost.jsx'
import './i18n_beach'  // Initialize i18n for localization

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScoresheetApp />
    {/* volleyui confirm dialog + toasts, above every legacy overlay */}
    <div className="ov-kit ov-kit-host"><UiHost /></div>
  </React.StrictMode>,
)
