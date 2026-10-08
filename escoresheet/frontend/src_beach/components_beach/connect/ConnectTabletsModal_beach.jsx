import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Tablet } from 'lucide-react'
import { Button } from '../../ui/volleyui/Button.jsx'
import { EmptyState } from '../../ui/volleyui/EmptyState.jsx'
import { Modal } from '../../ui/volleyui/Modal.jsx'
import { confirmDialog } from '../../ui/volleyui/uiStore.js'
import { AuthContext } from '../../contexts_beach/AuthContext_beach'
import LoginModal from '../auth/LoginModal_beach'
import { getSyncStatus } from '../../hooks_beach/useSyncQueue_beach'
import { getApiUrl, getLocalServerStatusUrl, isCloudBlockedOnThisPort } from '../../utils_beach/backendConfig_beach'
import { readRelayBundle, relayMatchKey, scorerPublisher, scorerRelay } from '../../utils_beach/relayPublisher_beach'
import { buildConnectionPins } from '../../utils_beach/connectionPins_beach'
import { db } from '../../db_beach/db_beach'
import { TABLET_ROLES, cloudRoleUrl, firstOfKind, hallInterfaces, lanRoleUrl, roleAccess, wifiQrString } from './tabletLinks_beach'
import {
  bluetoothNetwork, displayedWifi, firewall, hotspot, isTabletNetworkAvailable, needsFirewallStep, netError, renewWifiPassword
} from './tabletNetwork_beach'
import { BluetoothPanel, HallPanel, HotspotPanel, ServerPanel } from './NetworkPanels_beach'
import { TransportPicker } from './TransportPicker_beach'
import { RoleCards } from './RoleCards_beach'
import { CopyLinkButton, ScanPanel } from './ScanPanel_beach'
import { Disclosure, StepHeading, useRoleLabels } from './parts_beach'
import {
  PICKABLE_ROLES, connectedSummary, defaultRole, initialTransport, readView, roleStatus, saveView, transportOf,
  transportOptions, viewFor
} from './connectView_beach'

const POLL_MS = 6000

/**
 * Tell the relay at once (OpenVolley 011c7cad): it checks the referee PIN
 * itself, and away from the Scoreboard it would only hear of a switched role
 * with the 30 s backup sync, so a referee typing the PIN shown here was told
 * it is wrong (and a role switched off could still get in meanwhile).
 */
export async function syncMatchToRelay(matchId, { relay = scorerRelay, publisher = scorerPublisher, read = readRelayBundle } = {}) {
  if (!relay.isOpen()) return false
  try {
    const bundle = await read(db, matchId)
    if (!bundle?.key) return false
    return publisher.sync(bundle.key, bundle.local)
  } catch (err) {
    console.warn('[ConnectTablets] relay sync failed:', err?.message)
    return false
  }
}

/**
 * Let a role in (or out) on the scorer's match: the local match, the cloud
 * copy through the sync queue with every PIN (a partial connection_pins
 * write would erase the other PINs on the server), and the relay at once.
 */
export async function setRoleEnabled(matchId, access, enabled, { syncRelay = syncMatchToRelay } = {}) {
  await db.matches.update(matchId, { [access.field]: enabled })
  const m = await db.matches.get(matchId)
  if (m?.seed_key) {
    await db.sync_queue.add({
      resource: 'match',
      action: 'update',
      payload: { id: m.seed_key, connections: { [access.syncField]: enabled }, connection_pins: buildConnectionPins(m) },
      ts: new Date().toISOString(),
      status: 'queued'
    })
  }
  await syncRelay(matchId)
}

/** Poll `load` every POLL_MS while `active`. */
function usePoll(active, load) {
  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const run = () => { if (!cancelled) load(() => cancelled) }
    run()
    const timer = setInterval(run, POLL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [active, load])
}

/** The shared sync status (useSyncQueue_beach), without running a second queue. */
function useSyncStatus(active) {
  const [status, setStatus] = useState(() => getSyncStatus())
  useEffect(() => {
    if (!active) return undefined
    setStatus(getSyncStatus())
    const timer = setInterval(() => setStatus(getSyncStatus()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return status
}

/**
 * The relay's view of who watches the match (GET /api/server/connections on
 * the backend the app talks to): { connections, reachable }. Null
 * connections when it cannot be read: the dialog then never claims "waiting".
 */
function useRelayConnections(matchKey, { enabled, fetchImpl, intervalMs = 5000 }) {
  const [connections, setConnections] = useState(null)
  useEffect(() => {
    if (!enabled || !matchKey) {
      setConnections(null)
      return undefined
    }
    let cancelled = false
    const url = getApiUrl(`/api/server/connections?matchId=${encodeURIComponent(matchKey)}`)
    const load = async () => {
      if (!url) return
      let body = null
      try {
        const response = await fetchImpl(url, { headers: { Accept: 'application/json' } })
        const type = response.ok ? (response.headers?.get?.('content-type') || '') : ''
        if (response.ok && (!type || type.includes('json'))) body = await response.json()
      } catch { body = null }
      if (!cancelled) setConnections(body && typeof body === 'object' && Array.isArray(body.clients) ? body : null)
    }
    load()
    const timer = setInterval(load, intervalMs)
    return () => { cancelled = true; clearInterval(timer) }
  }, [matchKey, enabled, fetchImpl, intervalMs])
  return { connections, reachable: !!connections }
}

// The local server's state while the desktop app still reads its Wi-Fi
const LAN_PENDING = Object.freeze({ loading: true, status: null })

/**
 * "Connect tablets", in three steps (ported from OpenVolley
 * ConnectTabletsModal: dc95555d, 44a2ee72, 42a5f74b, 9d2faef4):
 *
 *   1. How tablets connect: the venue Wi-Fi, a Wi-Fi this computer creates
 *      (desktop app), the internet (cloud; scorer signed in, match synced)
 *      or a Bluetooth network this computer serves (desktop app on Linux).
 *   2. Which tablet: the referee (switched on here to be let in) or the
 *      livescore; each with its live state. Beach has no bench app.
 *   3. Scan, then enter the PIN: the picked tablet's code and its PIN.
 *
 * Links only preselect the match; the referee tablet asks for the referee
 * PIN, which is shown here and never put in a link or a QR code. The game PIN
 * is never shown (the relay accepts it for every role). A referee that is
 * off gets no code: its tablet would be told its (right) PIN is wrong.
 */
export default function ConnectTabletsModal({ open, onClose, match = null, fetchImpl = fetch, win = typeof window !== 'undefined' ? window : undefined }) {
  const { t } = useTranslation()
  const labels = useRoleLabels()
  // Outside an AuthProvider (a test, an embedded page) there is no account
  const auth = useContext(AuthContext) || null
  const syncStatus = useSyncStatus(open)
  const desktop = isTabletNetworkAvailable(win)
  const statusUrl = getLocalServerStatusUrl()
  const served = !!statusUrl
  const cloudBlocked = isCloudBlockedOnThisPort()

  // { tab, lanMode, hallIp }: the saved shape (connectView_beach); a saved
  // connection that cannot work on this device opens on the recommendation
  const [view, setView] = useState(() => {
    const saved = readView()
    const options = transportOptions({ served, desktop, relayLoading: served, cloudBlocked })
    return { ...viewFor(saved, initialTransport(transportOf(saved), options)), hallIp: saved.hallIp }
  })
  const updateView = (fn) => setView(v => { const next = fn(v); saveView(next); return next })
  const chooseTransport = (id) => updateView(v => viewFor(v, id))
  const setHallIp = (ip) => updateView(v => ({ ...v, hallIp: ip || null }))
  const transport = transportOf(view)

  const [relay, setRelay] = useState({ loading: served, status: null })
  const [hs, setHs] = useState({ loading: desktop, status: null, busy: false, error: null })
  const [bt, setBt] = useState({ loading: desktop, status: null, busy: false, error: null })
  // Windows: is the installer's firewall rule for the tablets there?
  // undefined = not answered yet (no step meanwhile), null = the check failed
  const [fw, setFw] = useState(undefined)
  const [showLogin, setShowLogin] = useState(false)
  const [roleOverride, setRoleOverride] = useState({})
  // Bumped when the remembered Wi-Fi password changes (it lives in localStorage)
  const [, setWifiRev] = useState(0)

  // -- local server status (addresses of every network) --
  const loadRelay = useCallback((cancelled) => {
    if (!statusUrl) return
    fetchImpl(statusUrl, { headers: { Accept: 'application/json' } })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(status => { if (!cancelled()) setRelay({ loading: false, status }) })
      .catch(() => { if (!cancelled()) setRelay(r => ({ loading: false, status: r.status })) })
  }, [statusUrl, fetchImpl])
  usePoll(open && served, loadRelay)

  // -- the laptop's Wi-Fi (desktop app) --
  const hotspotVisible = open && desktop && view.tab === 'lan' && view.lanMode === 'laptop'
  const loadHotspot = useCallback((cancelled) => {
    hotspot.status(win)
      .then(status => { if (!cancelled()) setHs(s => ({ ...s, loading: false, status })) })
      .catch(err => { if (!cancelled()) setHs(s => ({ ...s, loading: false, error: s.error || netError(err) })) })
  }, [win])
  usePoll(hotspotVisible, loadHotspot)
  // On opening: a Wi-Fi already on means the tablets use it
  useEffect(() => {
    if (!open || !desktop) return undefined
    let cancelled = false
    hotspot.status(win).then(status => {
      if (cancelled) return
      setHs(s => ({ ...s, loading: false, status }))
      if (status?.active) setView(v => ({ ...v, tab: 'lan', lanMode: 'laptop' }))
    }).catch(() => { if (!cancelled) setHs(s => ({ ...s, loading: false })) })
    return () => { cancelled = true }
  }, [open, desktop, win])

  // -- the firewall (Windows desktop app): read once per opening --
  useEffect(() => {
    if (!open || !desktop) return undefined
    let cancelled = false
    firewall.status(win)
      .then(status => { if (!cancelled) setFw(status || null) })
      .catch(() => { if (!cancelled) setFw(null) })
    return () => { cancelled = true }
  }, [open, desktop, win])
  const firewallStep = desktop && needsFirewallStep(fw, hs.status)

  // -- the laptop's Bluetooth network (desktop app) --
  const loadBluetooth = useCallback((cancelled) => {
    bluetoothNetwork.status(win)
      .then(status => { if (!cancelled()) setBt(s => ({ ...s, loading: false, status })) })
      .catch(err => { if (!cancelled()) setBt(s => ({ ...s, loading: false, error: s.error || netError(err) })) })
  }, [win])
  usePoll(open && desktop && view.tab === 'bluetooth', loadBluetooth)

  const act = async (setter, fn) => {
    setter(s => ({ ...s, busy: true, error: null }))
    try {
      const status = await fn()
      setter(s => ({ ...s, busy: false, status }))
      loadRelay(() => false)
    } catch (err) {
      setter(s => ({ ...s, busy: false, error: netError(err) }))
    }
  }

  // -- the match --
  const seedKey = match ? (relayMatchKey(match) || match.seed_key || match.externalId || null) : null
  const matchView = useMemo(() => (match ? { ...match, ...roleOverride } : null), [match, roleOverride])
  const gameNumber = match ? (match.gameNumber ?? match.gameN ?? match.game_n ?? null) : null
  useEffect(() => { setRoleOverride({}) }, [match?.id])

  const [selectedRole, setSelectedRole] = useState(() => defaultRole(r => roleAccess(match, r)))
  // Another match: start again on its first tablet still to connect
  useEffect(() => { setSelectedRole(defaultRole(r => roleAccess(match, r))) }, [match?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleRole = async (role, enabled) => {
    const access = roleAccess(match, role)
    if (!match?.id || !access.field) return
    setRoleOverride(o => ({ ...o, [access.field]: enabled }))
    try {
      await setRoleEnabled(match.id, access, enabled)
    } catch (err) {
      console.error('[ConnectTablets] could not switch', role, err)
      setRoleOverride(o => ({ ...o, [access.field]: !enabled }))
    }
  }

  const relayTablets = useRelayConnections(open && seedKey ? String(seedKey) : null, { enabled: open, fetchImpl })
  const clients = relayTablets.connections?.clients || null
  // Referee tablets on this match right now (the relay's view)
  const tabletsOnMatch = Array.isArray(clients)
    ? clients.filter(c => c?.role === 'referee' && (!seedKey || String(c.matchId) === String(seedKey))).length
    : 0

  /** Ask before cutting tablets off; true when there is nothing to ask. */
  const confirmCut = (title, message, confirmLabel) => confirmDialog({
    title,
    message,
    confirmLabel,
    cancelLabel: t('common.cancel', 'Cancel'),
    tone: 'danger'
  })
  const tabletsGone = (count) => (count > 0
    ? ` ${t('connectTablets.confirm.tabletsOn', 'Tablets connected right now: {{count}}.', { count })}`
    : '')

  // One stray click must not break a running match: creating the Wi-Fi on
  // the laptop's only Wi-Fi card leaves the venue Wi-Fi at once (every tablet
  // on it drops off, cloud sync pauses), and stopping a network drops the
  // tablets on it.
  const startHotspot = async () => {
    if (hs.status?.takesOverWifi) {
      const network = hs.status.leavesNetwork || t('connectTablets.confirm.itsWifi', 'its Wi-Fi')
      const ok = await confirmCut(
        t('connectTablets.confirm.leaveTitle', 'Leave the venue Wi-Fi?'),
        t('connectTablets.confirm.leaveMessage', 'This computer leaves {{network}}: tablets on it disconnect and cloud sync pauses until the computer is back on it (or on a network cable).', { network }) + tabletsGone(tabletsOnMatch),
        t('connectTablets.hotspotStart', 'Create Wi-Fi')
      )
      if (!ok) return
    }
    act(setHs, () => hotspot.start(win))
  }
  const stopHotspot = async () => {
    const count = Math.max(tabletsOnMatch, hs.status?.clients || 0)
    if (count > 0) {
      const ok = await confirmCut(
        t('connectTablets.confirm.stopWifiTitle', 'Stop the tablets’ Wi-Fi?'),
        t('connectTablets.confirm.stopMessage', 'The tablets on it disconnect.') + tabletsGone(count),
        t('connectTablets.hotspotStop', 'Stop Wi-Fi')
      )
      if (!ok) return
    }
    act(setHs, () => hotspot.stop(win))
  }
  const stopBluetooth = async () => {
    if (tabletsOnMatch > 0) {
      const ok = await confirmCut(
        t('connectTablets.confirm.stopBtTitle', 'Stop the Bluetooth network?'),
        t('connectTablets.confirm.stopMessage', 'The tablets on it disconnect.') + tabletsGone(tabletsOnMatch),
        t('connectTablets.btStop', 'Stop Bluetooth network')
      )
      if (!ok) return
    }
    act(setBt, () => bluetoothNetwork.stop(win))
  }

  // -- links for the chosen connection --
  // The desktop app reads the Wi-Fi this computer is on (hotspot status) next
  // to the server's addresses: until both have answered the dialog shows
  // neither, so it fills in one change (it changed three times within 83 ms:
  // "Reading the local server...", the addresses and codes, the Wi-Fi name)
  const lan = desktop && hs.loading ? LAN_PENDING : relay
  const port = lan.status?.port || (typeof window !== 'undefined' ? window.location.port : '') || null
  const halls = hallInterfaces(lan.status)
  const hallAddress = halls.find(i => i.ip === view.hallIp)?.ip || halls[0]?.ip || null
  const hotspotIp = hs.status?.active ? (hs.status.gatewayIp || firstOfKind(lan.status, 'hotspot')?.ip || null) : null
  // Only a Bluetooth network this computer serves: never one it merely joined
  // (tethered to a phone), which the tablets cannot reach. The desktop app
  // knows; a page elsewhere has only the relay's report.
  const btIp = desktop
    ? ((bt.status?.active && bt.status?.supported && bt.status?.ip) || null)
    : (firstOfKind(lan.status, 'bluetooth')?.ip || null)

  let ip = null
  let noUrlText = ''
  if (view.tab === 'lan' && view.lanMode === 'hall') {
    ip = served ? hallAddress : null
    noUrlText = served ? t('connectTablets.noAddress', 'No venue network') : t('connectTablets.needsDesktop', 'Needs the desktop app')
  } else if (view.tab === 'lan') {
    ip = hotspotIp
    noUrlText = !desktop
      ? t('connectTablets.needsDesktop', 'Needs the desktop app')
      : hs.status && !hs.status.supported
        ? t('connectTablets.notHere', 'Not available on this computer')
        : t('connectTablets.createWifiFirst', 'Create the Wi-Fi first (step 1)')
  } else if (view.tab === 'bluetooth') {
    ip = served ? btIp : null
    noUrlText = !desktop
      ? t('connectTablets.needsDesktop', 'Needs the desktop app')
      : bt.status && !bt.status.supported
        ? t('connectTablets.notHere', 'Not available on this computer')
        : t('connectTablets.startBtFirst', 'Start the Bluetooth network first (step 1)')
  } else if (cloudBlocked) {
    noUrlText = t('connectTablets.reason.cloudBlocked', 'Cloud is off in this app window')
  }
  const rows = TABLET_ROLES.map(role => (view.tab === 'server'
    ? { role, url: cloudBlocked ? null : cloudRoleUrl(role, seedKey) }
    : { role, url: lanRoleUrl(ip, port, role, seedKey) }))
  const urlOf = (role) => rows.find(r => r.role === role)?.url || null
  // Signed out on the internet: the cloud does not have this match, so its
  // code would open an empty page. The link can still be copied.
  const signInFirst = view.tab === 'server' && !cloudBlocked && !!auth && !auth.user

  const wifi = displayedWifi(hs.status)
  // A hotspot started outside the app without a known password gets no
  // Wi-Fi code (it would say "no password")
  const wifiQr = view.tab === 'lan' && view.lanMode === 'laptop' && hs.status?.active && wifi?.ssid && wifi?.password
    ? { qr: wifiQrString({ ssid: wifi.ssid, password: wifi.password }), ssid: wifi.ssid }
    : null
  const newPassword = () => {
    if (renewWifiPassword(wifi)) setWifiRev(n => n + 1)
  }

  // -- step 1: which connections can work here --
  const options = transportOptions({
    served,
    desktop,
    relayLoading: lan.loading,
    halls,
    hotspot: hs.status,
    bluetooth: bt.status,
    bluetoothFound: !!firstOfKind(lan.status, 'bluetooth'),
    platform: hs.status?.platform || fw?.platform || null,
    cloudBlocked
  })

  // -- steps 2 and 3: each tablet's state --
  const statuses = {}
  for (const role of PICKABLE_ROLES) {
    statuses[role] = roleStatus({
      role,
      access: roleAccess(matchView, role),
      clients,
      matchKey: seedKey,
      transport,
      reachable: relayTablets.reachable
    })
  }
  const cards = PICKABLE_ROLES.map(role => ({
    role,
    team: null,
    access: roleAccess(matchView, role),
    status: statuses[role]
  }))
  const picked = PICKABLE_ROLES.includes(selectedRole) ? selectedRole : 'referee'
  const summary = connectedSummary(statuses)

  const step1Id = 'connect-step-1'
  const step2Id = 'connect-step-2'

  const footer = (
    <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-2">
      <p className="w-full min-w-0 text-xs text-stone-600 sm:w-auto sm:flex-1" data-testid="devices-connected">
        {seedKey && (summary.connected.length
          ? summary.on > 1
            ? t('connectTablets.footer.connected', 'Connected: {{roles}} · {{count}} of {{total}} tablets', {
              roles: summary.connected.map(r => labels[r]).join(', '),
              count: summary.connected.length,
              total: summary.on
            })
            : t('connectTablets.footer.connectedOnly', 'Connected: {{roles}}', { roles: summary.connected.map(r => labels[r]).join(', ') })
          : transport !== 'server' && !relayTablets.reachable
            ? t('connectTablets.card.unknown', 'Live status not available')
            : t('connectTablets.footer.none', 'No tablet connected yet'))}
        {seedKey && transport === 'server' && (
          <span className="text-stone-400"> · {t('connectTablets.footer.thisNetworkOnly', 'Live status shows tablets on this network only')}</span>
        )}
      </p>
      <Disclosure
        label={t('connectTablets.otherScorer', 'Scorer on another computer')}
        className="mr-auto min-w-0 max-w-sm sm:mr-0"
        testId="role-row-main"
      >
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs leading-snug text-stone-500">
            {t('connectTablets.otherScorerText', 'Opens a separate scorer app with its own matches. It does not follow this match.')}
          </p>
          <CopyLinkButton url={urlOf('main')} />
        </div>
      </Disclosure>
      <Button variant="dark" onClick={onClose} className="h-10">{t('connectTablets.done', 'Done')}</Button>
    </div>
  )

  // ov-kit: the kit's scoped preflight (the legacy unlayered button styles
  // would repaint the kit buttons otherwise)
  return (
    <div className="ov-kit contents">
      <Modal
        open={open}
        onClose={onClose}
        size="xl"
        layout="sections"
        className="max-w-5xl lg:min-h-[min(85vh,40rem)]"
        icon={Tablet}
        title={t('connectTablets.title', 'Connect tablets')}
        description={t('connectTablets.description', 'The referee follows this match on their own tablet. Three steps: choose the connection, pick a tablet, scan and enter its PIN.')}
        closeLabel={t('common.close', 'Close')}
        footer={footer}
      >
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_17rem] lg:grid-cols-[19rem_minmax(0,1fr)_17rem]">
          <section className="min-w-0 md:col-span-2 lg:col-span-1" aria-labelledby={step1Id}>
            <StepHeading n={1} id={step1Id}>{t('connectTablets.step.connect', 'How tablets connect')}</StepHeading>
            <TransportPicker options={options} value={transport} onChange={chooseTransport} labelledBy={step1Id} />
            <div className="mt-3">
              {transport === 'hall' && (
                <HallPanel
                  served={served}
                  loading={lan.loading}
                  interfaces={halls}
                  selectedIp={hallAddress}
                  onSelectIp={setHallIp}
                  firewallStep={firewallStep}
                  network={hs.status?.leavesNetwork || null}
                />
              )}
              {transport === 'laptop' && (
                <HotspotPanel
                  desktop={desktop}
                  status={hs.status}
                  loading={hs.loading}
                  busy={hs.busy}
                  error={hs.error}
                  wifi={wifi}
                  wifiQr={wifiQr}
                  firewallStep={firewallStep}
                  onStart={startHotspot}
                  onStop={stopHotspot}
                  onNewPassword={newPassword}
                />
              )}
              {transport === 'server' && (
                <ServerPanel
                  user={auth?.user || null}
                  onSignIn={auth ? () => setShowLogin(true) : null}
                  syncStatus={syncStatus}
                  cloudBlocked={cloudBlocked}
                  gameNumber={gameNumber}
                />
              )}
              {transport === 'bluetooth' && (
                <BluetoothPanel
                  desktop={desktop}
                  status={bt.status}
                  loading={bt.loading}
                  busy={bt.busy}
                  error={bt.error}
                  ip={btIp}
                  onStart={() => act(setBt, () => bluetoothNetwork.start(win))}
                  onStop={stopBluetooth}
                />
              )}
            </div>
          </section>

          {match ? (
            <>
              <section className="min-w-0" aria-labelledby={step2Id}>
                <StepHeading n={2} id={step2Id}>{t('connectTablets.step.tablet', 'Which tablet')}</StepHeading>
                <RoleCards
                  cards={cards}
                  selected={picked}
                  onSelect={setSelectedRole}
                  onToggleRole={toggleRole}
                  labelledBy={step2Id}
                />
              </section>
              <section className="min-w-0 rounded-xl border border-stone-200/70 bg-stone-50/60 p-3">
                <StepHeading n={3}>{t('connectTablets.step.scan', 'Scan, then enter the PIN')}</StepHeading>
                <ScanPanel
                  role={picked}
                  url={urlOf(picked)}
                  access={roleAccess(matchView, picked)}
                  status={statuses[picked]}
                  noUrlText={noUrlText}
                  gateText={signInFirst ? t('connectTablets.signInFirst', 'Sign in first (step 1)') : null}
                  onLetIn={match?.id ? () => toggleRole(picked, true) : null}
                />
              </section>
            </>
          ) : (
            <section className="min-w-0 lg:col-span-2" data-testid="no-match">
              <EmptyState icon={Tablet} title={t('connectTablets.noMatchTitle', 'Open a match first')}>
                {t('connectTablets.noMatchText', 'Codes and PINs belong to a match.')}
              </EmptyState>
            </section>
          )}
        </div>
      </Modal>

      {showLogin && typeof document !== 'undefined' && createPortal(
        <LoginModal open onClose={() => setShowLogin(false)} />,
        document.body
      )}
    </div>
  )
}
