import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// Ported from OpenVolley src/components/connect/__tests__/ConnectTabletsModal.test.jsx
// (dc95555d, 44a2ee72, 42a5f74b, 011c7cad, 9d2faef4), for openbeach: the
// tablets are the referee and the livescore (no bench app), the desktop
// relay serves on 5174, the cloud links go to the beach sites.

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback, opts) => {
      let s = String(typeof fallback === 'string' ? fallback : key)
      for (const [k, v] of Object.entries(opts || {})) s = s.replaceAll(`{{${k}}}`, String(v))
      return s
    }
  })
}))

const backend = vi.hoisted(() => ({ statusUrl: 'http://localhost:5174/api/server/status', cloudBlocked: false }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  getLocalServerStatusUrl: () => backend.statusUrl,
  getApiUrl: (path) => `http://localhost:5174${path}`,
  isCloudBlockedOnThisPort: () => backend.cloudBlocked
}))
vi.mock('../../hooks_beach/useSyncQueue_beach', () => ({ getSyncStatus: () => 'synced' }))
const relay = vi.hoisted(() => ({ open: true, synced: [] }))
vi.mock('../../utils_beach/relayPublisher_beach', () => ({
  relayMatchKey: (m) => m?.seed_key || null,
  readRelayBundle: async (_db, matchId) => ({ key: 'match_1759740000000_ab12cd', local: { match: { id: matchId } } }),
  scorerRelay: { isOpen: () => relay.open },
  scorerPublisher: { sync: (key, local) => { relay.synced.push({ key, local }); return true } }
}))
const dbMock = vi.hoisted(() => ({
  matches: { update: vi.fn(async () => 1), get: vi.fn() },
  sync_queue: { add: vi.fn(async () => 1) }
}))
vi.mock('../../db_beach/db_beach', () => ({ db: dbMock }))
vi.mock('../../components_beach/auth/LoginModal_beach', () => ({ default: () => <div data-testid="login-modal" /> }))
import { AuthContext } from '../../contexts_beach/AuthContext_beach'
import { UiHost } from '../../ui/volleyui/UiHost.jsx'
import ConnectTabletsModal from '../../components_beach/connect/ConnectTabletsModal_beach'

// The account: undefined = no AuthProvider around the dialog
const authState = { value: undefined }

function renderModal(props) {
  const modal = <ConnectTabletsModal open onClose={() => {}} {...props} />
  return render(
    <>
      {authState.value === undefined ? modal : <AuthContext.Provider value={authState.value}>{modal}</AuthContext.Provider>}
      <UiHost />
    </>
  )
}

const STATUS = {
  running: true,
  localIP: '192.168.1.42',
  port: 5174,
  wsPort: 8081,
  interfaces: [
    { name: 'wlp1s0', ip: '192.168.1.42', kind: 'wifi' },
    { name: 'enp0s31f6', ip: '10.0.0.5', kind: 'ethernet' }
  ]
}

const SEED = 'match_1759740000000_ab12cd'

const MATCH = {
  id: 7,
  seed_key: SEED,
  gameNumber: 4711,
  refereePin: '123456',
  team1Pin: '234567',
  team2Pin: '345678',
  gamePin: '999999',
  refereeConnectionEnabled: true
}

/**
 * The local server: /api/server/status answers STATUS; /api/server/connections
 * the relay's clients (null: not readable).
 */
function server({ status = STATUS, clients = null } = {}) {
  return vi.fn(async (url) => {
    if (String(url).includes('/api/server/connections')) {
      if (!clients) return { ok: false, status: 404, json: async () => ({}) }
      return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ clients }) }
    }
    return { ok: true, json: async () => status }
  })
}

function tauri(handlers) {
  const invoke = vi.fn(async (cmd, args) => {
    if (!handlers[cmd]) throw { code: 'unknown', detail: cmd }
    return handlers[cmd](args)
  })
  return { __TAURI_INTERNALS__: { invoke }, invoke }
}

/** Step 1: pick a connection by its card's name. */
const choose = (name) => fireEvent.click(screen.getByRole('radio', { name }))
/** Step 2: pick a tablet. */
const pick = (role) => fireEvent.click(within(screen.getByTestId(`role-row-${role}`)).getByRole('radio'))
/** Step 3: the link the shown code encodes, or null without a code. */
const qrUrl = () => screen.queryByTestId('role-qr')?.getAttribute('data-url') || null
const scanText = () => screen.getByTestId('qr-panel').textContent

describe('ConnectTabletsModal_beach', () => {
  beforeEach(() => {
    useMemoryLocalStorage()
    backend.statusUrl = 'http://localhost:5174/api/server/status'
    backend.cloudBlocked = false
    dbMock.matches.update.mockClear()
    dbMock.matches.get.mockReset()
    dbMock.sync_queue.add.mockClear()
    relay.open = true
    relay.synced = []
    authState.value = undefined
  })

  it('venue Wi-Fi: three steps, a code per tablet, the PIN only on the scorer\'s screen', async () => {
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    expect(screen.getByText('Connect tablets')).toBeInTheDocument()
    expect(screen.getByText('How tablets connect')).toBeInTheDocument()
    expect(screen.getByText('Which tablet')).toBeInTheDocument()
    expect(screen.getByText('Scan, then enter the PIN')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Venue Wi-Fi' })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByTestId('transport-hall')).getByText('Recommended')).toBeInTheDocument()

    // the referee is let in and picked first
    await waitFor(() => expect(qrUrl()).toBe(`http://192.168.1.42:5174/referee?match=${SEED}`))
    expect(screen.getByTestId('pin-referee')).toHaveTextContent('123 456')
    expect(screen.getByTestId('pin-referee')).toHaveAttribute('aria-label', 'PIN 1 2 3 4 5 6')

    // beach has no bench app: the referee and the livescore only
    expect(within(screen.getByTestId('tablet-role-rows')).getAllByRole('radio')).toHaveLength(2)
    expect(screen.queryByTestId('role-row-bench_home')).toBeNull()

    // livescore follows the relay on the venue Wi-Fi: a code, no match, no PIN
    pick('livescore')
    expect(qrUrl()).toBe('http://192.168.1.42:5174/livescore')
    expect(screen.queryByTestId('pin-livescore')).toBeNull()
    expect(scanText()).toContain('No PIN needed')

    // the scoretable link sits in the footer, explained
    fireEvent.click(screen.getByRole('button', { name: 'Scorer on another computer' }))
    expect(screen.getByTestId('role-row-main')).toHaveTextContent('It does not follow this match.')

    // never the game PIN, never a bench PIN
    for (const pin of ['999999', '999 999', '234567', '345678']) expect(document.body.textContent).not.toContain(pin)
  })

  it('switches the venue address, and remembers it', async () => {
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    const select = await screen.findByRole('combobox', { name: 'Address' })
    fireEvent.change(select, { target: { value: '10.0.0.5' } })
    expect(qrUrl()).toBe(`http://10.0.0.5:5174/referee?match=${SEED}`)
    expect(JSON.parse(localStorage.getItem('ob_connect_tablets_view'))).toEqual({ tab: 'lan', lanMode: 'hall', hallIp: '10.0.0.5' })

    cleanup()
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    await waitFor(() => expect(qrUrl()).toBe(`http://10.0.0.5:5174/referee?match=${SEED}`))
  })

  it('lets the referee in: local match, the cloud copy with every PIN, and the relay at once', async () => {
    dbMock.matches.get.mockResolvedValue({ ...MATCH, refereeConnectionEnabled: true })
    renderModal({ match: { ...MATCH, refereeConnectionEnabled: false }, fetchImpl: server(), win: {} })
    expect(screen.getByTestId('scan-off')).toHaveTextContent('Referee is off. A tablet that scans now is told its PIN is wrong.')
    expect(qrUrl()).toBeNull()
    expect(screen.queryByTestId('pin-referee')).toBeNull()
    fireEvent.click(screen.getByRole('switch', { name: 'Let Referee in' }))
    await waitFor(() => expect(dbMock.sync_queue.add).toHaveBeenCalled())
    expect(dbMock.matches.update).toHaveBeenCalledWith(7, { refereeConnectionEnabled: true })
    const payload = dbMock.sync_queue.add.mock.calls[0][0].payload
    expect(payload).toMatchObject({ id: SEED, connections: { referee_enabled: true } })
    expect(payload.connection_pins).toEqual({ referee: '123456', bench_team1: '234567', bench_team2: '345678' })
    // the relay checks the referee PIN itself: it hears of the switch now,
    // not with the 30 s backup sync
    await waitFor(() => expect(relay.synced).toHaveLength(1))
    expect(relay.synced[0].key).toBe(SEED)
    await waitFor(() => expect(screen.getByTestId('pin-referee')).toHaveTextContent('123 456'))
  })

  it('the referee is let in from step 3 as well; no relay sync without a relay', async () => {
    relay.open = false
    dbMock.matches.get.mockResolvedValue({ ...MATCH })
    renderModal({ match: { ...MATCH, refereeConnectionEnabled: false }, fetchImpl: server(), win: {} })
    fireEvent.click(screen.getByRole('button', { name: 'Let Referee in' }))
    await waitFor(() => expect(dbMock.matches.update).toHaveBeenCalledWith(7, { refereeConnectionEnabled: true }))
    await waitFor(() => expect(qrUrl()).toBe(`http://192.168.1.42:5174/referee?match=${SEED}`))
    expect(relay.synced).toHaveLength(0)
  })

  it('a referee let in without a PIN says so and shows no code', () => {
    renderModal({ match: { ...MATCH, refereePin: null }, fetchImpl: server(), win: {} })
    expect(qrUrl()).toBeNull()
    expect(scanText()).toContain('This tablet has no PIN yet. Set one in Match setup.')
    expect(within(screen.getByTestId('role-row-referee')).getByText('On · no PIN yet')).toBeInTheDocument()
  })

  it('live status: waiting, then connected with the time and the address', async () => {
    const fetchImpl = server({ clients: [] })
    renderModal({ match: MATCH, fetchImpl, win: {} })
    await waitFor(() => expect(screen.getByTestId('role-status-referee')).toHaveTextContent('Waiting for the tablet…'))
    await waitFor(() => expect(qrUrl()).not.toBeNull())
    expect(screen.getByTestId('scan-status')).toHaveTextContent('Waiting for the tablet…')
    expect(screen.getByTestId('devices-connected')).toHaveTextContent('No tablet connected yet')

    cleanup()
    renderModal({
      match: MATCH,
      fetchImpl: server({ clients: [{ id: 'c1', role: 'referee', matchId: SEED, ip: '192.168.1.23', connectedAt: '2026-10-07T12:32:05.000Z' }] }),
      win: {}
    })
    await waitFor(() => expect(screen.getByTestId('role-status-referee')).toHaveTextContent('Connected · since 14:32'))
    expect(screen.getByTestId('role-status-referee')).toHaveAttribute('data-status', 'connected')
    await waitFor(() => expect(screen.getByTestId('scan-status')).toHaveTextContent('Tablet connected at 14:32 (…23)'))
    // one tablet: "Connected: Referee", never "1 of 1 tablets"
    expect(screen.getByTestId('devices-connected')).toHaveTextContent('Connected: Referee')
    expect(screen.getByTestId('devices-connected')).not.toHaveTextContent('of')
  })

  it('live status: never "waiting" when the relay cannot be read', () => {
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    expect(screen.getByTestId('role-status-referee')).toHaveTextContent('Live status not available')
    expect(screen.getByTestId('devices-connected')).toHaveTextContent('Live status not available')
  })

  it('in a browser: no Wi-Fi button, the desktop app and a travel router instead', async () => {
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    expect(within(screen.getByTestId('transport-laptop')).getByText('Needs the desktop app (Windows, Linux)')).toBeInTheDocument()
    choose('Wi-Fi from this computer')
    expect(screen.getByText(/OpenBeach desktop app \(Windows, Linux\) can create its own Wi-Fi/)).toBeInTheDocument()
    expect(screen.getByText(/travel router/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Create Wi-Fi/ })).toBeNull()
    expect(screen.getByTestId('scan-no-link')).toHaveTextContent('Needs the desktop app')
  })

  it('desktop app: creates the Wi-Fi and shows its code in step 1, the tablet\'s code in step 3', async () => {
    let active = false
    const win = tauri({
      hotspot_status: () => ({ supported: true, active, platform: 'linux', method: 'networkmanager', ssid: 'OpenBeach-AB12', password: 'example-Pq2m', takesOverWifi: true, gatewayIp: active ? '10.42.0.1' : null }),
      hotspot_start: () => { active = true; return { supported: true, active: true, ssid: 'OpenBeach-AB12', password: 'example-Pq2m', gatewayIp: '10.42.0.1' } },
      hotspot_stop: () => { active = false; return { supported: true, active: false, ssid: 'OpenBeach-AB12', password: 'example-Pq2m' } },
      bluetooth_status: () => ({ supported: false })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    choose('Wi-Fi from this computer')
    await waitFor(() => expect(screen.getByTestId('network-ssid')).toHaveTextContent('OpenBeach-AB12'))
    expect(screen.getByTestId('network-password')).toHaveTextContent('example-Pq2m')
    expect(screen.getByText(/leaves its current Wi-Fi/)).toBeInTheDocument()
    expect(screen.queryByTestId('wifi-qr')).toBeNull()
    expect(screen.getByTestId('scan-no-link')).toHaveTextContent('Create the Wi-Fi first (step 1)')
    expect(screen.queryByTestId('scan-status')).toBeNull()

    // one card: it leaves the venue Wi-Fi, so it asks first
    fireEvent.click(screen.getByRole('button', { name: 'Create Wi-Fi' }))
    expect(await screen.findByTestId('confirm-dialog')).toHaveTextContent('Leave the venue Wi-Fi?')
    fireEvent.click(screen.getByTestId('confirm-accept'))
    await waitFor(() => expect(screen.getByTestId('wifi-qr')).toBeInTheDocument())
    expect(screen.getByTestId('wifi-qr-caption')).toHaveTextContent('Scan to join this Wi-Fi first')
    expect(win.invoke).toHaveBeenCalledWith('hotspot_start', {})
    expect(qrUrl()).toBe(`http://10.42.0.1:5174/referee?match=${SEED}`)
    expect(JSON.parse(localStorage.getItem('ob_tablet_wifi'))).toEqual({ ssid: 'OpenBeach-AB12', password: 'example-Pq2m' })
    fireEvent.click(screen.getByRole('button', { name: 'How to join' }))
    expect(screen.getByText(/Choose “Stay connected”/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop Wi-Fi' }))
    await waitFor(() => expect(screen.queryByTestId('wifi-qr')).toBeNull())
    expect(win.invoke).toHaveBeenCalledWith('hotspot_stop', {})
  })

  it('desktop app: explains a laptop that cannot create a Wi-Fi', async () => {
    const win = tauri({
      hotspot_status: () => ({ supported: false, active: false, reason: 'no-ap-mode', detail: 'wlp1s0', ssid: 'OpenBeach-AB12', password: 'x' }),
      bluetooth_status: () => ({ supported: false })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(within(screen.getByTestId('transport-laptop')).getByText('This computer cannot create a Wi-Fi')).toBeInTheDocument())
    choose('Wi-Fi from this computer')
    await waitFor(() => expect(screen.getByText(/cannot act as an access point/)).toBeInTheDocument())
    expect(screen.getByText('wlp1s0')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create Wi-Fi' })).toBeNull()
  })

  it('create Wi-Fi: asks before stopping while the referee tablet is on it', async () => {
    const win = tauri({
      hotspot_status: () => ({ supported: true, active: true, platform: 'linux', ssid: 'OpenBeach-AB12', password: 'example-Pq2m', gatewayIp: '10.42.0.1' }),
      hotspot_stop: () => ({ supported: true, active: false, ssid: 'OpenBeach-AB12', password: 'example-Pq2m' }),
      bluetooth_status: () => ({ supported: false })
    })
    renderModal({ match: MATCH, fetchImpl: server({ clients: [{ role: 'referee', matchId: SEED, ip: '10.42.0.7', connectedAt: '2026-10-07T12:00:00.000Z' }] }), win })
    await waitFor(() => expect(screen.getByTestId('role-status-referee')).toHaveAttribute('data-status', 'connected'))
    fireEvent.click(await screen.findByRole('button', { name: 'Stop Wi-Fi' }))
    expect(await screen.findByTestId('confirm-dialog')).toHaveTextContent('Tablets connected right now: 1.')
    fireEvent.click(screen.getByTestId('confirm-cancel'))
    await waitFor(() => expect(screen.queryByTestId('confirm-dialog')).toBeNull())
    expect(win.invoke).not.toHaveBeenCalledWith('hotspot_stop', expect.anything())
  })

  it('internet, signed out: sign in first; the link can be copied but there is no code yet', async () => {
    authState.value = { user: null }
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    choose('Internet')
    expect(screen.getByTestId('server-game-number')).toHaveTextContent('4711')
    expect(screen.getByText('Synced')).toBeInTheDocument()
    expect(screen.getByText('Not signed in')).toBeInTheDocument()
    expect(qrUrl()).toBeNull()
    expect(screen.getByTestId('scan-no-link')).toHaveTextContent('Sign in first (step 1)')
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Type the address' }))
    expect(screen.getByTestId('scan-url')).toHaveTextContent(`https://beach-referee.openvolley.app/?match=${SEED}`)
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(screen.getByTestId('login-modal')).toBeInTheDocument()
  })

  it('internet, signed in: the beach site code, and a status that does not pretend to see cloud tablets', async () => {
    authState.value = { user: { email: 'scorer@example.org' } }
    renderModal({ match: MATCH, fetchImpl: server({ clients: [] }), win: {} })
    choose('Internet')
    expect(screen.getByTestId('server-account')).toHaveTextContent('scorer@example.org')
    expect(qrUrl()).toBe(`https://beach-referee.openvolley.app/?match=${SEED}`)
    expect(screen.getByTestId('pin-referee')).toHaveTextContent('123 456')
    expect(screen.getByTestId('role-status-referee')).toHaveTextContent('On · status not visible over the internet')
    expect(screen.getByTestId('devices-connected')).toHaveTextContent('Live status shows tablets on this network only')
    pick('livescore')
    expect(qrUrl()).toBe('https://beach-livescore.openvolley.app/')
  })

  it('internet where the cloud is blocked: dimmed with the reason, no links', () => {
    backend.cloudBlocked = true
    authState.value = { user: { email: 'scorer@example.org' } }
    localStorage.setItem('ob_connect_tablets_view', JSON.stringify({ tab: 'server', lanMode: 'hall' }))
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    // the saved choice cannot work here: the recommendation instead
    expect(screen.getByRole('radio', { name: 'Venue Wi-Fi' })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByTestId('transport-server')).getByText('Cloud is off in this app window')).toBeInTheDocument()
    choose('Internet')
    expect(screen.getByText(/does not run on port 5174/)).toBeInTheDocument()
    expect(qrUrl()).toBeNull()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
  })

  it('bluetooth: Windows says it cannot serve a Bluetooth network', async () => {
    const win = tauri({
      hotspot_status: () => ({ supported: true, active: false, platform: 'windows', ssid: 'a', password: 'b' }),
      bluetooth_status: () => ({ supported: false, reason: 'windows-cannot-serve', platform: 'windows' })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(within(screen.getByTestId('transport-bluetooth')).getByText('Windows cannot host a Bluetooth network')).toBeInTheDocument())
    choose('Bluetooth')
    await waitFor(() => expect(screen.getByText(/Windows cannot host a Bluetooth network for tablets/)).toBeInTheDocument())
    expect(screen.getByText(/Wi-Fi from this computer” instead/)).toBeInTheDocument()
    expect(screen.getByTestId('scan-no-link')).toHaveTextContent('Not available on this computer')
  })

  it('bluetooth: Linux starts the network and links its address', async () => {
    let active = false
    const win = tauri({
      hotspot_status: () => ({ supported: true, active: false, ssid: 'a', password: 'b' }),
      bluetooth_status: () => ({ supported: true, active, adapterName: 'framework', ip: active ? '10.42.1.1' : null, platform: 'linux' }),
      bluetooth_start: () => { active = true; return { supported: true, active: true, adapterName: 'framework', ip: '10.42.1.1', discoverable: true } }
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    choose('Bluetooth')
    expect(within(screen.getByTestId('transport-bluetooth')).getByText('Experimental')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Start Bluetooth network' }))
    await waitFor(() => expect(qrUrl()).toBe(`http://10.42.1.1:5174/referee?match=${SEED}`))
    fireEvent.click(screen.getByRole('button', { name: 'How to pair' }))
    expect(screen.getByText(/pair with “framework”/)).toBeInTheDocument()
  })

  it('Windows with the installer’s firewall rule: no manual firewall step, on either Wi-Fi', async () => {
    const win = tauri({
      firewall_status: () => ({ platform: 'windows', supported: true, ready: true, reason: null }),
      hotspot_status: () => ({ supported: true, active: true, platform: 'windows', method: 'mobile-hotspot', ssid: 'OpenBeach-AB12', password: 'example-Pq2m', gatewayIp: '192.168.137.1' }),
      bluetooth_status: () => ({ supported: false, reason: 'windows-cannot-serve', platform: 'windows' })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(qrUrl()).toBe(`http://192.168.137.1:5174/referee?match=${SEED}`))
    await waitFor(() => expect(win.invoke).toHaveBeenCalledWith('firewall_status', {}))
    expect(screen.queryByText(/tick “Public”/)).toBeNull()
    choose('Venue Wi-Fi')
    await waitFor(() => expect(qrUrl()).toBe(`http://192.168.1.42:5174/referee?match=${SEED}`))
    expect(screen.queryByTestId('firewall-step')).toBeNull()
  })

  it('Windows without the rule: the manual step names OpenBeach, on the venue Wi-Fi too', async () => {
    const win = tauri({
      firewall_status: () => ({ platform: 'windows', supported: true, ready: false, reason: 'rule-missing' }),
      hotspot_status: () => ({ supported: true, active: false, platform: 'windows', method: 'mobile-hotspot', ssid: 'OpenBeach-AB12', password: 'example-Pq2m' }),
      bluetooth_status: () => ({ supported: false, reason: 'windows-cannot-serve', platform: 'windows' })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(screen.getByTestId('firewall-step')).toHaveTextContent('Allow an app through firewall › OpenBeach › tick “Public”'))
  })

  it('Windows: no firewall step while the check has not answered (no flash on every opening)', async () => {
    let answer
    const win = tauri({
      firewall_status: () => new Promise(resolve => { answer = resolve }),
      hotspot_status: () => ({ supported: true, active: true, platform: 'windows', method: 'mobile-hotspot', ssid: 'OpenBeach-AB12', password: 'example-Pq2m', gatewayIp: '192.168.137.1' }),
      bluetooth_status: () => ({ supported: false, reason: 'windows-cannot-serve', platform: 'windows' })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(qrUrl()).toBe(`http://192.168.137.1:5174/referee?match=${SEED}`))
    await waitFor(() => expect(answer).toBeTypeOf('function'))
    expect(screen.queryByText(/tick “Public”/)).toBeNull()
    answer({ platform: 'windows', supported: true, ready: false, reason: 'blocked-by-rule' })
    await waitFor(() => expect(screen.getByTestId('firewall-step')).toHaveTextContent('tick “Public”'))
  })

  it('Linux: never a Windows firewall step', async () => {
    const win = tauri({
      firewall_status: () => ({ platform: 'linux', supported: false, ready: false, reason: 'unsupported-os' }),
      hotspot_status: () => ({ supported: true, active: true, platform: 'linux', ssid: 'OpenBeach-AB12', password: 'example-Pq2m', gatewayIp: '10.42.0.1' }),
      bluetooth_status: () => ({ supported: false })
    })
    renderModal({ match: MATCH, fetchImpl: server(), win })
    await waitFor(() => expect(qrUrl()).toBe(`http://10.42.0.1:5174/referee?match=${SEED}`))
    await waitFor(() => expect(win.invoke).toHaveBeenCalledWith('firewall_status', {}))
    expect(screen.queryByText(/tick “Public”/)).toBeNull()
  })

  it('without a local server (web build): opens on Internet; the venue Wi-Fi points to the desktop app', () => {
    backend.statusUrl = null
    localStorage.setItem('ob_connect_tablets_view', JSON.stringify({ tab: 'lan', lanMode: 'hall' }))
    renderModal({ match: null, fetchImpl: server(), win: {} })
    expect(screen.getByRole('radio', { name: 'Internet' })).toHaveAttribute('aria-checked', 'true')
    expect(within(screen.getByTestId('transport-hall')).getByText('Needs the desktop app or a venue box')).toBeInTheDocument()
    choose('Venue Wi-Fi')
    expect(screen.getByText(/need the OpenBeach desktop app/)).toBeInTheDocument()
    expect(screen.getByText(/serves the referee and livescore pages/)).toBeInTheDocument()
    // no match: no tablets, no codes
    expect(screen.getByTestId('no-match')).toHaveTextContent('Open a match first')
    expect(screen.queryByTestId('qr-panel')).toBeNull()
  })

  it('arrow keys move the choice in step 1 and step 2', () => {
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    fireEvent.keyDown(screen.getByRole('radio', { name: 'Venue Wi-Fi' }), { key: 'ArrowDown' })
    expect(screen.getByRole('radio', { name: 'Wi-Fi from this computer' })).toHaveAttribute('aria-checked', 'true')
    fireEvent.keyDown(within(screen.getByTestId('role-row-referee')).getByRole('radio'), { key: 'ArrowDown' })
    expect(within(screen.getByTestId('role-row-livescore')).getByRole('radio')).toHaveAttribute('aria-checked', 'true')
  })

  it('no hover-only tooltips (title=) anywhere in the dialog', async () => {
    authState.value = { user: null }
    renderModal({ match: MATCH, fetchImpl: server(), win: {} })
    await waitFor(() => expect(qrUrl()).not.toBeNull())
    expect(screen.getByRole('dialog').querySelectorAll('[title]')).toHaveLength(0)
    choose('Internet')
    expect(screen.getByRole('dialog').querySelectorAll('[title]')).toHaveLength(0)
  })
})
