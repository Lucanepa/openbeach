import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../../utils_beach/backendConfig_beach', () => ({
  getApiUrl: (p) => `http://backend.test${p}`,
  isBackendAvailable: () => true
}))

import {
  rememberMatchAccess,
  forgetMatchAccess,
  matchAccessFor,
  matchAccessHeaders,
  subscribeMessage,
  validatePinSupabase,
  validatePin,
  getMatchData,
  isOtherSportMatch
} from '../../utils_beach/serverDataSync_beach'
import { buildConnectionPins } from '../../utils_beach/connectionPins_beach'

const json = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
})

beforeEach(() => forgetMatchAccess())
afterEach(() => vi.restoreAllMocks())

describe('match access after the PIN step', () => {
  it('remembers PIN and token per match and puts them on subscribe-match and reads', () => {
    expect(subscribeMessage('match_1')).toEqual({ type: 'subscribe-match', matchId: 'match_1' })
    expect(matchAccessHeaders('match_1')).toEqual({})

    rememberMatchAccess('match_1', { pin: ' 123456 ', token: 'v1.t', type: 'referee' })
    expect(matchAccessFor('match_1')).toEqual({ pin: '123456', token: 'v1.t', type: 'referee' })
    expect(subscribeMessage('match_1')).toEqual({ type: 'subscribe-match', matchId: 'match_1', pin: '123456', token: 'v1.t' })
    expect(matchAccessHeaders('match_1')).toEqual({ 'X-OV-Match-Token': 'v1.t', 'X-OV-Match-Pin': '123456' })
    // Other matches get nothing
    expect(subscribeMessage('match_2')).toEqual({ type: 'subscribe-match', matchId: 'match_2' })

    forgetMatchAccess('match_1')
    expect(matchAccessFor('match_1')).toBeNull()
  })

  it('ignores an empty proof', () => {
    rememberMatchAccess('m', {})
    expect(matchAccessFor('m')).toBeNull()
  })

  it('tells beach matches from others', () => {
    expect(isOtherSportMatch({ sport_type: 'indoor' })).toBe(true)
    expect(isOtherSportMatch({ sportType: 'beach' })).toBe(false)
    expect(isOtherSportMatch({})).toBe(false)
  })
})

describe('validatePinSupabase (POST /api/match/validate-connection-pin, sport beach)', () => {
  it('asks for a beach match and remembers the token on success', async () => {
    const fetchImpl = vi.fn(async () => json({
      success: true,
      token: 'v1.tok',
      match: { id: 'match_9', sportType: 'beach', gameNumber: 9, team1Team: 'Rossi / Bianchi', team2Team: 'Meier / Huber', refereeConnectionEnabled: true }
    }))
    const r = await validatePinSupabase('654321', 'referee', { fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe('http://backend.test/api/match/validate-connection-pin')
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({ pin: '654321', type: 'referee', sport: 'beach' })
    expect(r.success).toBe(true)
    expect(r.match.team1).toBe('Rossi / Bianchi')
    expect(matchAccessFor('match_9')).toEqual({ pin: '654321', token: 'v1.tok', type: 'referee' })
  })

  it('accepts the team bench types and refuses anything else without a request', async () => {
    const fetchImpl = vi.fn(async () => json({ success: true, token: null, match: { id: 'm', sportType: 'beach' } }))
    expect((await validatePinSupabase('111111', 'bench_team1', { fetchImpl })).success).toBe(true)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).type).toBe('bench_team1')
    fetchImpl.mockClear()
    expect((await validatePinSupabase('111111', 'bench_home', { fetchImpl })).success).toBe(false)
    expect((await validatePinSupabase('12', 'referee', { fetchImpl })).success).toBe(false)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a wrong PIN and an answer for another sport', async () => {
    const wrong = vi.fn(async () => json({ success: false, error: 'Invalid PIN code' }, 404))
    expect(await validatePinSupabase('000000', 'referee', { fetchImpl: wrong })).toEqual({ success: false, error: 'Invalid PIN code' })

    const indoor = vi.fn(async () => json({ success: true, token: 'x', match: { id: 'match_in', gameNumber: 3 } }))
    const r = await validatePinSupabase('222222', 'referee', { fetchImpl: indoor })
    expect(r.success).toBe(false)
    expect(matchAccessFor('match_in')).toBeNull()
  })
})

describe('relay PIN check and match reads', () => {
  it('validatePin remembers the relay token; an indoor match is refused', async () => {
    globalThis.fetch = vi.fn(async () => json({ success: true, token: 'relay.t', match: { id: 'match_5' } }))
    const ok = await validatePin('333333', 'referee')
    expect(ok.success).toBe(true)
    expect(matchAccessFor('match_5')).toMatchObject({ pin: '333333', token: 'relay.t' })

    globalThis.fetch = vi.fn(async () => json({ success: true, match: { id: 'match_6', sport_type: 'indoor' } }))
    expect((await validatePin('444444', 'referee')).success).toBe(false)
    expect(matchAccessFor('match_6')).toBeNull()
  })

  it('getMatchData sends the match token and PIN to the relay', async () => {
    rememberMatchAccess('match_7', { pin: '555555', token: 'v1.m' })
    globalThis.fetch = vi.fn(async () => json({ success: true, access: 'full', match: { id: 'match_7' } }))
    const r = await getMatchData('match_7')
    expect(r.success).toBe(true)
    const headers = globalThis.fetch.mock.calls[0][1].headers
    expect(headers['X-OV-Match-Token']).toBe('v1.m')
    expect(headers['X-OV-Match-Pin']).toBe('555555')
  })
})

describe('buildConnectionPins (beach keys)', () => {
  it('builds every role from the local match and skips empty PINs', () => {
    expect(buildConnectionPins({
      refereePin: '111111',
      team1Pin: 222222,
      team2Pin: '',
      team1UploadPin: null,
      team2UploadPin: ' 555555 '
    })).toEqual({ referee: '111111', bench_team1: '222222', upload_team2: '555555' })
    // Older screens kept team1TeamPin
    expect(buildConnectionPins({ team1TeamPin: '777777' })).toEqual({ bench_team1: '777777' })
    expect(buildConnectionPins(null)).toEqual({})
  })
})
