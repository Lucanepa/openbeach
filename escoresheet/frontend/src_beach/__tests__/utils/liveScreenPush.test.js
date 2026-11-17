import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

vi.mock('../../utils_beach/backendConfig_beach', () => ({ getCloudApiUrl: (p) => `https://backend.test${p}` }))
import { pushLiveScreen, pushesLiveScreen, pickSummary, resetLiveScreenPush, PUSH_MS } from '../../utils_beach/liveScreenPush_beach'

// The desktop app's own push to the Live screen (port of OpenVolley
// utils/globalLivePush.js), in the server's names: team1 = home, team2 = away.

const db = {
  teams: { get: async (id) => ({ id, name: id === 1 ? 'Meier / Huber' : 'Rossi / Bianchi', players: ['no'] }) },
  sets: { where: () => ({ equals: () => ({ toArray: async () => [{ index: 2, team1Points: 3, team2Points: 1, finished: false }, { index: 1, team1Points: 21, team2Points: 17, finished: true }] }) }) }
}
const match = { id: 7, seed_key: 'match_1700000000000_abc123', team1Id: 1, team2Id: 2, coinTossTeamA: 'team2', hall: 'Lido', court: '2', team1Pin: '316271', gamePin: '424242' }
const live = (p) => ({ team_a_name: 'Rossi / Bianchi', points_a: p, points_b: 0, best_of: 3, lineup_a: { I: 7 }, server_number: 2 })
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => resetLiveScreenPush())
afterEach(() => { vi.useRealTimers(); resetLiveScreenPush() })

describe('liveScreenPush', () => {
  it('only the desktop app pushes', () => {
    expect(pushesLiveScreen({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(pushesLiveScreen({ Capacitor: { isNativePlatform: () => true } })).toBe(false)
    expect(pushesLiveScreen({})).toBe(false)
  })

  it('sends the court summary only, home/away mapped from team1/team2: no PINs or players', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true }))
    pushLiveScreen({ code: 'ABCD2345', match, liveState: live(3), db, matchId: 7, fetchImpl })
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce())
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://backend.test/api/global/live/ABCD2345')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('omit')
    const body = JSON.parse(init.body)
    expect(body.court).toMatch(/^[0-9a-f]{32}$/)
    expect(body.liveState).toEqual({ team_a_name: 'Rossi / Bianchi', points_a: 3, points_b: 0, best_of: 3 })
    expect(body.homeTeam).toEqual({ name: 'Meier / Huber' })
    expect(body.awayTeam).toEqual({ name: 'Rossi / Bianchi' })
    expect(body.match).toEqual({ coinTossTeamA: 'away', hall: 'Lido', court: '2', scheduledAt: null, gameN: null })
    expect(body.sets).toEqual([{ index: 1, homePoints: 21, awayPoints: 17, finished: true }])
    expect(init.body).not.toContain('316271')
    expect(init.body).not.toContain('424242')
    expect(init.body).not.toContain('players')
    expect(init.body).not.toContain('lineup')
    expect(pickSummary({ lineup_a: 1, points_a: 2 })).toEqual({ points_a: 2 })
  })

  it('at most one request per match per window; the newest state goes out after it', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn(async () => ({ ok: true }))
    pushLiveScreen({ code: 'ABCD2345', match, liveState: live(1), db, matchId: 7, fetchImpl })
    pushLiveScreen({ code: 'ABCD2345', match, liveState: live(2), db, matchId: 7, fetchImpl })
    pushLiveScreen({ code: 'ABCD2345', match, liveState: live(3), db, matchId: 7, fetchImpl })
    await vi.advanceTimersByTimeAsync(10)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(PUSH_MS + 10)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).liveState.points_a).toBe(3)
  })

  it('never offline, nothing without a code', async () => {
    const fetchImpl = vi.fn()
    pushLiveScreen({ code: 'ABCD2345', match, liveState: live(1), db, matchId: 7, fetchImpl, online: () => false })
    pushLiveScreen({ code: null, match, liveState: live(1), db, matchId: 8, fetchImpl })
    await flush()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
