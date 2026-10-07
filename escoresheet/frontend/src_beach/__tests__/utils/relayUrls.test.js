/**
 * backendConfig_beach: the venue relay (OpenBeach desktop 5174 / 8081,
 * OpenVolley desktop 5173 / 8080, the venue server on one port), the native
 * app, and the cloud API kept apart from the relay. Ported from OpenVolley's
 * backendConfig tests with OpenBeach's ports.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  setBackendOverride,
  getBackendOverride,
  isAllowedBackendUrl,
  isStaticHost,
  isStaticDeployment,
  isNativeApp,
  isServedFromLocalServer,
  getLocalServerStatusUrl,
  getBackendUrl,
  getRelayWebSocketUrl,
  getApiUrl,
  getCloudApiUrl,
  getCloudWebSocketUrl,
  isCloudApiSplit,
  isLanBackendUrl,
  isServedFromLanOrigin,
  isCloudBlockedOnThisPort,
  learnRelayWsPort,
  applyServerParam,
  relayWsPortFor,
  rememberRelayWsPort
} from '../../utils_beach/backendConfig_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

const realLocation = window.location
const setLocation = (url) => {
  const u = new URL(url)
  Object.defineProperty(window, 'location', {
    value: { hostname: u.hostname, protocol: u.protocol, port: u.port, origin: u.origin, host: u.host, href: u.href },
    writable: true,
    configurable: true
  })
}

beforeEach(() => {
  useMemoryLocalStorage()
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_BACKEND_URL', '')
  vi.stubEnv('VITE_CLOUD_API_URL', '')
})
afterEach(() => {
  delete window.Capacitor
  vi.unstubAllEnvs()
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

describe('the backend override', () => {
  it('keeps only trusted targets (LAN, localhost, openvolley.app)', () => {
    for (const u of ['http://192.168.1.20:5174', 'http://10.0.0.5:8080', 'http://beach.local', 'https://backend.openvolley.app', 'http://localhost:5174']) {
      expect(isAllowedBackendUrl(u), u).toBe(true)
    }
    for (const u of ['https://evil.example.com', 'ftp://192.168.1.2', 'javascript:alert(1)', '', null, 'http://172.32.0.1']) {
      expect(isAllowedBackendUrl(u), String(u)).toBe(false)
    }
    setBackendOverride('https://evil.example.com')
    expect(getBackendOverride()).toBeNull()
    setBackendOverride('http://192.168.1.20:5174')
    expect(getBackendOverride()).toBe('http://192.168.1.20:5174')
    // a stored value that is no longer trusted is dropped on read
    window.localStorage.setItem('openbeach_backend_override', 'https://evil.example.com')
    expect(getBackendOverride()).toBeNull()
  })
})

describe('static hosts and the local server status', () => {
  it('treats Pages builds like *.openvolley.app (no backend behind them)', () => {
    for (const host of ['beach.openvolley.app', 'openvolley.app', 'openbeach.pages.dev', 'x.github.io']) {
      expect(isStaticHost(host), host).toBe(true)
    }
    for (const host of ['localhost', '192.168.1.20', 'beach.local', 'example.com']) {
      expect(isStaticHost(host), host).toBe(false)
    }
    setLocation('https://openbeach-referee.pages.dev/')
    expect(isStaticDeployment()).toBe(true)
  })

  it('asks for /api/server/status only where a local server serves the page', () => {
    setLocation('https://beach.openvolley.app/')
    expect(getLocalServerStatusUrl()).toBeNull()
    setLocation('http://192.168.1.20:5174/')
    expect(getLocalServerStatusUrl()).toBe('http://192.168.1.20:5174/api/server/status')
    setLocation('file:///opt/app/index_beach.html')
    expect(getLocalServerStatusUrl()).toBeNull()
  })
})

describe('the native app (Capacitor WebView on https://localhost)', () => {
  beforeEach(() => {
    setLocation('https://localhost/')
    window.Capacitor = { isNativePlatform: () => true }
  })

  it('is not mistaken for a local server and talks to the cloud', () => {
    expect(isNativeApp()).toBe(true)
    expect(isServedFromLocalServer()).toBe(false)
    expect(getLocalServerStatusUrl()).toBeNull()
    expect(getBackendUrl()).toBe('https://backend.openvolley.app')
    expect(getRelayWebSocketUrl()).toBe('wss://backend.openvolley.app')
    delete window.Capacitor
    expect(isServedFromLocalServer()).toBe(true)
  })

  it('reaches the OpenBeach desktop relay at <laptop>:5174 on its WebSocket port 8081', () => {
    setBackendOverride('http://192.168.1.20:5174')
    expect(getBackendUrl()).toBe('http://192.168.1.20:5174')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:8081')
    // an OpenVolley desktop relay at the venue: 5173 -> 8080
    setBackendOverride('http://192.168.1.21:5173')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.21:8080')
    // the venue server (OpenVolley backend --local, the Pi): one port for both
    setBackendOverride('http://192.168.1.30:8080')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.30:8080')
  })

  it('uses the WebSocket port the relay named in /api/server/status', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ wsPort: 8091 }) }))
    setBackendOverride('http://192.168.1.20:5175')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:5175') // not known yet
    await expect(learnRelayWsPort('http://192.168.1.20:5175', { fetchImpl })).resolves.toBe('8091')
    expect(fetchImpl).toHaveBeenCalledWith('http://192.168.1.20:5175/api/server/status', expect.anything())
    expect(relayWsPortFor('http://192.168.1.20:5175/')).toBe('8091')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:8091')
    // a named port wins over the 5174 -> 8081 default
    rememberRelayWsPort('http://192.168.1.20:5174', 9000)
    setBackendOverride('http://192.168.1.20:5174')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:9000')
  })

  it('applies a ?server= link and learns a venue relay port in the background', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ wsPort: 8085 }) })
    applyServerParam('http://192.168.1.20:5176')
    expect(getBackendOverride()).toBe('http://192.168.1.20:5176')
    await vi.waitFor(() => expect(relayWsPortFor('http://192.168.1.20:5176')).toBe('8085'))
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:8085')
    fetchSpy.mockClear()
    applyServerParam('backend.openvolley.app') // bare host: https, never asked
    expect(getBackendOverride()).toBe('https://backend.openvolley.app')
    applyServerParam('http://evil.example.com:5174') // refused: nothing fetched
    expect(getBackendOverride()).toBe('https://backend.openvolley.app')
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('never asks the cloud for a port, nor trusts a bad answer', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ wsPort: 8080 }) }))
    await expect(learnRelayWsPort('https://backend.openvolley.app', { fetchImpl })).resolves.toBeNull()
    await expect(learnRelayWsPort('http://beach.local', { fetchImpl })).resolves.toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
    const bad = vi.fn(async () => ({ ok: true, json: async () => ({ wsPort: 'nope' }) }))
    await expect(learnRelayWsPort('http://192.168.1.20:5174', { fetchImpl: bad })).resolves.toBeNull()
    const down = vi.fn(async () => { throw new Error('offline') })
    await expect(learnRelayWsPort('http://192.168.1.20:5174', { fetchImpl: down })).resolves.toBeNull()
    expect(relayWsPortFor('http://192.168.1.20:5174')).toBeNull()
  })

  it('keeps cloud sync on the cloud while the relay is a venue LAN relay', () => {
    setBackendOverride('http://192.168.1.20:5174')
    expect(getApiUrl('/api/match/list')).toBe('http://192.168.1.20:5174/api/match/list')
    expect(getCloudApiUrl('/api/db')).toBe('https://backend.openvolley.app/api/db')
    expect(getCloudWebSocketUrl()).toBe('wss://backend.openvolley.app')
    expect(isCloudApiSplit()).toBe(true)
  })
})

describe('pages served by a local relay', () => {
  it('the desktop window at localhost:5174: relay WebSocket on 8081, cloud in the cloud', () => {
    setLocation('http://localhost:5174/')
    expect(isServedFromLocalServer()).toBe(true)
    expect(isServedFromLanOrigin()).toBe(false)
    expect(getBackendUrl()).toBe('http://localhost:5174')
    expect(getRelayWebSocketUrl()).toBe('ws://localhost:8081')
    // the port the relay's /api/server/status named wins
    expect(getRelayWebSocketUrl({ wsPort: 8099 })).toBe('ws://localhost:8099')
    expect(isCloudBlockedOnThisPort()).toBe(false)
    expect(getCloudApiUrl('/api/db')).toBe('https://backend.openvolley.app/api/db')
    expect(isCloudApiSplit()).toBe(true)
  })

  it('a venue tablet at http://<laptop>:5174/referee: relay WebSocket on 8081, no cloud calls from a LAN origin', () => {
    setLocation('http://192.168.1.20:5174/referee')
    expect(isServedFromLanOrigin()).toBe(true)
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.20:8081')
    expect(getCloudApiUrl('/api/db')).toBe('http://192.168.1.20:5174/api/db')
    expect(isCloudApiSplit()).toBe(false)
  })

  it('a page from the venue server (one port for both) stays on its own port', () => {
    setLocation('http://192.168.1.30:8080/')
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.30:8080')
    rememberRelayWsPort('http://192.168.1.30:8080', 8090)
    expect(getRelayWebSocketUrl()).toBe('ws://192.168.1.30:8090')
    setLocation('https://beach.myclub.ch/')
    expect(getRelayWebSocketUrl()).toBe('wss://beach.myclub.ch')
  })

  it('the desktop window moved off 5174 has no cloud (its CORS would reject it)', () => {
    setLocation('http://localhost:5180/')
    expect(isCloudBlockedOnThisPort()).toBe(true)
    expect(getCloudApiUrl('/api/db')).toBeNull()
    expect(getCloudWebSocketUrl()).toBeNull()
    expect(getApiUrl('/api/server/status')).toBe('http://localhost:5180/api/server/status')
    vi.stubEnv('VITE_CLOUD_API_URL', 'https://cloud.example.org')
    expect(isCloudBlockedOnThisPort()).toBe(false)
  })

  it('a page opened from disk has no relay', () => {
    setLocation('file:///opt/app/index_beach.html')
    expect(getRelayWebSocketUrl()).toBeNull()
  })
})

describe('builds with VITE_BACKEND_URL and the dev server', () => {
  it('web build on beach.openvolley.app: one backend for everything', () => {
    vi.stubEnv('VITE_BACKEND_URL', 'https://backend.openvolley.app')
    setLocation('https://beach.openvolley.app/')
    expect(getApiUrl('/api/match/list')).toBe('https://backend.openvolley.app/api/match/list')
    expect(getCloudApiUrl('/api/db')).toBe('https://backend.openvolley.app/api/db')
    expect(getRelayWebSocketUrl()).toBe('wss://backend.openvolley.app')
    expect(isCloudApiSplit()).toBe(false)
  })

  it('the dev server: relay WebSocket on VITE_WS_PORT or 8080', () => {
    vi.stubEnv('DEV', true)
    setLocation('http://localhost:6173/')
    expect(getRelayWebSocketUrl()).toBe('ws://localhost:8080')
    vi.stubEnv('VITE_WS_PORT', '8081')
    expect(getRelayWebSocketUrl()).toBe('ws://localhost:8081')
    expect(isCloudBlockedOnThisPort()).toBe(false)
  })

  it('isLanBackendUrl tells venue relays from cloud hosts', () => {
    for (const u of ['http://localhost:8081', 'http://127.0.0.1:5174', 'http://192.168.1.20:8080', 'http://10.0.0.183:5174', 'http://beach.local:5174', 'http://[::1]:8081']) {
      expect(isLanBackendUrl(u), u).toBe(true)
    }
    for (const u of ['https://backend.openvolley.app', 'https://cloud.example.org', 'http://172.32.0.1', null, '', 'not a url']) {
      expect(isLanBackendUrl(u), String(u)).toBe(false)
    }
  })
})
