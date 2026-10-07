import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Loader2, SatelliteDish } from 'lucide-react'
import { Button, FOCUS_RING } from '../ui/volleyui/Button.jsx'
import { NOTICE } from '../ui/volleyui/tones.js'
import { cn } from '../ui/volleyui/cn.js'
import { getBackendUrl, getBackendOverride, setBackendOverride, clearBackendOverride, isAllowedBackendUrl, learnRelayWsPort, normalizeRelayAddress } from '../utils_beach/backendConfig_beach'

const LAST_SERVER_KEY = 'openbeach_last_server'

/**
 * ServerConnectionScreen — shown before PIN/match selection in Referee, Livescore apps.
 * Lets user choose between online (cloud) or local server, or type an IP.
 *
 * @param {Object} props
 * @param {function} props.onConnected - Called when server is confirmed reachable, with { serverUrl }
 * @param {boolean} [props.skipIfAutoConnect] - If true and URL params have server/match, skip this screen
 */
export default function ServerConnectionScreen({ onConnected, skipIfAutoConnect = true }) {
  const { t } = useTranslation()
  const [mode, setMode] = useState('online') // 'online' | 'local'
  const [localAddress, setLocalAddress] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'checking' | 'connected' | 'failed'
  const [errorMsg, setErrorMsg] = useState(null)
  const [lastServer, setLastServer] = useState(null)

  // Load last used server from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAST_SERVER_KEY)
      if (saved) setLastServer(JSON.parse(saved))
    } catch { /* ignore */ }
  }, [])

  // Check URL params for auto-connect (server param)
  useEffect(() => {
    if (!skipIfAutoConnect) return
    const params = new URLSearchParams(window.location.search)
    const serverParam = params.get('server')
    if (serverParam) {
      const url = serverParam.startsWith('http') ? serverParam : `https://${serverParam}`
      connectToServer(url, true)
    }
  }, [skipIfAutoConnect]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveLastServer = useCallback((url, label) => {
    try {
      localStorage.setItem(LAST_SERVER_KEY, JSON.stringify({ url, label, timestamp: Date.now() }))
    } catch { /* ignore */ }
  }, [])

  const connectToServer = useCallback(async (url, isAutoConnect = false) => {
    setStatus('checking')
    setErrorMsg(null)

    // Normalize URL: http:// added, and a LAN address typed without a port
    // gets OpenBeach's desktop relay port (5174)
    const serverUrl = normalizeRelayAddress(url)

    // Validate URL to prevent SSRF / protocol abuse
    try {
      const parsed = new URL(serverUrl)
      // Only a LAN / localhost relay or an openvolley.app host: the session
      // token goes wherever this points (backendConfig.isAllowedBackendUrl)
      if (!['http:', 'https:'].includes(parsed.protocol) || !isAllowedBackendUrl(serverUrl)) {
        setStatus('failed')
        setErrorMsg(t('connection.invalidUrl', 'Invalid server URL'))
        return
      }
    } catch {
      setStatus('failed')
      setErrorMsg(t('connection.invalidUrl', 'Invalid server URL'))
      return
    }

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)

      const response = await fetch(`${serverUrl}/health`, {
        method: 'GET',
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        setStatus('connected')
        setBackendOverride(serverUrl)
        // A desktop relay takes the WebSocket on a port of its own: ask it
        // before the referee / livescore connects (never throws)
        await learnRelayWsPort(serverUrl, { timeoutMs: 2500 })
        const label = serverUrl.includes('openvolley.app') || serverUrl.includes('openbeach.app') ? 'Cloud' : 'Local'
        saveLastServer(serverUrl, label)
        // Brief delay to show connected state
        setTimeout(() => {
          onConnected({ serverUrl })
        }, isAutoConnect ? 0 : 400)
      } else {
        setStatus('failed')
        setErrorMsg(t('connection.serverNotResponding', 'Server not responding'))
      }
    } catch (err) {
      setStatus('failed')
      if (err.name === 'AbortError') {
        setErrorMsg(t('connection.connectionTimeout', 'Connection timed out'))
      } else {
        setErrorMsg(t('connection.connectionFailed', 'Could not reach server'))
      }
    }
  }, [onConnected, saveLastServer, t])

  const handleOnlineConnect = useCallback(() => {
    // Clear any override — use default backend
    clearBackendOverride()
    const defaultUrl = getBackendUrl()
    if (defaultUrl) {
      connectToServer(defaultUrl)
    } else {
      setStatus('failed')
      setErrorMsg(t('connection.noBackendConfigured', 'No backend server configured'))
    }
  }, [connectToServer, t])

  const handleLocalConnect = useCallback(() => {
    if (!localAddress.trim()) return
    connectToServer(localAddress)
  }, [localAddress, connectToServer])

  const handleLastServerConnect = useCallback(() => {
    if (lastServer?.url) {
      connectToServer(lastServer.url)
    }
  }, [lastServer, connectToServer])

  const checking = status === 'checking'

  return (
    <div className="ov-kit flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 px-4 py-8 text-stone-800">
      <div className="w-full max-w-sm rounded-2xl border border-stone-200/70 bg-white p-5 shadow-card-lg sm:p-6">
        <h2 className="text-center text-xl font-bold tracking-tight text-stone-900">
          {t('connection.connectToServer', 'Connect to Server')}
        </h2>
        <p className="mb-6 mt-1 text-center text-sm text-stone-500">
          {t('connection.selectServerMode', 'Choose how to connect')}
        </p>

        {/* Online (automatic) */}
        <button
          type="button"
          onClick={handleOnlineConnect}
          disabled={checking}
          aria-pressed={mode === 'online'}
          className={cn(
            'mb-3 flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors disabled:cursor-wait',
            FOCUS_RING,
            mode === 'online' ? 'border-slate-900 bg-stone-50' : 'border-stone-200 bg-white hover:bg-stone-50'
          )}
        >
          <Globe size={22} className="shrink-0 text-stone-500" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-stone-900">{t('connection.onlineAutomatic', 'Online (automatic)')}</span>
            <span className="mt-0.5 block font-mono text-xs text-stone-500">backend.openvolley.app</span>
          </span>
        </button>

        {/* Local server */}
        <div className={cn('rounded-xl border p-4', mode === 'local' ? 'border-slate-900 bg-stone-50' : 'border-stone-200 bg-white')}>
          <div className="mb-3 flex items-center gap-3">
            <SatelliteDish size={22} className="shrink-0 text-stone-500" aria-hidden="true" />
            <div className="min-w-0">
              <label htmlFor="ob-local-server" className="block text-sm font-semibold text-stone-900">{t('connection.localServer', 'Local server')}</label>
              <div className="mt-0.5 text-xs text-stone-500">{t('connection.enterIPAddress', 'Enter IP address')}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              id="ob-local-server"
              type="text"
              inputMode="url"
              autoComplete="off"
              value={localAddress}
              onChange={(e) => { setLocalAddress(e.target.value); setMode('local') }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleLocalConnect() }}
              placeholder="192.168.1.42:5174"
              className="h-11 min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 font-mono text-sm text-stone-900 outline-none focus:ring-2 focus:ring-red-500"
            />
            <Button variant="dark" size="xl" onClick={handleLocalConnect} disabled={!localAddress.trim() || checking}>
              {t('connection.connect', 'Connect')}
            </Button>
          </div>
        </div>

        {/* Last used server */}
        {lastServer && (
          <Button variant="secondary" size="xl" block className="mt-3" onClick={handleLastServerConnect} disabled={checking}>
            <span className="truncate">
              {t('connection.lastUsed', 'Last used')}: {lastServer.label || lastServer.url}
              {lastServer.url !== (getBackendOverride() || getBackendUrl()) && (
                <span className="ml-2 text-stone-400">({hostOf(lastServer.url)})</span>
              )}
            </span>
          </Button>
        )}

        {/* Status */}
        {status === 'checking' && (
          <div role="status" className={cn(NOTICE.info, 'mt-4 justify-center')}>
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            {t('connection.checking', 'Connecting...')}
          </div>
        )}
        {status === 'connected' && (
          <div role="status" className={cn(NOTICE.success, 'mt-4 text-center')}>
            {t('connection.connectedSuccess', 'Connected!')}
          </div>
        )}
        {status === 'failed' && (
          <div role="alert" className={cn(NOTICE.error, 'mt-4 flex items-center justify-between gap-3')}>
            <span>{errorMsg}</span>
            <Button variant="secondary" size="sm" onClick={() => setStatus('idle')}>
              {t('connection.retry', 'Retry')}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function hostOf(url) {
  try { return new URL(url).host } catch { return url }
}
