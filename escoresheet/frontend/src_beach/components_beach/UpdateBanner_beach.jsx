import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, RefreshCw } from 'lucide-react'
import useServiceWorker, { autoApplyAllowed, noteAutoApply } from '../hooks_beach/useServiceWorker_beach'
import { cn } from '../ui/volleyui/cn.js'
import { FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { isDesktopScoretable } from '../utils_beach/appLifecycle_beach'

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
  // The desktop app's binary IS the update: its first start still runs the
  // previous build from the service worker, with the new one waiting. Apply it
  // at once (this banner is on the home screen only, never mid-match). Not a
  // second time within a short while (autoApplyAllowed): an update that did
  // not take reloaded into itself every few seconds; then the banner asks.
  const [applyAtOnce] = useState(() => isDesktopScoretable() && autoApplyAllowed())

  useEffect(() => {
    if (!needRefresh || !applyAtOnce) return
    noteAutoApply()
    updateServiceWorker()
  }, [needRefresh, applyAtOnce, updateServiceWorker])

  // Fetch the new version from server when update is detected (the label
  // only). Relative to the app's base, so a build served under a path asks its
  // own server.
  useEffect(() => {
    if (needRefresh && !applyAtOnce) {
      fetch(`${import.meta.env.BASE_URL}version.json?t=${Date.now()}`, { cache: 'no-store' })
        .then(res => res.json())
        .then(data => setNewVersion(typeof data?.version === 'string' ? data.version : null))
        .catch(() => setNewVersion(null))
    }
  }, [needRefresh, applyAtOnce])

  // The waiting service worker decides whether there is an update; the
  // version is only the label. A deploy without a version bump still has a
  // new worker waiting, and hiding the banner then left it waiting for good.
  if (!needRefresh || applyAtOnce) return null
  const versionLabel = newVersion && newVersion !== currentVersion ? newVersion : t('updateBanner.newVersion', 'new version')

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
            {currentVersion} → {versionLabel}
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
