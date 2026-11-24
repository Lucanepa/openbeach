import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Check, Loader2, Minus, WifiOff, X } from 'lucide-react'
import { Button, ButtonGroup } from '../ui/volleyui/Button.jsx'
import { cn } from '../ui/volleyui/cn.js'

// Primary services shown to the user — these are what matters
const PRIMARY_KEYS = ['db', 'supabase']

const AUTO_DISMISS_SECONDS = 5

export const isStatusOk = (status) => {
  return status === 'connected' ||
    status === 'live' ||
    status === 'scheduled' ||
    status === 'synced' ||
    status === 'syncing' ||
    status === 'test_mode' ||
    status === 'not_applicable' ||
    status === 'not_available' ||
    status === 'not_configured' ||
    status === 'no_match'
}

const isPending = (status) => !status || status === 'unknown' || status === 'connecting'
const isConnected = (status) => status === 'connected' || status === 'synced' || status === 'syncing' || status === 'live'

/**
 * Which title the rows below it support: 'connecting' while one still
 * checks, 'noCloud' once one failed (the desktop window without internet:
 * the cloud row says Offline, the title said "Connecting…" for good),
 * 'allConnected' only when every row is connected, else 'readyLocal' (a
 * venue tablet, a build without a cloud: rows that say Not configured).
 * @param {Record<string, string>} connectionStatuses
 * @returns {'connecting'|'noCloud'|'allConnected'|'readyLocal'}
 */
export function startupTitleKey(connectionStatuses = {}) {
  const statuses = PRIMARY_KEYS.map(key => connectionStatuses[key])
  if (statuses.some(s => !isPending(s) && !isStatusOk(s))) return 'noCloud'
  if (statuses.some(isPending)) return 'connecting'
  return statuses.every(isConnected) ? 'allConnected' : 'readyLocal'
}

export default function StartupConnectivityModal({
  open,
  connectionStatuses = {},
  onDismiss,
  onGoOffline
}) {
  const { t } = useTranslation()
  const hasAutoDismissed = useRef(false)
  const [countdown, setCountdown] = useState(AUTO_DISMISS_SECONDS)

  // Reset when modal opens fresh
  useEffect(() => {
    if (open) {
      hasAutoDismissed.current = false
      setCountdown(AUTO_DISMISS_SECONDS)
    }
  }, [open])

  // Only primary services gate dismissal
  const primaryOk = PRIMARY_KEYS.every(key => isStatusOk(connectionStatuses[key]))
  const primaryChecked = PRIMARY_KEYS.every(key => !isPending(connectionStatuses[key]))
  const hasErrors = primaryChecked && PRIMARY_KEYS.some(key => !isStatusOk(connectionStatuses[key]))

  // Countdown + auto-dismiss once primary services are OK
  useEffect(() => {
    if (!open || !primaryOk || hasAutoDismissed.current) return

    setCountdown(AUTO_DISMISS_SECONDS)

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval)
          if (!hasAutoDismissed.current) {
            hasAutoDismissed.current = true
            setTimeout(() => onDismiss?.(), 0)
          }
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [open, primaryOk, onDismiss])

  if (!open) return null

  // Only show primary services (Database + Supabase)
  const visibleKeys = PRIMARY_KEYS

  const labelMap = {
    api: t('connectionStatus.api', 'API'),
    server: t('connectionStatus.server', 'Server'),
    websocket: t('connectionStatus.webSocket', 'WebSocket'),
    scoreboard: t('connectionStatus.scoreboard', 'Scoreboard'),
    db: t('connectionStatus.database', 'Database'),
    supabase: t('connectionStatus.supabase', 'OpenVolley Cloud')
  }

  // State -> icon and word colour (the word always says it too).
  const getStatusIcon = (status) => {
    if (status === 'unknown' || status === 'connecting') {
      return <Loader2 size={18} className="animate-spin text-sky-600" aria-hidden="true" />
    }
    if (status === 'not_available' || status === 'not_configured') {
      return <Minus size={18} className="text-stone-400" aria-hidden="true" />
    }
    if (isStatusOk(status)) {
      return <Check size={18} className="text-emerald-600" aria-hidden="true" />
    }
    return <X size={18} className="text-red-600" aria-hidden="true" />
  }

  const getStatusText = (status) => {
    if (status === 'unknown' || status === 'connecting') return t('connectionStatus.connecting', 'Connecting')
    if (status === 'connected' || status === 'synced' || status === 'syncing' || status === 'live') return t('connectionStatus.connected', 'Connected')
    if (status === 'not_available') return t('connectionStatus.naStatic', 'N/A (static)')
    if (status === 'not_configured') return t('connectionStatus.notConfigured', 'Not configured')
    if (status === 'disconnected') return t('connectionStatus.disconnected', 'Disconnected')
    if (status === 'error') return t('connectionStatus.error', 'Error')
    if (status === 'offline') return t('connectionStatus.offline', 'Offline')
    return t('connectionStatus.unknown', 'Unknown')
  }

  const getTextClass = (status) => {
    if (status === 'unknown' || status === 'connecting') return 'text-sky-800'
    if (status === 'not_available' || status === 'not_configured') return 'text-stone-500'
    if (isStatusOk(status)) return 'text-emerald-800'
    return 'text-red-700'
  }

  return (
    <div
      className="ov-kit no-print fixed inset-0 flex items-center justify-center bg-stone-900/60 p-4 backdrop-blur-sm"
      style={{ zIndex: 2000, pointerEvents: 'auto' }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-startup-title"
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 id="ob-startup-title" className="mb-5 text-center text-lg font-bold text-stone-900">
          {{
            allConnected: () => t('startupConnectivity.allConnected', 'All services connected'),
            readyLocal: () => t('startupConnectivity.readyLocal', 'Ready: matches are kept on this device'),
            noCloud: () => t('startupConnectivity.noCloud', 'No cloud connection'),
            connecting: () => t('startupConnectivity.connecting', 'Connecting…')
          }[startupTitleKey(connectionStatuses)]()}
        </h3>

        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200/70">
          {visibleKeys.map((key) => {
            const status = connectionStatuses[key] || 'unknown'
            return (
              <div key={key} className="flex min-h-12 items-center gap-3 px-3 py-2.5">
                <div className="flex w-6 shrink-0 justify-center">
                  {getStatusIcon(status)}
                </div>
                <span className="text-sm font-semibold text-stone-800">
                  {labelMap[key] || key}
                </span>
                <span className={cn('ml-auto text-xs font-medium', getTextClass(status))}>
                  {getStatusText(status)}
                </span>
              </div>
            )
          })}
        </div>

        {/* Info when some connections failed: offline is a normal state */}
        {hasErrors && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-center text-xs leading-relaxed text-amber-900">
            {t('startupConnectivity.serverUnavailable', 'Scoring works fully offline. Referee and livescore sync via OpenVolley Cloud — server is only needed as fallback.')}
            <span className="mt-1 block text-stone-600">
              {t('startupConnectivity.backgroundRetry', 'Connection will keep retrying in the background.')}
            </span>
          </div>
        )}

        {/* Continue is always there: scoring works without the cloud, and
            the sync keeps retrying in the background. Going offline (no cloud
            call at all) is a choice for this session only. */}
        <ButtonGroup className="mt-5 flex-col-reverse sm:flex-row sm:justify-center">
          {!primaryOk && (
            <Button variant="secondary" size="xl" icon={WifiOff} onClick={onGoOffline} className="w-full sm:w-auto">
              {t('startupConnectivity.goOffline', 'Go offline')}
            </Button>
          )}
          <Button variant="dark" size="xl" icon={primaryOk ? undefined : ArrowRight} onClick={onDismiss} className="w-full sm:w-auto sm:min-w-[200px]">
            {primaryOk ? t('startupConnectivity.dismiss', 'Dismiss') : t('startupConnectivity.continue', 'Continue')}
            {primaryOk && <span className="font-normal tabular-nums opacity-70">({countdown}s)</span>}
          </Button>
        </ButtonGroup>
        {!primaryOk && (
          <p className="mt-3 text-center text-xs leading-relaxed text-stone-500">
            {t('startupConnectivity.goOfflineHint', 'Go offline stops every cloud call until the app is reloaded. The Online switch in the header keeps it for later visits.')}
          </p>
        )}
      </div>
    </div>
  )
}
