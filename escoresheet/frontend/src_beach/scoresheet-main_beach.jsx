import React from 'react'
import ReactDOM from 'react-dom/client'
import ScoresheetApp from './ScoresheetApp_beach'
import './styles_beach.css'
import './i18n_beach'  // Initialize i18n for localization

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ScoresheetApp />
  </React.StrictMode>,
)
