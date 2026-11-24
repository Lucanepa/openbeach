import { describe, it, expect, vi } from 'vitest'

// Build-time constant the referee screens read
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
  getRelayWebSocketUrl: () => null
}))
vi.mock('../../db_beach/db_beach', () => ({ db: { sync_queue: { hook: () => {} } } }))

import { fetchMatchByPin } from '../../utils_beach/backupManager_beach'
import { revalidateRefereeSession, validateRefereePin } from '../../RefereeApp_beach'

describe('fetchMatchByPin (POST /api/match/restore-by-pin)', () => {
  const beach = { id: 'uuid', external_id: 'match_1', sport_type: 'beach', game_n: 12 }

  it('looks the match up by game number and PIN on the server and keeps the PIN', async () => {
    const restoreByPin = vi.fn(async () => ({ data: { match: beach, sets: [{ index: 1 }], events: [], liveState: null }, error: null, status: 200 }))
    const r = await fetchMatchByPin(' 864201 ', '12', { restoreByPin })
    expect(restoreByPin).toHaveBeenCalledWith(12, '864201')
    expect(r.match.external_id).toBe('match_1')
    expect(r.sets).toHaveLength(1)
    expect(r.gamePin).toBe('864201')
  })

  it('refuses an indoor match with the same number and PIN', async () => {
    const restoreByPin = vi.fn(async () => ({ data: { match: { ...beach, sport_type: 'indoor' }, sets: [], events: [] }, error: null, status: 200 }))
    await expect(fetchMatchByPin('864201', 12, { restoreByPin })).rejects.toThrow('Match not found')
  })

  it('maps 404 and 429', async () => {
    const notFound = vi.fn(async () => ({ data: null, error: { code: 'OV_NOT_FOUND', status: 404 }, status: 404 }))
    await expect(fetchMatchByPin('000000', 1, { restoreByPin: notFound })).rejects.toThrow('Match not found')
    const limited = vi.fn(async () => ({ data: null, error: { code: 'OV_TOO_MANY_ATTEMPTS', status: 429 }, status: 429 }))
    await expect(fetchMatchByPin('000000', 1, { restoreByPin: limited })).rejects.toThrow('Too many wrong PINs')
  })
})

describe('referee PIN checks', () => {
  const m = { id: 'match_42', team1: 'A', team2: 'B' }

  it('a typed PIN: the backend first, then the LAN relay', async () => {
    const cloudOk = vi.fn(async () => ({ success: true, match: m }))
    const lan = vi.fn()
    expect(await validateRefereePin('123456', { checkCloud: cloudOk, checkLan: lan })).toEqual({ match: m, source: 'supabase' })
    expect(lan).not.toHaveBeenCalled()

    const cloudDown = vi.fn(async () => ({ success: false, unreachable: true }))
    const lanOk = vi.fn(async () => ({ success: true, match: m }))
    expect(await validateRefereePin('123456', { checkCloud: cloudDown, checkLan: lanOk })).toEqual({ match: m, source: 'websocket' })
    const cloudThrows = vi.fn(async () => { throw new Error('offline') })
    expect(await validateRefereePin('123456', { checkCloud: cloudThrows, checkLan: lanOk })).toEqual({ match: m, source: 'websocket' })

    const lanThrows = vi.fn(async () => { throw new Error('No match found') })
    expect(await validateRefereePin('123456', { checkCloud: cloudDown, checkLan: lanThrows })).toEqual({ match: null })
  })

  it('a wrong PIN the backend answered (404) or a rate limit (429) does not ask the relay too when the relay IS the cloud', async () => {
    const lan = vi.fn(async () => ({ success: true, match: m }))
    const relayIsCloud = () => true
    const wrong = vi.fn(async () => ({ success: false, error: 'Invalid PIN code', status: 404 }))
    expect(await validateRefereePin('123456', { checkCloud: wrong, checkLan: lan, relayIsCloud })).toEqual({ match: null })
    const limited = vi.fn(async () => ({ success: false, error: 'Too many failed attempts', status: 429 }))
    expect(await validateRefereePin('123456', { checkCloud: limited, checkLan: lan, relayIsCloud })).toEqual({ match: null, error: 'Too many failed attempts' })
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: wrong, checkLan: lan, relayIsCloud })).toBeNull()
    expect(lan).not.toHaveBeenCalled()
  })

  // A test match (and any match not synced yet) lives on the venue relay only:
  // the cloud's "no such PIN" is no answer for it. The desktop app's referee
  // window could not join a test match while the laptop was online.
  it('a venue relay is asked after the cloud does not know the PIN', async () => {
    const lan = vi.fn(async () => ({ success: true, match: m }))
    const relayIsCloud = () => false
    const wrong = vi.fn(async () => ({ success: false, error: 'Invalid PIN code', status: 404 }))
    expect(await validateRefereePin('123456', { checkCloud: wrong, checkLan: lan, relayIsCloud })).toEqual({ match: m, source: 'websocket' })
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: wrong, checkLan: lan, relayIsCloud })).toBe(m)
    // a rate limit still stops there
    lan.mockClear()
    const limited = vi.fn(async () => ({ success: false, error: 'Too many failed attempts', status: 429 }))
    expect(await validateRefereePin('123456', { checkCloud: limited, checkLan: lan, relayIsCloud })).toEqual({ match: null, error: 'Too many failed attempts' })
    expect(lan).not.toHaveBeenCalled()
  })

  it('a stored PIN after a reload restores the same match only, with its seed key id', async () => {
    const cloud = vi.fn(async () => ({ success: true, match: m }))
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: cloud, checkLan: vi.fn() })).toBe(m)
    const other = vi.fn(async () => ({ success: true, match: { id: 'match_7' } }))
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: other, checkLan: other })).toBeNull()
    const down = vi.fn(async () => ({ success: false, unreachable: true }))
    expect(await revalidateRefereeSession('match_42', '123456', { checkCloud: down, checkLan: cloud })).toBe(m)
  })
})
