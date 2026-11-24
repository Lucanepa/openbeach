import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// restoreMatchFromJson removed the copy it replaces with its sets, events,
// teams and players, but left the copy's event history (its undos) behind,
// under a local match id no match has any more. The history goes with the
// copy now, as when a match is deleted (wipeMatchEvents dropHistory).
let savedDeps
let db
let bm
let eventHistorySettled
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  ;({ eventHistorySettled } = await import('../../db_beach/eventHistory_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

// A local match with one point scored and one undone (a history row)
async function seedMatchWithUndo(seedKey, gameN) {
  const team1Id = await db.teams.add({ name: `Team ${gameN} 1` })
  const team2Id = await db.teams.add({ name: `Team ${gameN} 2` })
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN, seed_key: seedKey })
  await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false })
  await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
  const undone = await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 2, payload: { team: 'team2' } })
  await db.events.delete(undone) // an undo: the history keeps it
  await eventHistorySettled()
  return matchId
}

describe('replacing a copy of the match', () => {
  it('removes the copy\'s event history; another match keeps its own', async () => {
    const other = await seedMatchWithUndo('match_1792931000000_other1', 3)
    const copy = await seedMatchWithUndo('match_1792932000000_hist2', 7)
    expect(await db.event_history.where('matchId').equals(copy).count()).toBe(1)
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(copy)))

    const restored = await bm.restoreMatchFromJson(file)
    await eventHistorySettled()

    expect(await db.matches.get(copy)).toBeUndefined()
    expect(await db.event_history.where('matchId').equals(copy).count()).toBe(0)
    expect(await db.event_history.where('matchId').equals(restored).count()).toBe(0)
    expect(await db.event_history.where('matchId').equals(other).count()).toBe(1)
    expect(await db.event_history.count()).toBe(1)
  })
})
