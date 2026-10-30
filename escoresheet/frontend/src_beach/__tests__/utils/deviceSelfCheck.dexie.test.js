import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// utils_beach/deviceSelfCheck_beach on the app's real database (ported from
// OpenVolley's deviceSelfCheck.dexie tests): how the app opens and resumes.
let savedDeps
let db
let sc
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  sc = await import('../../utils_beach/deviceSelfCheck_beach')
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

const MIN = 60 * 1000
const ago = (ms) => new Date(Date.now() - ms).toISOString()

// A sessionStorage of its own
function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m }
}

async function liveMatch(seed, at, fields = {}) {
  const id = await db.matches.add({ seed_key: seed, status: 'live', createdAt: ago(3 * 60 * MIN), ...fields })
  await db.events.add({ matchId: id, setIndex: 1, type: 'point', seq: 1, ts: at })
  return id
}

describe('the reload marker (rule 2)', () => {
  it('noted, read and cleared; an unknown screen is the scoring screen', () => {
    const storage = memoryStorage()
    expect(sc.readOpenMatch(storage)).toBeNull()
    sc.noteOpenMatch({ id: 4, view: 'matchEnd' }, storage)
    expect(sc.readOpenMatch(storage)).toEqual({ id: 4, view: 'matchEnd' })
    sc.noteOpenMatch({ id: 4, view: 'somewhere' }, storage)
    expect(sc.readOpenMatch(storage)).toEqual({ id: 4, view: 'scoreboard' })
    sc.noteOpenMatch({ id: null }, storage)
    expect(sc.readOpenMatch(storage)).toEqual({ id: 4, view: 'scoreboard' })
    sc.clearOpenMatch(storage)
    expect(sc.readOpenMatch(storage)).toBeNull()
    storage.setItem(sc.OPEN_MATCH_KEY, '{oops')
    expect(sc.readOpenMatch(storage)).toBeNull()
  })

  it('a blocked storage: every start is an opening, nothing throws', async () => {
    const blocked = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') }, removeItem: () => { throw new Error('denied') } }
    sc.noteOpenMatch({ id: 1 }, blocked)
    sc.clearOpenMatch(blocked)
    expect(sc.readOpenMatch(blocked)).toBeNull()
    expect(await sc.matchToReopen(db, { storage: blocked, doc: { visibilityState: 'visible' } })).toBeNull()
  })
})

describe('matchToReopen', () => {
  const visible = { visibilityState: 'visible' }

  it('no marker: an opening, Home (a live match is never resumed by itself)', async () => {
    await liveMatch('match_1_a', ago(5 * MIN))
    expect(await sc.matchToReopen(db, { storage: memoryStorage(), doc: visible })).toBeNull()
  })

  it('the marker names a match on the device: that match, on its screen; one no longer there: Home', async () => {
    const id = await liveMatch('match_1_a', ago(5 * MIN))
    const storage = memoryStorage()
    sc.noteOpenMatch({ id, view: 'coinToss' }, storage)
    expect(await sc.matchToReopen(db, { storage, doc: visible })).toEqual({ id, view: 'coinToss' })
    sc.noteOpenMatch({ id: id + 99 }, storage)
    expect(await sc.matchToReopen(db, { storage, doc: visible })).toBeNull()
  })

  it('a discarded tab without a marker: the live match last scored here, never a closed or moved copy', async () => {
    await liveMatch('match_1_a', ago(60 * MIN))
    const recent = await liveMatch('match_2_b', ago(5 * MIN))
    await liveMatch('match_3_closed', ago(MIN), { cloudBlock: { code: 'OV_MATCH_CLOSED' } })
    await liveMatch('match_4_moved', ago(MIN), { cloudBlock: { code: 'OV_SCORER_MOVED' } })
    expect(await sc.matchToReopen(db, { storage: memoryStorage(), doc: { ...visible, wasDiscarded: true } })).toEqual({ id: recent, view: 'scoreboard' })
  })

  it('hidden 15 minutes or more before the page loaded: Home (rule 3); the hidden time is consumed once visible', async () => {
    const id = await liveMatch('match_1_a', ago(5 * MIN))
    const storage = memoryStorage()
    const now = Date.now()
    sc.noteOpenMatch({ id }, storage)
    storage.setItem(sc.HIDDEN_AT_KEY, String(now - 16 * MIN))
    expect(await sc.matchToReopen(db, { storage, doc: visible, now })).toBeNull()
    expect(storage.getItem(sc.HIDDEN_AT_KEY)).toBeNull()
    storage.setItem(sc.HIDDEN_AT_KEY, String(now - 5 * MIN))
    expect(await sc.matchToReopen(db, { storage, doc: visible, now })).toEqual({ id, view: 'scoreboard' })
    // still hidden (a prerender, a background tab reloaded): kept
    storage.setItem(sc.HIDDEN_AT_KEY, String(now - 5 * MIN))
    await sc.matchToReopen(db, { storage, doc: { visibilityState: 'hidden' }, now })
    expect(storage.getItem(sc.HIDDEN_AT_KEY)).toBe(String(now - 5 * MIN))
  })
})

describe('trackBackground (rule 3)', () => {
  function fakePage() {
    const listeners = new Map()
    const target = () => ({
      addEventListener: (type, fn) => listeners.set(type, [...(listeners.get(type) || []), fn]),
      removeEventListener: (type, fn) => listeners.set(type, (listeners.get(type) || []).filter(f => f !== fn))
    })
    const doc = { visibilityState: 'visible', ...target() }
    const win = target()
    const fire = (type) => (listeners.get(type) || []).forEach(fn => fn())
    return { doc, win, fire, listeners }
  }

  it('only hidden time counts: 16 minutes hidden calls back, 5 minutes does not; the hidden-since time is kept for a reload', () => {
    const page = fakePage()
    const storage = memoryStorage()
    let t = 1_000_000
    const back = vi.fn()
    const stop = sc.trackBackground(back, { doc: page.doc, win: page.win, storage, now: () => t })
    page.doc.visibilityState = 'hidden'
    page.fire('visibilitychange')
    expect(storage.getItem(sc.HIDDEN_AT_KEY)).toBe(String(t))
    t += 5 * MIN
    page.doc.visibilityState = 'visible'
    page.fire('visibilitychange')
    expect(back).not.toHaveBeenCalled()
    expect(storage.getItem(sc.HIDDEN_AT_KEY)).toBeNull()

    // the Capacitor pause / resume, a resume that comes while still hidden
    page.fire('pause')
    page.doc.visibilityState = 'hidden'
    t += 16 * MIN
    page.fire('resume')
    expect(back).not.toHaveBeenCalled()
    page.doc.visibilityState = 'visible'
    page.fire('visibilitychange')
    expect(back).toHaveBeenCalledTimes(1)
    expect(back.mock.calls[0][0]).toBe(16 * MIN)

    stop()
    expect([...page.listeners.values()].every(fns => fns.length === 0)).toBe(true)
  })

  it('the Capacitor App plugin\'s appStateChange counts too', async () => {
    const page = fakePage()
    let handler = null
    const remove = vi.fn()
    page.win.Capacitor = { Plugins: { App: { addListener: (name, fn) => { handler = fn; return Promise.resolve({ remove }) } } } }
    let t = 0
    const back = vi.fn()
    const stop = sc.trackBackground(back, { doc: page.doc, win: page.win, storage: memoryStorage(), now: () => t })
    await Promise.resolve()
    handler({ isActive: false })
    t += 20 * MIN
    handler({ isActive: true })
    expect(back).toHaveBeenCalledWith(20 * MIN)
    stop()
    await Promise.resolve()
    expect(remove).toHaveBeenCalled()
  })
})

describe('setScore', () => {
  it('the latest set and the sets each team won; none yet: no set', () => {
    expect(sc.setScore([
      { index: 2, team1Points: 18, team2Points: 21, finished: true },
      { index: 1, team1Points: 21, team2Points: 15, finished: true },
      { index: 3, team1Points: 12, team2Points: 10, finished: false }
    ])).toEqual({ set: 3, team1: 12, team2: 10, setsTeam1: 1, setsTeam2: 1 })
    expect(sc.setScore([{ set_index: 1, team1_points: 3, team2_points: 4 }])).toEqual({ set: 1, team1: 3, team2: 4, setsTeam1: 0, setsTeam2: 0 })
    expect(sc.setScore([])).toEqual({ set: null, team1: 0, team2: 0, setsTeam1: 0, setsTeam2: 0 })
  })
})

describe('copies of one official match (rule 5: flagged, removed only by Clean up)', () => {
  async function copy(seed, { events = [], sets = [], fields = {} } = {}) {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    await db.players.add({ teamId: team1Id, number: 1, lastName: 'Müller' })
    const id = await db.matches.add({ seed_key: seed, status: 'live', gameN: 4711, team1Id, team2Id, createdAt: ago(60 * MIN), ...fields })
    for (const e of events) await db.events.add({ matchId: id, setIndex: 1, payload: {}, ts: ago(MIN), ...e })
    for (const st of sets) await db.sets.add({ matchId: id, ...st })
    return id
  }
  const SEED = 'match_1792518507614_u2sbmb'

  it('the copy furthest on is kept; an empty copy is removable, one with an event of its own is not', async () => {
    const kept = await copy(SEED, { events: [{ seq: 1, type: 'coin_toss' }, { seq: 2, type: 'point' }], sets: [{ index: 1, team1Points: 3, team2Points: 1 }] })
    const empty = await copy(SEED, { events: [{ seq: 1, type: 'coin_toss' }] })
    const own = await copy(SEED, { events: [{ seq: 9, type: 'point' }] })
    await copy('match_2_other')
    const { flagged } = await sc.findDuplicateCopies(db)
    expect(flagged.map(f => [f.id, f.keptId, f.removable]).sort()).toEqual([[empty, kept, true], [own, kept, false]].sort())
    // never the match on the screen
    expect((await sc.findDuplicateCopies(db, { openMatchId: empty })).flagged.find(f => f.id === empty).removable).toBe(false)
    // nothing removed by the check
    expect(await db.matches.count()).toBe(4)
  })

  it('a signature, a set score, the approval or an unsent write of the match keeps a copy', async () => {
    await copy(SEED, { events: [{ seq: 1, type: 'coin_toss' }, { seq: 2, type: 'point' }] })
    const signed = await copy(SEED, { fields: { team1CaptainSignature: 'data:x' } })
    const scored = await copy(SEED, { sets: [{ index: 2, team1Points: 5, team2Points: 0 }] })
    let { flagged } = await sc.findDuplicateCopies(db)
    expect(flagged.filter(f => f.removable)).toEqual([])
    expect(flagged.map(f => f.id).sort()).toEqual([signed, scored].sort())
    await db.matches.update(signed, { team1CaptainSignature: null })
    await db.sets.where('matchId').equals(scored).delete()
    ;({ flagged } = await sc.findDuplicateCopies(db))
    expect(flagged.every(f => f.removable)).toBe(true)
    await db.sync_queue.add({ resource: 'event', action: 'insert', status: 'queued', payload: { external_id: `${SEED}:e:4`, match_id: SEED } })
    ;({ flagged } = await sc.findDuplicateCopies(db))
    expect(flagged.some(f => f.removable)).toBe(false)
  })

  it('Clean up removes the removable copies with their own rows, decided again; a shared team row and the jobs stay', async () => {
    const kept = await copy(SEED, { events: [{ seq: 1, type: 'coin_toss' }, { seq: 2, type: 'point' }] })
    const empty = await copy(SEED)
    const keptMatch = await db.matches.get(kept)
    // the empty copy shares the kept one's team1 row (an older restore)
    await db.matches.update(empty, { team1Id: keptMatch.team1Id })
    const emptyMatch = await db.matches.get(empty)
    await db.sync_queue.add({ resource: 'event', action: 'insert', status: 'sent', payload: { external_id: `${SEED}:e:2`, match_id: SEED } })
    const { removed } = await sc.cleanUpDuplicateCopies(db, { keys: [SEED] })
    expect(removed.map(r => r.id)).toEqual([empty])
    expect(await db.matches.get(empty)).toBeUndefined()
    expect(await db.teams.get(keptMatch.team1Id)).toBeTruthy()
    expect(await db.teams.get(emptyMatch.team2Id)).toBeUndefined()
    expect(await db.sync_queue.count()).toBe(1)
    expect(await db.matches.get(kept)).toBeTruthy()
  })

  it('duplicates of a test match or a final copy are left alone; hasOtherLocalCopy', async () => {
    const a = await copy('test_1', { fields: { test: true } })
    await copy('test_1', { fields: { test: true } })
    await copy(SEED, { fields: { status: 'final' } })
    const b = await copy(SEED)
    expect((await sc.findDuplicateCopies(db)).flagged).toEqual([])
    expect(await sc.hasOtherLocalCopy(db, await db.matches.get(b))).toBe(true)
    expect(await sc.hasOtherLocalCopy(db, await db.matches.get(a))).toBe(false)
  })
})

describe('the server check', () => {
  const SEED = 'match_1792518507614_u2sbmb'
  const server = (rows, scorer = () => 'here') => ({
    readRows: vi.fn(async () => ({ data: rows, error: null })),
    noteClosed: vi.fn(async (id) => { await db.matches.update(id, { cloudBlock: { code: 'OV_MATCH_CLOSED' } }); return true }),
    scoringDevice: vi.fn(async (key) => scorer(key))
  })

  it('one read of every open official copy: closed ones marked, open ones asked about their scoring device', async () => {
    const closed = await db.matches.add({ seed_key: SEED, status: 'live', gameN: 4711 })
    const open = await db.matches.add({ seed_key: 'match_2_open', status: 'live', gameN: 4712 })
    const notThere = await db.matches.add({ seed_key: 'match_3_new', status: 'scheduled', gameN: 4713 })
    const moved = await db.matches.add({ seed_key: 'match_4_moved', status: 'live', gameN: 4714 })
    await db.matches.add({ seed_key: 'test_x', status: 'live', test: true })
    await db.matches.add({ seed_key: 'match_5_ended', status: 'ended', approved: true })
    await db.matches.add({ seed_key: 'match_6_final', status: 'final' })
    const s = server([
      { external_id: SEED, status: 'final', closed_at: '2026-10-20T18:40:00Z' },
      { external_id: 'match_2_open', status: 'live', closed_at: null },
      { external_id: 'match_4_moved', status: 'live', closed_at: null }
    ], (key) => (key === 'match_4_moved' ? 'moved' : 'here'))
    const r = await sc.checkCopiesOnServer(db, s)
    expect(s.readRows).toHaveBeenCalledTimes(1)
    expect(s.readRows.mock.calls[0][0].sort()).toEqual([SEED, 'match_2_open', 'match_3_new', 'match_4_moved'].sort())
    expect(r.asked).toBe(true)
    expect(r.closed.map(c => c.id)).toEqual([closed])
    expect(r.moved.map(c => c.id)).toEqual([moved])
    expect(r.here.sort()).toEqual([open, notThere].sort())
    expect(s.scoringDevice.mock.calls.map(c => c[0]).sort()).toEqual(['match_2_open', 'match_4_moved'])
  })

  it('a read that fails asks nothing more; onlyIds limits the check', async () => {
    const a = await db.matches.add({ seed_key: SEED, status: 'live' })
    await db.matches.add({ seed_key: 'match_2_open', status: 'live' })
    const failing = { readRows: async () => ({ data: null, error: { message: 'Database unavailable' } }), noteClosed: vi.fn(), scoringDevice: vi.fn() }
    expect(await sc.checkCopiesOnServer(db, failing)).toMatchObject({ asked: false, closed: [], here: [] })
    expect(failing.noteClosed).not.toHaveBeenCalled()
    const s = server([])
    await sc.checkCopiesOnServer(db, s, { onlyIds: [a] })
    expect(s.readRows.mock.calls[0][0]).toEqual([SEED])
  })

  it('copyState: what Home shows of a copy', () => {
    expect(sc.copyState({ status: 'live', cloudBlock: { code: 'OV_MATCH_CLOSED' } })).toBe('closed')
    expect(sc.copyState({ status: 'live', cloudBlock: { code: 'OV_SCORER_MOVED' } })).toBe('moved')
    expect(sc.copyState({ status: 'live' }, { checkedHere: true })).toBe('here')
    expect(sc.copyState({ status: 'live' })).toBe('unchecked')
    expect(sc.copyState({ status: 'ended', approved: true })).toBeNull()
    expect(sc.copyState({ status: 'live', test: true })).toBeNull()
  })

  it('unsentOfMatch: unsent and set-aside writes of the match, events counted apart', () => {
    const jobs = [
      { resource: 'event', action: 'insert', status: 'queued', payload: { external_id: `${SEED}:e:1`, match_id: SEED } },
      { resource: 'event', action: 'insert', status: 'superseded', superseded_by: 'server-closed', payload: { external_id: `${SEED}:e:2`, match_id: SEED } },
      { resource: 'set', action: 'update', status: 'failed', payload: { external_id: `${SEED}:s:1`, match_id: SEED } },
      { resource: 'event', action: 'insert', status: 'sent', payload: { external_id: `${SEED}:e:3`, match_id: SEED } },
      { resource: 'event', action: 'insert', status: 'queued', payload: { external_id: 'match_2_x:e:1', match_id: 'match_2_x' } }
    ]
    expect(sc.unsentOfMatch(jobs, SEED)).toEqual({ changes: 3, events: 2 })
    expect(sc.unsentOfMatch(jobs, null)).toEqual({ changes: 0, events: 0 })
  })

  it('withinTimeout: settles with the answer, or gives up and lets it run on', async () => {
    expect(await sc.withinTimeout(Promise.resolve(3), 50)).toEqual({ done: true, value: 3 })
    expect(await sc.withinTimeout(new Promise(() => {}), 10)).toEqual({ done: false })
  })
})
