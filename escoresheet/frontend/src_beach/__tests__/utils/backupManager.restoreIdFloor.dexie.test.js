import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// A restore gives the match's sets and events new local ids, and its restore
// job keys their cloud rows by them (`<seed>:s:<id>`, `<seed>:e:<id>`). The
// server re-inserts the events, and an event whose external_id has a latest
// 'void' revision (event_revisions survives a restore) is born voided
// (backend db/015 events_apply_void). A fresh device restoring another
// device's file gave out ids from 1: the restored event under ':e:20' was
// voided on the server because the device that wrote the file had undone its
// own ':e:20'. The restore now gives out ids above every id the file carries
// (with a margin for the ones undone after it was written), as a restore by
// game PIN does with the server's idFloor.
let savedDeps
let db
let bm
let eventExtId
let setExtId
let eventHistorySettled
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  // a database of its own: an empty device, its id generators at 1
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  ;({ eventExtId, setExtId } = await import('../../utils_beach/syncIds_beach'))
  ;({ eventHistorySettled } = await import('../../db_beach/eventHistory_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const SEED = 'match_1792932000000_floor1'

// The file another device wrote: its sets 1..2 and events 1..25, where it
// had undone its ':e:20' (voided on the server) before scoring on
function otherDevicesFile() {
  const eventIds = [...Array(25).keys()].map(i => i + 1).filter(id => id !== 20)
  return {
    version: 1,
    lastUpdated: '2026-10-29T10:00:00.000Z',
    match: { id: 1, team1Id: 1, team2Id: 2, status: 'live', gameN: 9, seed_key: SEED, gamePin: '900009' },
    team1: { id: 1, name: 'Müller / Weber' },
    team2: { id: 2, name: 'Rossi / Bianchi' },
    team1Players: [],
    team2Players: [],
    sets: [
      { id: 1, matchId: 1, index: 1, team1Points: 21, team2Points: 17, finished: true },
      { id: 2, matchId: 1, index: 2, team1Points: 2, team2Points: 3, finished: false }
    ],
    events: eventIds.map((id, i) => ({ id, matchId: 1, setIndex: id <= 20 ? 1 : 2, type: 'point', seq: i + 1, payload: { team: i % 2 ? 'team2' : 'team1' } }))
  }
}

describe('a restore gives out ids above the ones the file carries', () => {
  it('restoreMatchFromJson on an empty device: no restored set or event takes an id the other device used', async () => {
    expect(await db.events.count()).toBe(0)
    const file = otherDevicesFile()
    const restored = await bm.restoreMatchFromJson(JSON.parse(JSON.stringify(file)))

    const sets = await db.sets.where('matchId').equals(restored).sortBy('index')
    const events = await db.events.where('matchId').equals(restored).sortBy('seq')
    expect(sets).toHaveLength(2)
    expect(events).toHaveLength(24)
    for (const s of sets) expect(s.id).toBeGreaterThan(2)
    for (const e of events) expect(e.id).toBeGreaterThan(25)

    // the restore job sends the restored rows' own ids
    const [job] = (await db.sync_queue.toArray()).filter(j => j.action === 'restore')
    expect(job.payload.sets.map(s => s.external_id)).toEqual(sets.map(s => setExtId(SEED, s.id)))
    expect(job.payload.events.map(e => e.external_id)).toEqual(events.map(e => eventExtId(SEED, e.id)))
    expect(job.payload.events.map(e => e.external_id)).not.toContain(eventExtId(SEED, 20))

    // the next rally scored here stays above an event the other device
    // undid after it wrote the file (':e:26')
    const next = await db.events.add({ matchId: restored, setIndex: 2, type: 'point', seq: 25, payload: { team: 'team1' } })
    expect(next).toBeGreaterThan(26)
    // the generators were raised without leaving a row, a history row or a
    // revision job behind
    await eventHistorySettled()
    expect(await db.events.count()).toBe(25)
    expect(await db.sets.count()).toBe(2)
    expect(await db.event_history.count()).toBe(0)
    expect(await db.sync_queue.count()).toBe(1)
  })

  it('restoreMatchInPlace too', async () => {
    const open = await bm.restoreMatchFromJson(otherDevicesFile())
    const file = otherDevicesFile()
    // the cloud ids of an import: the other device's ids, far above
    file.events = file.events.map(e => ({ ...e, externalId: eventExtId(SEED, e.id + 5000) }))

    await bm.restoreMatchInPlace(open, JSON.parse(JSON.stringify(file)))

    const events = await db.events.where('matchId').equals(open).toArray()
    expect(events).toHaveLength(24)
    for (const e of events) expect(e.id).toBeGreaterThan(5025)
  })
})
