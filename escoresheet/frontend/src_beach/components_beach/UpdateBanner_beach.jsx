import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw } from 'lucide-react'
import useServiceWorker from '../hooks_beach/useServiceWorker_beach'
import { cn } from '../ui/volleyui/cn.js'
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'

// Get current version from package.json (injected by Vite at build time)
const currentVersion = __APP_VERSION__

/**
 * Banner that shows when a new version of the app is available
 * Place this on home/landing pages where it's safe to refresh
 */
export default function UpdateBanner() {
  const { t } = useTranslation()
  const { needRefresh, updateServiceWorker, dismissUpdate } = useServiceWorker()
  const [newVersion, setNewVersion] = useState(null)

  // Fetch the new version from server when update is detected
  useEffect(() => {
    if (needRefresh) {
      fetch(`/version.json?t=${Date.now()}`)
        .then(res => res.json())
        .then(data => setNewVersion(data.version))
        .catch(() => setNewVersion(null))
    }
  }, [needRefresh])

  // Don't show banner if no refresh needed or if versions are the same
  if (!needRefresh) return null
  if (newVersion && newVersion === currentVersion) return null

  // A sky banner (pending: nothing changes until the scorer refreshes),
  // floating over the top edge; one dark action, Later as the quiet one.
  return (
    <div
      role="status"
      aria-live="polite"
      className="ov-kit no-print fixed left-1/2 flex w-[min(560px,calc(100vw-24px))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 shadow-lg"
      style={{ top: 'calc(env(safe-area-inset-top, 0px) + 8px)', zIndex: 10000 }}
    >
      <div className="flex min-w-0 flex-[1_1_220px] items-center gap-2 text-sm font-medium text-sky-900">
        <Download size={16} aria-hidden="true" className="shrink-0 text-sky-700" />
        <span className="min-w-0">
          {t('options.updateAvailable', 'Update available')}{' '}
          <span className="font-mono text-xs tabular-nums text-sky-800">
            {currentVersion} → {newVersion || t('updateBanner.newVersion', 'new version')}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={dismissUpdate}
          className={cn('inline-flex h-9 items-center rounded-lg border border-sky-200 bg-white px-3 text-xs font-medium text-sky-800 transition-colors hover:bg-sky-100', FOCUS_RING)}
        >
          {t('updateBanner.later', 'Later')}
        </button>
        <button
          type="button"
          onClick={() => updateServiceWorker()}
          className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white transition-colors hover:bg-slate-800', FOCUS_RING)}
        >
          <RefreshCw size={13} aria-hidden="true" />
          {t('options.refreshToUpdate', 'Refresh to update')}
        </button>
      </div>
    </div>
  )
}
