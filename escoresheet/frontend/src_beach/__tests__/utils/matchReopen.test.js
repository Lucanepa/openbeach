// "Reopen match" after approval: a match the server has closed is reopened by
// an admin (OpenVolley src/components/__tests__/MatchEndReopen.test.jsx,
// ported with utils_beach/matchReopen_beach 2026-10-21).
import { describe, it, expect, vi } from 'vitest'
import { planReopen, isClosingSyncJob, isContinuedElsewhere, isStaleClosedCopy } from '../../utils_beach/matchReopen_beach'

const SEED = 'match_100_aaa'
const match = (over = {}) => ({ id: 1, seed_key: SEED, test: false, status: 'approved', gameN: 4711, ...over })
const closing = (id, status, over = {}) => ({ id, resource: 'match', action: 'update', status, payload: { id: SEED, status: 'approved' }, ...over })

describe('planReopen', () => {
  const read = (row) => vi.fn(async () => ({ data: row, error: null }))

  it('a test match, or one without seed_key, reopens locally', async () => {
    const readServerMatch = read(null)
    expect(await planReopen({ match: match({ test: true }), queue: [closing(1, 'sent')], online: true, readServerMatch })).toEqual({ kind: 'local' })
    expect(await planReopen({ match: match({ seed_key: null }), queue: [], online: false, readServerMatch })).toEqual({ kind: 'local' })
    expect(readServerMatch).not.toHaveBeenCalled()
  })

  it('an approval that never reached the server: its jobs are superseded, nothing is asked, works offline', async () => {
    const readServerMatch = read(null)
    const queue = [
      closing(1, 'queued'),
      closing(2, 'error', { payload: { id: SEED, status: 'final' } }),
      closing(3, 'failed'),
      closing(4, 'superseded'),
      { id: 5, resource: 'match', action: 'update', status: 'sent', payload: { id: SEED, status: 'ended' } },
      closing(6, 'sent', { payload: { id: 'match_other', status: 'approved' } })
    ]
    expect(await planReopen({ match: match(), queue, online: false, readServerMatch })).toEqual({ kind: 'localUnsynced', supersedeIds: [1, 2, 3] })
    expect(readServerMatch).not.toHaveBeenCalled()
  })

  it('no closing job in the queue is no proof: the server is asked (pruned jobs, another tablet, a cloud restore)', async () => {
    const row = { id: 'uuid-1', status: 'approved', closed_at: '2026-10-01T18:00:00Z' }
    const readServerMatch = read(row)
    // review: a match approved over a week ago (its sent job pruned) is closed on the server
    expect(await planReopen({ match: match(), queue: [], online: true, access: { isAdmin: false }, readServerMatch })).toEqual({ kind: 'adminOnly', row })
    expect(readServerMatch).toHaveBeenCalledWith(SEED)
    // only superseded jobs left: still no proof
    expect((await planReopen({ match: match(), queue: [closing(4, 'superseded')], online: true, readServerMatch })).kind).toBe('adminOnly')
    // offline without proof: needs the connection, never a silent local reopen
    expect(await planReopen({ match: match(), queue: [], online: false, readServerMatch: read(null) })).toEqual({ kind: 'needsConnection' })
    // never in the cloud: the server has no row, so it reopens locally
    expect((await planReopen({ match: match(), queue: [], online: true, readServerMatch: read(null) })).kind).toBe('serverOpen')
  })

  it('a sent (or in-flight) approval needs the connection', async () => {
    for (const status of ['sent', 'sending']) {
      expect(await planReopen({ match: match(), queue: [closing(1, status)], online: false, readServerMatch: read(null) })).toEqual({ kind: 'needsConnection' })
    }
  })

  it('closed on the server: a scorer gets "only an admin", an admin the reopen dialog', async () => {
    const row = { id: 'uuid-1', status: 'approved', closed_at: '2026-10-10T18:00:00Z' }
    const readServerMatch = read(row)
    expect(await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, access: { isAdmin: false }, readServerMatch }))
      .toEqual({ kind: 'adminOnly', row })
    expect(await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, access: { isAdmin: true }, readServerMatch }))
      .toEqual({ kind: 'adminReopen', row })
    expect(readServerMatch).toHaveBeenCalledWith(SEED)
  })

  it('closed on the server: a beach competition manager gets the reopen dialog too; a scorer does not', async () => {
    const row = { id: 'uuid-1', status: 'approved', closed_at: '2026-10-10T18:00:00Z' }
    const readServerMatch = read(row)
    expect(await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, access: { isAdmin: false, canManageTeams: true }, readServerMatch }))
      .toEqual({ kind: 'adminReopen', row })
    expect(await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, access: { isAdmin: false, canScore: true, canManageTeams: false }, readServerMatch }))
      .toEqual({ kind: 'adminOnly', row })
  })

  it('already reopened on the server (closed_at null), or not in the cloud: local reopen', async () => {
    const row = { id: 'uuid-1', status: 'ended', closed_at: null }
    expect((await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, readServerMatch: read(row) })).kind).toBe('serverOpen')
    expect((await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, readServerMatch: read(null) })).kind).toBe('serverOpen')
  })

  it('a row without closed_at (public projection) counts as closed by its status', async () => {
    const plan = await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, readServerMatch: read({ id: 'u', status: 'final' }) })
    expect(plan.kind).toBe('adminOnly')
  })

  it('a failed read is reported', async () => {
    expect((await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, readServerMatch: async () => ({ data: null, error: { status: 503 } }) })).kind).toBe('checkFailed')
    expect((await planReopen({ match: match(), queue: [closing(1, 'sent')], online: true, readServerMatch: async () => { throw new Error('x') } })).kind).toBe('checkFailed')
  })

  it('counts restore jobs that carry a closed status as closing', () => {
    expect(isClosingSyncJob({ resource: 'match', action: 'restore', payload: { match: { external_id: SEED, status: 'final' } } })).toBe(true)
    expect(isClosingSyncJob({ resource: 'set', action: 'update', payload: { status: 'approved' } })).toBe(false)
  })
})

// OpenVolley 2026-10-29: the desktop app reopened its copy of match 406970,
// continued and closed on a phone a week before, and wrote a fresh backup
// file of it. No backup file of such a copy; the final state of a match this
// device ended or approved is always backed up.
describe('isContinuedElsewhere', () => {
  const moved = { code: 'OV_SCORER_MOVED' }
  const closed = { code: 'OV_MATCH_CLOSED' }

  it('a copy another device took over, closed there or not', () => {
    expect(isContinuedElsewhere({ status: 'live', cloudBlock: moved })).toBe(true)
    expect(isContinuedElsewhere({ status: 'scheduled', cloudBlock: moved })).toBe(true)
    // taken over and closed there (markScorerMoved makes the copy final)
    expect(isContinuedElsewhere({ status: 'final', cloudBlock: { ...moved, closed: true } })).toBe(true)
  })

  it('a copy the server closed while it was scored here (the evidence OpenVolley records)', () => {
    expect(isContinuedElsewhere({ status: 'live', cloudBlock: closed })).toBe(true)
    expect(isContinuedElsewhere({ status: 'scheduled', closed_at: '2026-10-20T19:09:00Z' })).toBe(true)
    expect(isStaleClosedCopy({ status: 'live', closed_at: '2026-10-20T19:09:00Z' })).toBe(true)
    expect(isStaleClosedCopy({ status: 'live', cloudBlock: moved })).toBe(false)
  })

  it('never a copy this device ended or approved, whatever the server says', () => {
    expect(isContinuedElsewhere({ status: 'ended', approved: true, cloudBlock: closed })).toBe(false)
    expect(isContinuedElsewhere({ status: 'ended', approved: true })).toBe(false)
    expect(isContinuedElsewhere({ status: 'ended', cloudBlock: moved })).toBe(false)
    expect(isContinuedElsewhere({ status: 'ended', closed_at: '2026-10-20T19:09:00Z' })).toBe(false)
    // ended here, then closed on the server
    expect(isContinuedElsewhere({ status: 'final', cloudBlock: closed })).toBe(false)
  })

  it('not an open copy, a test match or no match', () => {
    expect(isContinuedElsewhere({ status: 'live' })).toBe(false)
    expect(isContinuedElsewhere({ status: 'live', cloudBlock: { code: 'OV_GAME_TAKEN' } })).toBe(false)
    expect(isContinuedElsewhere({ status: 'live', test: true, cloudBlock: closed })).toBe(false)
    expect(isContinuedElsewhere({ status: 'live', test: true, cloudBlock: moved })).toBe(false)
    expect(isContinuedElsewhere(null)).toBe(false)
  })
})
