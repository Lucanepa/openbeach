import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// OpenVolley audit round 3, SEC-06 (client half, owner decision 1): every
// OpenBeach referee PIN check named no match ({pin, type, sport} only), so
// the backend looked each one up among every open beach match (one guess
// tested against all of them), and 100 wrong lookups from anyone refused
// every OpenBeach referee in Switzerland for 10 minutes, the right PIN too
// (poc/beach/pin-search-lockout.sh). The checks now name the match: the
// backend's matchExternalId, the relay's matchId.

vi.hoisted(() => { globalThis.__APP_VERSION__ = 'test' })

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `http://backend.test${p}`,
  getCloudApiUrl: (p) => `http://backend.test${p}`,
  isCloudOffline: () => false,
  isRelayOriginPage: () => false,
  isBackendAvailable: () => true,
  getWebSocketUrl: () => null,
  getCloudWebSocketUrl: () => null,
  getBackendUrl: () => 'http://relay.test',
  getRelayWebSocketUrl: () => null,
  isLanBackendUrl: () => false
}))
vi.mock('../../db_beach/db_beach', () => ({ db: { sync_queue: { hook: () => {} } } }))

// The database reads of getMatchData's API fallback: a match row without its
// rosters (the match token expired), everything else empty
const apiState = vi.hoisted(() => ({ row: null }))
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const actual = await importOriginal()
  const builder = (table) => {
    const b = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'maybeSingle' || prop === 'single') return async () => ({ data: table === 'matches' ? apiState.row : null, error: null })
        if (prop === 'then') return (resolve) => resolve({ data: [], error: null })
        return () => b
      }
    })
    return b
  }
  return { ...actual, apiFrom: (table) => builder(table) }
})

import {
  validatePinSupabase,
  validatePin,
  getMatchData,
  rememberMatchAccess,
  forgetMatchAccess,
  matchAccessFor,
  pinMatchKey
} from '../../utils_beach/serverDataSync_beach'
import { revalidateRefereeSession, validateRefereePin, listedMatchKey } from '../../RefereeApp_beach'

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
})
const bodyOf = (call) => JSON.parse(call[1].body)
const beachMatch = (id) => ({ id, sportType: 'beach', gameNumber: 12, team1Team: 'A / B', team2Team: 'C / D', refereeConnectionEnabled: true })

beforeEach(() => forgetMatchAccess())
afterEach(() => {
  vi.restoreAllMocks()
  apiState.row = null
})

describe('the cloud PIN check names its match (POST /api/match/validate-connection-pin)', () => {
  it('sends matchExternalId with the PIN when the match is known', async () => {
    const fetchImpl = vi.fn(async () => json({ success: true, token: 'v1.t', match: beachMatch('match_1759_ab') }))
    const r = await validatePinSupabase('654321', 'referee', { fetchImpl, matchExternalId: ' match_1759_ab ' })
    expect(bodyOf(fetchImpl.mock.calls[0])).toEqual({ pin: '654321', type: 'referee', sport: 'beach', matchExternalId: 'match_1759_ab' })
    expect(r.success).toBe(true)
    expect(matchAccessFor('match_1759_ab')).toMatchObject({ pin: '654321', token: 'v1.t', type: 'referee' })
  })

  it('names no match for a LAN relay\'s numeric id or nothing (the older request, unchanged)', async () => {
    const fetchImpl = vi.fn(async () => json({ success: false, error: 'Invalid PIN code' }, 404))
    await validatePinSupabase('654321', 'referee', { fetchImpl, matchExternalId: '17' })
    await validatePinSupabase('654321', 'referee', { fetchImpl })
    for (const call of fetchImpl.mock.calls) expect(bodyOf(call)).toEqual({ pin: '654321', type: 'referee', sport: 'beach' })
  })

  it('an answer for another match is no answer for the named one, and is not remembered', async () => {
    const fetchImpl = vi.fn(async () => json({ success: true, token: 'v1.x', match: beachMatch('match_other') }))
    const r = await validatePinSupabase('654321', 'referee', { fetchImpl, matchExternalId: 'match_mine' })
    expect(r.success).toBe(false)
    expect(matchAccessFor('match_other')).toBeNull()
  })

  it('a token renewal asks for its own match only', async () => {
    rememberMatchAccess('match_7', { pin: '555555', token: 'v1.old', type: 'referee' })
    apiState.row = { id: 'uuid-7', external_id: 'match_7', sport_type: 'beach' } // no players_team1: token expired
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).includes('/validate-connection-pin')) return json({ success: true, token: 'v1.new', match: beachMatch('match_7') })
      return json({ success: false, error: 'Match not found' }, 404) // the relay has no room
    })
    await getMatchData('match_7').catch(() => {})
    const checks = globalThis.fetch.mock.calls.filter(([u]) => String(u).includes('/validate-connection-pin'))
    expect(checks).toHaveLength(1)
    expect(bodyOf(checks[0])).toEqual({ pin: '555555', type: 'referee', sport: 'beach', matchExternalId: 'match_7' })
    expect(matchAccessFor('match_7').token).toBe('v1.new')
  })
})

describe('the relay PIN check names its match (POST /api/match/validate-pin)', () => {
  it('sends matchId, else the game number', async () => {
    globalThis.fetch = vi.fn(async () => json({ success: true, token: 'r.t', match: { id: 'match_5' } }))
    await validatePin('333333', 'referee', { matchId: 'match_5' })
    expect(bodyOf(globalThis.fetch.mock.calls[0])).toEqual({ pin: '333333', type: 'referee', sport: 'beach', matchId: 'match_5' })
    globalThis.fetch.mockClear()
    await validatePin('333333', 'referee', { gameNumber: 12 }).catch(() => {})
    expect(bodyOf(globalThis.fetch.mock.calls[0])).toEqual({ pin: '333333', type: 'referee', sport: 'beach', gameNumber: '12' })
  })

  it('refuses an older relay\'s answer for another match, and says a 429 is one', async () => {
    globalThis.fetch = vi.fn(async () => json({ success: true, token: 'r.x', match: { id: 'match_other' } }))
    expect((await validatePin('333333', 'referee', { matchId: 'match_5' })).success).toBe(false)
    expect(matchAccessFor('match_other')).toBeNull()
    globalThis.fetch = vi.fn(async () => json({ success: false, error: 'Too many failed attempts' }, 429))
    await expect(validatePin('333333', 'referee', { matchId: 'match_5' })).rejects.toMatchObject({ status: 429 })
  })

  it('pinMatchKey: seed keys for both, numbers for the relay only', () => {
    expect(pinMatchKey(' match_1 ')).toBe('match_1')
    expect(pinMatchKey('17')).toBeNull()
    expect(pinMatchKey(17)).toBeNull()
    expect(pinMatchKey(17, { relay: true })).toBe('17')
    expect(pinMatchKey('', { relay: true })).toBeNull()
    expect(pinMatchKey('x'.repeat(129))).toBeNull()
    expect(pinMatchKey(null)).toBeNull()
  })
})

describe('the referee page names the game picked', () => {
  const m = { id: 'match_42', team1: 'A', team2: 'B' }

  it('a typed PIN goes to the cloud and the relay for the picked match only', async () => {
    const cloud = vi.fn(async () => ({ success: false, error: 'Invalid PIN code', status: 404 }))
    const lan = vi.fn(async () => ({ success: true, match: m }))
    const r = await validateRefereePin('123456', { checkCloud: cloud, checkLan: lan, relayIsCloud: () => false, matchKey: 'match_42', gameNumber: 7 })
    expect(r).toEqual({ match: m, source: 'websocket' })
    expect(cloud).toHaveBeenCalledWith('123456', 'referee', { matchExternalId: 'match_42' })
    expect(lan).toHaveBeenCalledWith('123456', 'referee', { matchId: 'match_42' })
  })

  it('an answer for another match than the one picked is refused', async () => {
    const cloud = vi.fn(async () => ({ success: true, match: { id: 'match_7' } }))
    const lan = vi.fn(async () => ({ success: true, match: { id: 'match_7' } }))
    expect(await validateRefereePin('123456', { checkCloud: cloud, checkLan: lan, relayIsCloud: () => false, matchKey: 'match_42' })).toEqual({ match: null })
  })

  it('a LAN relay\'s numeric id: the relay only (the cloud has no such match)', async () => {
    const cloud = vi.fn()
    const lan = vi.fn(async () => ({ success: true, match: { id: 3 } }))
    expect(await validateRefereePin('123456', { checkCloud: cloud, checkLan: lan, relayIsCloud: () => false, matchKey: 3 })).toEqual({ match: { id: 3 }, source: 'websocket' })
    expect(cloud).not.toHaveBeenCalled()
    expect(lan).toHaveBeenCalledWith('123456', 'referee', { matchId: '3' })
  })

  it('without a game picked (offline list) the older PIN-only check stays', async () => {
    const cloud = vi.fn(async () => ({ success: true, match: m }))
    expect(await validateRefereePin('123456', { checkCloud: cloud, checkLan: vi.fn() })).toEqual({ match: m, source: 'supabase' })
    expect(cloud).toHaveBeenCalledWith('123456', 'referee')
  })

  it('a relay 429 is shown as a rate limit, not as a wrong PIN', async () => {
    const cloud = vi.fn(async () => ({ success: false, unreachable: true }))
    const lan = vi.fn(async () => { throw Object.assign(new Error('Too many failed attempts'), { status: 429 }) })
    expect(await validateRefereePin('123456', { checkCloud: cloud, checkLan: lan, matchKey: 'match_42' })).toEqual({ match: null, error: 'Too many failed attempts' })
  })

  it('the listed row\'s key: its seed key, a relay room id, never a database uuid', () => {
    expect(listedMatchKey({ id: 'match_b', external_id: 'match_b', gameNumber: 12 })).toBe('match_b')
    expect(listedMatchKey({ id: 'uuid-like', external_id: 'match_c' })).toBe('match_c')
    expect(listedMatchKey({ id: 'match_room', gameNumber: 3 })).toBe('match_room')
    expect(listedMatchKey({ id: 4 })).toBe('4')
    expect(listedMatchKey({ id: '6f1c2a9b-1111-4222-8333-444455556666', external_id: null })).toBeNull()
    expect(listedMatchKey(null)).toBeNull()
  })
})

describe('a stored referee PIN after a reload', () => {
  const m = { id: 'match_42', team1: 'A', team2: 'B' }

  it('is checked for the stored match only, on the cloud and the relay', async () => {
    const cloud = vi.fn(async () => ({ success: false, unreachable: true }))
    const lan = vi.fn(async () => ({ success: true, match: m }))
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: cloud, checkLan: lan, relayIsCloud: () => false })).toBe(m)
    expect(cloud).toHaveBeenCalledWith('123456', 'referee', { matchExternalId: 'match_42' })
    expect(lan).toHaveBeenCalledWith('123456', 'referee', { matchId: 'match_42' })
  })

  it('a 429 keeps the session: it throws (rateLimited) instead of answering "wrong PIN"', async () => {
    const limited = vi.fn(async () => ({ success: false, error: 'Too many failed attempts', status: 429 }))
    const lan = vi.fn()
    await expect(revalidateRefereeSession('match_42', '123456', { checkCloud: limited, checkLan: lan, relayIsCloud: () => true }))
      .rejects.toMatchObject({ rateLimited: true })
    expect(lan).not.toHaveBeenCalled()
    // the relay's 429 the same way
    const down = vi.fn(async () => ({ success: false, unreachable: true }))
    const lanLimited = vi.fn(async () => { throw Object.assign(new Error('Too many'), { status: 429 }) })
    await expect(revalidateRefereeSession('match_42', '123456', { checkCloud: down, checkLan: lanLimited, relayIsCloud: () => false }))
      .rejects.toMatchObject({ rateLimited: true })
    // a wrong PIN still ends the session
    const wrong = vi.fn(async () => ({ success: false, error: 'Invalid PIN code', status: 404 }))
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: wrong, checkLan: lan, relayIsCloud: () => true })).toBeNull()
  })
})
