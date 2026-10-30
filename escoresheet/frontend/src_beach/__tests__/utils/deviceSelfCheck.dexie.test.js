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
