import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getCloudApiUrl,
  getCloudWebSocketUrl,
  isCloudOffline,
  setCloudOffline,
  resetCloudOffline,
  isRelayOriginPage
} from '../../utils_beach/backendConfig_beach'
import { cloudStatusFor, isCloudStatusOk, shouldWaitForCloudSync } from '../../utils_beach/cloudStatus_beach'
import { publishAccess, accountMayWriteCloud, NO_ACCESS } from '../../lib_beach/access_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

const realLocation = window.location
const setLocation = (url) => {
  const u = new URL(url)
  Object.defineProperty(window, 'location', {
    value: { hostname: u.hostname, protocol: u.protocol, port: u.port, origin: u.origin, host: u.host, href: u.href, search: '' },
    writable: true,
    configurable: true
  })
}

beforeEach(() => {
  useMemoryLocalStorage()
  resetCloudOffline()
  vi.stubEnv('DEV', false)
  vi.stubEnv('VITE_BACKEND_URL', '')
  vi.stubEnv('VITE_CLOUD_API_URL', '')
})
afterEach(() => {
  resetCloudOffline()
  vi.unstubAllEnvs()
  Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
})

// (c) The desktop window kept calling backend.openvolley.app /api/db after
// "Go offline": offline mode was only a flag in the UI.
describe('offline mode: no cloud call', () => {
  it('the desktop window has no cloud URL (and no cloud socket) once offline', () => {
    setLocation('http://localhost:5174/')
    expect(getCloudApiUrl('/api/db')).toBe('https://backend.openvolley.app/api/db')
    setCloudOffline(true)
    expect(isCloudOffline()).toBe(true)
    expect(getCloudApiUrl('/api/db')).toBeNull()
    expect(getCloudApiUrl('/api/auth/session')).toBeNull()
    expect(getCloudWebSocketUrl()).toBeNull()
    setCloudOffline(false)
    expect(getCloudApiUrl('/api/db')).toBe('https://backend.openvolley.app/api/db')
  })

  it('the web build too', () => {
    setLocation('https://beach.openvolley.app/')
    vi.stubEnv('VITE_BACKEND_URL', 'https://backend.openvolley.app')
    setCloudOffline(true)
    expect(getCloudApiUrl('/api/db')).toBeNull()
    expect(getCloudWebSocketUrl()).toBeNull()
  })

  it('"Go offline" holds for the session only; the header switch persists', () => {
    setCloudOffline(true)
    expect(localStorage.getItem('offlineMode')).toBeNull()
    resetCloudOffline() // a reload
    expect(isCloudOffline()).toBe(false)

    setCloudOffline(true, { persist: true })
    expect(localStorage.getItem('offlineMode')).toBe('true')
    resetCloudOffline()
    expect(isCloudOffline()).toBe(true)

    setCloudOffline(false)
    expect(localStorage.getItem('offlineMode')).toBeNull()
    resetCloudOffline()
    expect(isCloudOffline()).toBe(false)
  })

  it('announces the switch (the sync queue re-probes or stops at once)', () => {
    const seen = []
    const onSwitch = (e) => seen.push(e.detail.offline)
    window.addEventListener('openbeach-offline-mode', onSwitch)
    setCloudOffline(true)
    setCloudOffline(false)
    window.removeEventListener('openbeach-offline-mode', onSwitch)
    expect(seen).toEqual([true, false])
  })
})

describe('isRelayOriginPage', () => {
  it('a venue tablet on the hall network, not the desktop window or the web', () => {
    setLocation('http://192.168.1.20:5174/')
    expect(isRelayOriginPage()).toBe(true)
    setLocation('http://localhost:5174/')
    expect(isRelayOriginPage()).toBe(false)
    setLocation('https://beach.openvolley.app/')
    expect(isRelayOriginPage()).toBe(false)
  })
})

// (a) The startup check read the sync status before the probe answered: a
// healthy cloud showed "OpenVolley Cloud: Offline" for ~30 s.
describe('cloudStatusFor', () => {
  it('connecting while the queue has not answered yet', () => {
    expect(cloudStatusFor({ syncStatus: 'connecting' }).status).toBe('connecting')
    expect(cloudStatusFor({ syncStatus: null }).status).toBe('connecting')
  })

  it('connected once synced, syncing or waiting for a sign-in', () => {
    for (const s of ['synced', 'syncing', 'auth_required']) {
      expect(cloudStatusFor({ syncStatus: s }).status, s).toBe('connected')
    }
  })

  it('offline mode is not an error', () => {
    const c = cloudStatusFor({ syncStatus: 'offline', offlineMode: true })
    expect(c.status).toBe('not_applicable')
    expect(isCloudStatusOk(c.status)).toBe(true)
  })

  it('a venue tablet has no cloud: not an error either', () => {
    for (const s of ['connecting', 'offline', 'online_no_supabase', 'error']) {
      const c = cloudStatusFor({ syncStatus: s, relayOrigin: true })
      expect(c.status, s).toBe('not_configured')
      expect(isCloudStatusOk(c.status)).toBe(true)
    }
  })

  it('real failures stay failures', () => {
    expect(isCloudStatusOk(cloudStatusFor({ syncStatus: 'offline' }).status)).toBe(false)
    expect(isCloudStatusOk(cloudStatusFor({ syncStatus: 'error' }).status)).toBe(false)
    expect(cloudStatusFor({ canUseCloud: false }).status).toBe('not_configured')
  })
})

// (b) A venue tablet waited 9-13 s on "Syncing to database…" and "Initialising
// the match" for a cloud it does not have.
describe('shouldWaitForCloudSync', () => {
  it('waits only when the sync can finish now', () => {
    expect(shouldWaitForCloudSync({ syncStatus: 'synced' })).toBe(true)
    expect(shouldWaitForCloudSync({ syncStatus: 'syncing' })).toBe(true)
  })

  it('never on a venue tablet, offline, without a cloud or a session', () => {
    expect(shouldWaitForCloudSync({ syncStatus: 'synced', relayOrigin: true })).toBe(false)
    expect(shouldWaitForCloudSync({ syncStatus: 'synced', offlineMode: true })).toBe(false)
    expect(shouldWaitForCloudSync({ syncStatus: 'synced', hasCloud: false })).toBe(false)
    for (const s of ['auth_required', 'online_no_supabase', 'offline', 'error', 'connecting']) {
      expect(shouldWaitForCloudSync({ syncStatus: s }), s).toBe(false)
    }
  })

  // An OpenVolley account not in OpenBeach yet (or one waiting for approval):
  // the backend refuses its matches, each setup step waited ~9 s for nothing
  it('never for an account that may not write to the cloud yet', () => {
    expect(shouldWaitForCloudSync({ syncStatus: 'syncing', canWrite: false })).toBe(false)
    expect(shouldWaitForCloudSync({ syncStatus: 'synced', canWrite: true })).toBe(true)
  })
})

describe('accountMayWriteCloud', () => {
  afterEach(() => publishAccess(null))

  it('blocks only a known access that cannot score', () => {
    publishAccess(null)
    expect(accountMayWriteCloud()).toBe(true)
    publishAccess({ ...NO_ACCESS })
    expect(accountMayWriteCloud()).toBe(true) // not known yet
    publishAccess({ ...NO_ACCESS, known: true, needsJoin: true, isPending: true })
    expect(accountMayWriteCloud()).toBe(false)
    publishAccess({ ...NO_ACCESS, known: true, isPending: true })
    expect(accountMayWriteCloud()).toBe(false)
    publishAccess({ ...NO_ACCESS, known: true, canScore: true, roles: ['beach:scorer'] })
    expect(accountMayWriteCloud()).toBe(true)
  })
})

describe('the sync queue\'s first status', () => {
  it('connecting on a device that is online, not offline', async () => {
    vi.resetModules()
    const { getSyncStatus } = await import('../../hooks_beach/useSyncQueue_beach')
    expect(getSyncStatus()).toBe('connecting')
  })

  it('offline with offline mode kept from an earlier visit', async () => {
    localStorage.setItem('offlineMode', 'true')
    vi.resetModules()
    const { getSyncStatus } = await import('../../hooks_beach/useSyncQueue_beach')
    expect(getSyncStatus()).toBe('offline')
  })
})
