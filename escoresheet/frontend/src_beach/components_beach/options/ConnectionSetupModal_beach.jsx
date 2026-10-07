import { useState, useEffect, useCallback, useId } from 'react'
import { useTranslation } from 'react-i18next'
import { QRCodeSVG } from 'qrcode.react'
import { Check, Copy, Globe, QrCode, Wifi } from 'lucide-react'
import Modal from '../Modal_beach'
import { Button } from '../../ui/volleyui/Button.jsx'
import { Switch } from '../../ui/volleyui/Switch.jsx'
import { SegmentedControl } from '../../ui/volleyui/SegmentedControl.jsx'
import { cn } from '../../ui/volleyui/cn.js'
import { buildConnectionPins } from '../../utils_beach/connectionPins_beach'
import {
  getLocalIP,
  getServerStatus,
  getConnectionCount,
  copyToClipboard,
  buildAppUrls,
  buildWebSocketUrl,
  getCloudBackendUrl,
  buildCloudUrls
} from '../../utils_beach/networkInfo_beach'
import { db } from '../../db_beach/db_beach'

export default function ConnectionSetupModal({
  open,
  onClose,
  matchId,
  matchSeedKey,
  match,
  refereePin,
  team1Pin,
  team2Pin,
  gameNumber
}) {
  const { t } = useTranslation()
  const [connectionMode, setConnectionMode] = useState('lan') // 'lan' | 'internet'
  const [localIP, setLocalIP] = useState(null)
  const [serverStatus, setServerStatus] = useState({ running: false })
  const [connectionCount, setConnectionCount] = useState({ totalClients: 0 })
  const [loading, setLoading] = useState(true)
  const [copyFeedback, setCopyFeedback] = useState(null)
  const [showQRModal, setShowQRModal] = useState(null) // role name or null

  const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80')
  const protocol = window.location.protocol.replace(':', '')
  const cloudBackendUrl = getCloudBackendUrl()
  const seedKey = matchSeedKey || match?.seed_key

  // Load network info on mount
  useEffect(() => {
    if (!open) return

    const loadNetworkInfo = async () => {
      setLoading(true)
      try {
        const [ip, status, connections] = await Promise.all([
          getLocalIP(),
          getServerStatus(),
          getConnectionCount()
        ])
        setLocalIP(ip)
        setServerStatus(status)
        setConnectionCount(connections)
      } catch (err) {
        console.error('Error loading network info:', err)
      } finally {
        setLoading(false)
      }
    }

    loadNetworkInfo()

    // Poll for connection count updates
    const interval = setInterval(async () => {
      try {
        const connections = await getConnectionCount()
        setConnectionCount(connections)
      } catch (err) {
        // Ignore polling errors
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [open])

  // Handle copy with feedback
  const handleCopy = useCallback(async (text, label) => {
    const result = await copyToClipboard(text)
    if (result.success) {
      setCopyFeedback(label)
      setTimeout(() => setCopyFeedback(null), 2000)
    }
  }, [])

  // Toggle connection enabled/disabled for a role
  const handleToggleConnection = useCallback(async (field, syncField, pinField, enabled) => {
    if (!matchId) return
    try {
      await db.matches.update(matchId, { [field]: enabled })
      const m = await db.matches.get(matchId)
      if (m?.seed_key) {
        await db.sync_queue.add({
          resource: 'match',
          action: 'update',
          payload: {
            id: m.seed_key,
            connections: { [syncField]: enabled },
            // Whole object from the local match (bench_team1 / bench_team2 read
            // team1Pin / team2Pin): a partial one would erase the other PINs
            ...(pinField ? { connection_pins: buildConnectionPins(m) } : {})
          },
          ts: new Date().toISOString(),
          status: 'queued'
        })
      }
    } catch (error) {
      console.error('[ConnectionSetup] Failed to toggle connection:', error)
    }
  }, [matchId])

  // Build URLs
  const lanUrls = localIP ? buildAppUrls(localIP, port, protocol) : null
  // The WebSocket port the relay reports, else OpenBeach's desktop relay's (8081)
  const wsUrl = localIP ? buildWebSocketUrl(localIP, serverStatus?.wsPort || undefined, protocol === 'https') : null
  const cloudUrls = cloudBackendUrl ? buildCloudUrls(cloudBackendUrl) : null

  // Current URLs based on mode
  const currentUrls = connectionMode === 'lan' ? lanUrls : cloudUrls

  // Build a connection URL for a specific role
  const buildConnectionUrl = (role) => {
    if (!currentUrls) return null
    const base = currentUrls.main || currentUrls.referee?.replace('/referee', '')
    if (!base) return null

    const paths = {
      referee: '/referee',
      bench_team1: '/bench',
      bench_team2: '/bench',
      livescore: '/livescore'
    }
    const params = new URLSearchParams()
    if (seedKey) params.set('match', seedKey)
    if (role === 'bench_team1') params.set('team', 'team1')
    if (role === 'bench_team2') params.set('team', 'team2')
    const queryStr = params.toString()
    return `${base}${paths[role] || ''}${queryStr ? '?' + queryStr : ''}`
  }

  const copyButton = (text, key, label) => (
    <Button variant="secondary" size="sm" icon={copyFeedback === key ? Check : Copy} onClick={() => handleCopy(text, key)}>
      {copyFeedback === key ? t('options.copied') : label}
    </Button>
  )

  const roles = [
    { role: 'referee', label: t('connection.role.referee', 'Referee dashboard'), pin: refereePin, enabled: match?.refereeConnectionEnabled === true, dbField: 'refereeConnectionEnabled', syncField: 'referee_enabled', pinSyncField: 'referee' },
    { role: 'bench_team1', label: t('connection.role.bench_team1', 'Team 1 bench'), pin: team1Pin, enabled: match?.team1TeamConnectionEnabled === true, dbField: 'team1TeamConnectionEnabled', syncField: 'team1_bench_enabled', pinSyncField: 'bench_team1' },
    { role: 'bench_team2', label: t('connection.role.bench_team2', 'Team 2 bench'), pin: team2Pin, enabled: match?.team2TeamConnectionEnabled === true, dbField: 'team2TeamConnectionEnabled', syncField: 'team2_bench_enabled', pinSyncField: 'bench_team2' },
    { role: 'livescore', label: t('connection.role.livescore', 'Livescore'), pin: null }
  ]
  const qrRole = roles.find(r => r.role === showQRModal)

  return (
    <>
      <Modal
        tone="light"
        title={t('connection.title')}
        open={open}
        onClose={onClose}
        width={520}
      >
        <div className="ov-kit space-y-4 text-stone-800">
          <div>
            <p className="mb-2 text-sm text-stone-600">{t('connection.chooseConnection')}</p>
            <SegmentedControl
              ariaLabel={t('connection.chooseConnection')}
              value={connectionMode}
              onChange={(v) => { if (v === 'lan' || cloudBackendUrl) setConnectionMode(v) }}
              options={[
                { value: 'lan', icon: Wifi, label: t('connectionSetup.lan', 'LAN'), title: t('connection.sameWifi') },
                { value: 'internet', icon: Globe, label: t('connectionSetup.internet', 'Internet'), title: cloudBackendUrl ? t('connection.cloudRelay') : t('connection.notConfigured') }
              ]}
            />
            <p className="mt-1.5 text-xs text-stone-500">
              {connectionMode === 'lan' ? t('connection.sameWifi') : (cloudBackendUrl ? t('connection.cloudRelay') : t('connection.notConfigured'))}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200/70 bg-stone-50/60 p-3 text-sm">
            {connectionMode === 'lan' ? (
              loading ? (
                <p className="text-stone-500">{t('connection.detectingNetwork')}</p>
              ) : localIP ? (
                <dl className="space-y-1.5">
                  <div className="flex justify-between gap-3"><dt className="text-stone-500">{t('connection.ipAddress')}</dt><dd className="font-mono text-stone-900">{localIP}:{port}</dd></div>
                  <div className="flex justify-between gap-3"><dt className="text-stone-500">WebSocket</dt><dd className="min-w-0 break-all text-right font-mono text-stone-900">{wsUrl}</dd></div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-stone-500">{t('connection.status')}</dt>
                    <dd className={cn('inline-flex items-center gap-1.5 font-medium', serverStatus.running ? 'text-emerald-700' : 'text-red-700')}>
                      <span className={cn('h-2 w-2 rounded-full', serverStatus.running ? 'bg-green-500' : 'bg-red-500')} aria-hidden="true" />
                      {serverStatus.running ? t('options.running') : t('options.notRunning')}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p role="alert" className="text-red-700">{t('connection.couldNotDetectIP')}</p>
              )
            ) : cloudBackendUrl ? (
              <div className="flex flex-wrap justify-between gap-2"><span className="text-stone-500">URL</span><span className="break-all font-mono text-stone-900">{cloudBackendUrl}</span></div>
            ) : (
              <p role="alert" className="text-red-700">{t('connection.noCloudBackend')}</p>
            )}
          </div>

          <ul className="divide-y divide-stone-100">
            {roles.map(r => (
              <ConnectionRow
                key={r.role}
                {...r}
                url={buildConnectionUrl(r.role)}
                t={t}
                copyButton={copyButton}
                onToggle={r.dbField ? () => handleToggleConnection(r.dbField, r.syncField, r.pinSyncField, !r.enabled) : null}
                onShowQR={() => setShowQRModal(showQRModal === r.role ? null : r.role)}
              />
            ))}
          </ul>

          <div className="flex items-center justify-center gap-2 rounded-xl border border-stone-200/70 bg-stone-50/60 p-3">
            <span className={cn('text-2xl font-bold tabular-nums', connectionCount.totalClients > 0 ? 'text-emerald-700' : 'text-stone-400')}>
              {connectionCount.totalClients}
            </span>
            <span className="text-sm text-stone-600">
              {connectionCount.totalClients === 1 ? t('connection.deviceConnected') : t('connection.devicesConnected')}
            </span>
          </div>
        </div>
      </Modal>

      {/* Large QR for one role */}
      {qrRole && (
        <Modal
          tone="light"
          title={qrRole.label}
          open
          onClose={() => setShowQRModal(null)}
          width={360}
          zIndex={1100}
        >
          <figure className="ov-kit flex flex-col items-center gap-3 pb-2">
            <div className="rounded-xl border border-stone-200 bg-white p-3">
              <QRCodeSVG value={buildConnectionUrl(qrRole.role) || ''} size={260} level="M" marginSize={1} title={t('connection.scanToConnect', 'Scan to connect')} />
            </div>
            <figcaption className="text-xs text-stone-500">{t('connection.scanToConnect', 'Scan to connect')}</figcaption>
          </figure>
        </Modal>
      )}
    </>
  )
}

/** One role (referee, a bench, livescore): its switch, PIN, QR and link. */
function ConnectionRow({ label, pin, enabled, url, onToggle, onShowQR, copyButton, role, t }) {
  const labelId = useId()
  const on = enabled !== false
  return (
    <li className={cn('py-3', !on && 'opacity-70')}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {onToggle && <Switch size="lg" checked={!!enabled} onCheckedChange={onToggle} aria-labelledby={labelId} />}
          <span id={labelId} className="text-sm font-semibold text-stone-900">{label}</span>
        </div>
        {on && url && (
          <Button variant="secondary" size="md" icon={QrCode} onClick={onShowQR}>
            {t('connection.showQR', 'Show QR')}
          </Button>
        )}
      </div>
      {on && (
        <div className="mt-2 space-y-2">
          {pin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-stone-500">PIN</span>
              <code className="rounded-md border border-stone-200 bg-stone-50 px-2 py-0.5 font-mono text-base font-semibold tracking-[0.3em] text-stone-900">{pin}</code>
              {copyButton(pin, `${role}-pin`, t('options.copy'))}
            </div>
          )}
          {url && (
            <div className="flex items-center gap-3">
              <div className="shrink-0 rounded-md border border-stone-200 bg-white p-1">
                <QRCodeSVG value={url} size={60} level="M" marginSize={0} title={`${label} QR`} />
              </div>
              <div className="min-w-0 flex-1">
                <code className="block break-all font-mono text-[11px] leading-snug text-stone-500">{url}</code>
                <div className="mt-1">{copyButton(url, `${role}-url`, t('options.copyUrl', 'Copy link'))}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
