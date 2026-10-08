import { useState } from 'react'
import i18n from 'i18next'
import { ErrorBoundary, ErrorScreen } from '../ui/volleyui/ErrorScreen.jsx'
import { reloadPage } from '../utils_beach/appReload_beach'
import { reportAppError } from '../utils_beach/activity/appError_beach'

// The texts must not depend on the app working: i18n may be what crashed.
const tr = (key, fallback) => {
  try {
    const s = i18n.t(key, { defaultValue: fallback })
    return typeof s === 'string' && s ? s : fallback
  } catch {
    return fallback
  }
}

/**
 * Around every app root (the *-main_beach.jsx entries), after OpenVolley's
 * components/ErrorBoundary.jsx (8efbd12e). Without it a render error anywhere
 * unmounted the whole page to white: the scorer mid-match, a referee tablet,
 * the arena scoreboard.
 *
 * The kit's ErrorBoundary and ErrorScreen, in the page's language: "Try
 * again" mounts the app afresh, "Reload" reloads the page with its URL kept
 * (?match= keeps a tablet on its live match). The match is in IndexedDB, so
 * both are safe.
 *
 * The <UiHost /> goes inside it: a page that crashed into this screen then has
 * no dialog host, and the desktop app asks its quit question natively
 * (appLifecycle_beach).
 */
export default function AppErrorBoundary({ name, children }) {
  const [attempt, setAttempt] = useState(0)
  return (
    <ErrorBoundary
      // a new key mounts the app again, with fresh state
      key={attempt}
      onError={(error, info) => {
        console.error(`[ErrorBoundary${name ? `:${name}` : ''}] Render error:`, error, info?.componentStack)
        reportAppError(error?.message || String(error), error?.stack, `render${name ? `:${name}` : ''}`)
      }}
      fallback={(error) => (
        <div role="alert" className="ov-kit">
          <ErrorScreen
            title={tr('app.crashTitle', 'Something went wrong')}
            body={tr('app.crashBody', 'This screen hit an error. The match is saved on this device: try again, or reload the page.')}
            detail={error?.message ? String(error.message) : undefined}
            reloadLabel={tr('app.crashReload', 'Reload')}
            onReload={() => reloadPage()}
            secondary={{ label: tr('app.crashTryAgain', 'Try again'), onClick: () => setAttempt((n) => n + 1) }}
          />
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}
