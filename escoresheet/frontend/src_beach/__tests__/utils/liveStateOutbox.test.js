import { describe, it, expect, beforeEach } from 'vitest'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
import {
  holdLiveState, heldLiveState, liveStateWritten, sendHeldLiveState, sendHeldLiveStates,
  isLiveStateRetryable, resetLiveStateOutboxForTests, createLiveStateOrder, cachedCloudMatchId, rememberCloudMatchId
} from '../../utils_beach/liveStateOutbox_beach'

// Stress test 2026-10-25 (ob-livestate-never-repushed): a live-state write
// that failed (offline, signed out, the database cut) was dropped and never
// sent again, so spectators kept a score from before the outage for good.

const SEED = 'match_1792931096817_abcdef'
const at = (s) => new Date(Date.UTC(2026, 9, 25, 12, 0, s)).toISOString()

function fakeApi(answer = () => ({ data: null, error: null })) {
  const calls = []
  const apiFrom = (table) => {
    const call = { table, filters: [] }
    const b = {
      select() { call.action = 'select'; return b },
      eq(c, v) { call.filters.push([c, v]); return b },
      maybeSingle() { return b },
      upsert(d) { call.action = 'upsert'; call.data = d; return b },
      then(resolve, reject) {
        calls.push(call)
        return Promise.resolve().then(() => (call.table === 'matches' ? { data: { id: 'uuid-1' }, error: null } : answer(call))).then(resolve, reject)
      }
    }
    return b
  }
  return { apiFrom, calls }
}

beforeEach(() => {
  useMemoryLocalStorage()
  resetLiveStateOutboxForTests()
})

describe('liveStateOutbox', () => {
  it('holds the newest unsent row, without its match_id, across a reload (localStorage)', () => {
    holdLiveState(SEED, { match_id: 'old-uuid', points_a: 17, updated_at: at(1) })
    holdLiveState(SEED, { match_id: 'old-uuid', points_a: 19, updated_at: at(3) })
    holdLiveState(SEED, { points_a: 18, updated_at: at(2) }) // older: never over a newer one
    expect(heldLiveState(SEED)).toEqual({ points_a: 19, updated_at: at(3) })
  })

  it('a row written to the cloud since replaces it; an older one is never held after it', () => {
    holdLiveState(SEED, { points_a: 17, updated_at: at(1) })
    liveStateWritten(SEED, at(2))
    expect(heldLiveState(SEED)).toBeNull()
    holdLiveState(SEED, { points_a: 16, updated_at: at(1) })
    expect(heldLiveState(SEED)).toBeNull()
  })

  it('sends it with the cloud match id; a failure keeps it, a refusal drops it', async () => {
    holdLiveState(SEED, { points_a: 21, match_status: 'ended', updated_at: at(5) })
    const down = fakeApi(() => ({ data: null, error: { status: 0, network: true } }))
    expect(await sendHeldLiveState(SEED, { apiFrom: down.apiFrom })).toBe('kept')
    expect(heldLiveState(SEED)).not.toBeNull()

    const up = fakeApi()
    expect(await sendHeldLiveStates({ apiFrom: up.apiFrom })).toEqual({ [SEED]: 'sent' })
    expect(up.calls.find(c => c.table === 'match_live_state').data).toEqual({ points_a: 21, match_status: 'ended', updated_at: at(5), match_id: 'uuid-1' })
    expect(up.calls[0].filters).toEqual([['external_id', SEED], ['sport_type', 'beach']])
    expect(heldLiveState(SEED)).toBeNull()

    holdLiveState(SEED, { points_a: 21, updated_at: at(6) })
    const closed = fakeApi(() => ({ data: null, error: { status: 409, code: 'OV_MATCH_CLOSED' } }))
    expect(await sendHeldLiveState(SEED, { apiFrom: closed.apiFrom })).toBe('dropped')
    expect(heldLiveState(SEED)).toBeNull()
  })

  it('retryable: offline, signed out, rate limited, an old bundle, 5xx; not a refusal', () => {
    for (const e of [{ network: true }, { status: 0 }, { status: 401 }, { status: 426 }, { status: 429 }, { status: 502 }, { status: 503 }]) {
      expect(isLiveStateRetryable(e)).toBe(true)
    }
    for (const e of [{ status: 400 }, { status: 403, code: 'OV_SCORER_REQUIRED' }, { status: 409, code: 'OV_MATCH_CLOSED' }, null]) {
      expect(isLiveStateRetryable(e)).toBe(false)
    }
  })
})

// Stress test 2026-10-25 (ob-livestate-push-reorder): a point and its quick
// Undo pushed at the same time; the point's push waited for its match lookup,
// landed after the Undo's with a later stamp, and the cloud kept the undone
// point
describe('createLiveStateOrder', () => {
  it('writes one at a time in the order of the actions; an older one after a newer is skipped', async () => {
    const order = createLiveStateOrder()
    const point = order.next()
    const undo = order.next()
    const written = []
    let release
    const slow = new Promise(r => { release = r })
    // the Undo's write is asked for first (the point's push still waited)
    const undoWrite = order.write(undo, async () => { written.push('undo'); return { error: null } })
    const pointWrite = order.write(point, async () => { await slow; written.push('point'); return { error: null } })
    release()
    expect(await undoWrite).toEqual({ error: null })
    expect(await pointWrite).toEqual({ skipped: true })
    expect(written).toEqual(['undo'])
  })

  it('a write in flight finishes before the next starts', async () => {
    const order = createLiveStateOrder()
    const a = order.next()
    const b = order.next()
    const log = []
    let release
    const slow = new Promise(r => { release = r })
    const wa = order.write(a, async () => { log.push('a:start'); await slow; log.push('a:end') })
    const wb = order.write(b, async () => { log.push('b:start') })
    await new Promise(r => setTimeout(r, 5))
    expect(log).toEqual(['a:start'])
    release()
    await Promise.all([wa, wb])
    expect(log).toEqual(['a:start', 'a:end', 'b:start'])
  })

  it('the cloud match id is looked up once per match', () => {
    expect(cachedCloudMatchId(SEED)).toBeNull()
    rememberCloudMatchId(SEED, 'uuid-9')
    expect(cachedCloudMatchId(SEED)).toBe('uuid-9')
  })
})
