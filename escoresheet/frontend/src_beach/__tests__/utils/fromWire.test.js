import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: vi.fn() }))
vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => false, getApiUrl: () => null, getCloudApiUrl: () => null, getBackendUrl: () => null, getRelayWebSocketUrl: () => null }))

const { fromWire } = await import('../../utils_beach/serverDataSync_beach')

// Every relay speaks home/away (team1 = home); the beach pages read team1/team2.
describe('fromWire', () => {
  it('maps the relay bundle to openbeach keys', () => {
    const out = fromWire({
      success: true, access: 'full',
      match: { id: 'm', team1Name: 'A / B' },
      homeTeam: { name: 'A / B' }, awayTeam: { name: 'C / D' },
      homePlayers: [{ number: 1 }], awayPlayers: [{ number: 2 }],
      sets: [{ index: 1 }], events: [], data: { liveState: { points_a: 3 } }
    })
    expect(out.team1).toEqual({ name: 'A / B' })
    expect(out.team2Team).toEqual({ name: 'C / D' })
    expect(out.team1Players).toEqual([{ number: 1 }])
    expect(out.team2Players).toEqual([{ number: 2 }])
    expect(out.liveState).toEqual({ points_a: 3 })
    expect(out.success).toBe(true)
    for (const k of ['homeTeam', 'awayTeam', 'homePlayers', 'awayPlayers', 'data']) expect(k in out).toBe(false)
  })

  it('keeps openbeach keys, builds missing teams from the match, leaves liveState out when absent', () => {
    const own = fromWire({ match: {}, team1: { name: 'X' }, team2: { name: 'Y' }, team1Players: [{ number: 7 }], team2Players: [] })
    expect(own.team1.name).toBe('X')
    expect(own.team1Players).toEqual([{ number: 7 }])
    expect('liveState' in own).toBe(false)
    const built = fromWire({ match: { team1Name: 'A / B', team2Name: 'C / D', team2Color: '#000' } })
    expect(built.team1).toEqual({ name: 'A / B', color: '#ef4444' })
    expect(built.team2).toEqual({ name: 'C / D', color: '#000' })
    expect(built.sets).toEqual([])
    expect(fromWire(null)).toBeNull()
  })
})
