import { describe, it, expect, vi, afterEach } from 'vitest'

// The scorer's Connect tablets dialog shows a referee tablet as connected
// when the relay's /api/server/connections lists a client with role
// 'referee'. Every relay (backend, desktop relay.rs, lanRelayCore) gives a
// subscriber that role only from the `device` label of its subscribe-match
// (OpenVolley setRelayDevice, 570198f3): without it the referee tablet is a
// plain 'subscriber' and the dialog says "waiting" while it is connected.

vi.hoisted(() => { globalThis.__APP_VERSION__ = 'test' })
vi.mock('../../db_beach/db_beach', () => ({ db: { sync_queue: { hook: () => {} } } }))

import { setRelayDevice, subscribeMessage } from '../../utils_beach/serverDataSync_beach'
import { roleStatus } from '../../components_beach/connect/connectView_beach'

afterEach(() => setRelayDevice(null))

describe('relay device label', () => {
  it('labels the subscriptions of a referee tablet', () => {
    expect(subscribeMessage('match_1')).toEqual({ type: 'subscribe-match', matchId: 'match_1' })
    setRelayDevice('referee')
    expect(subscribeMessage('match_1')).toEqual({ type: 'subscribe-match', matchId: 'match_1', device: 'referee' })
    setRelayDevice(null)
    expect(subscribeMessage('match_1')).toEqual({ type: 'subscribe-match', matchId: 'match_1' })
  })

  // A cold import of the whole referee page (vi.resetModules): about 2 s
  // alone, past the default 5 s under the full suite's load. Nothing here
  // waits on a timer; only the import is slow.
  it('the referee page labels its socket when it loads', async () => {
    vi.resetModules()
    const sync = await import('../../utils_beach/serverDataSync_beach')
    await import('../../RefereeApp_beach')
    expect(sync.subscribeMessage('match_1').device).toBe('referee')
  }, 30000)

  it('a labelled referee shows as connected in the scorer dialog', () => {
    // The relay's answer for a subscriber that sent device 'referee'
    const clients = [{ role: 'referee', matchId: 'match_1', connectedAt: '2026-10-08T10:00:00Z' }]
    const access = { enabled: true, pin: '123456' }
    expect(roleStatus({ role: 'referee', access, clients, matchKey: 'match_1', transport: 'hall', reachable: true }).status).toBe('connected')
    // ... and as waiting while it is only a plain subscriber
    const plain = [{ role: 'subscriber', matchId: 'match_1' }]
    expect(roleStatus({ role: 'referee', access, clients: plain, matchKey: 'match_1', transport: 'hall', reachable: true }).status).toBe('waiting')
  })
})
