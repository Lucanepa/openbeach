import { describe, it, expect, vi } from 'vitest'

// Build-time constant the referee screens read
vi.hoisted(() => { globalThis.__APP_VERSION__ = 'test' })
vi.mock('../../db_beach/db_beach', () => ({ db: { sync_queue: { hook: () => {} } } }))

import { linkedMatchKey, linkedGameNumber } from '../../RefereeApp_beach'

// Ported from OpenVolley src/__tests__/refereeLink.test.jsx (23054276): the
// referee code of Connect tablets (?match=<seed key>) preselects its game;
// the referee still enters the PIN.

describe('referee match link', () => {
  it('reads the seed key from the link', () => {
    expect(linkedMatchKey('?match=match_1759740000000_ab12cd')).toBe('match_1759740000000_ab12cd')
    expect(linkedMatchKey('?server=x&match=%20m1%20')).toBe('m1')
    expect(linkedMatchKey('')).toBeNull()
    expect(linkedMatchKey('?match=')).toBeNull()
  })

  it('finds the game in the list by its seed key (cloud and relay lists)', () => {
    const matches = [
      { id: 'match_a', gameNumber: 11 },
      { id: 'uuid-2', external_id: 'match_b', gameNumber: 12 },
      { id: 3, seed_key: 'match_c', gameNumber: '13' }
    ]
    expect(linkedGameNumber('match_a', matches)).toBe('11')
    expect(linkedGameNumber('match_b', matches)).toBe('12')
    expect(linkedGameNumber('match_c', matches)).toBe('13')
    expect(linkedGameNumber('match_x', matches)).toBeNull()
    expect(linkedGameNumber(null, matches)).toBeNull()
    expect(linkedGameNumber('match_a', null)).toBeNull()
    expect(linkedGameNumber('m', [{ id: 'm', gameNumber: null }])).toBeNull()
  })
})
