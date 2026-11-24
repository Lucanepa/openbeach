import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// A match row keyed by `externalId` only (an older row: no seed_key, seedKey
// or external_id). The restore found the copy it replaces by localMatchKey,
// which reads externalId, but took its own key without it: none, so it
// replaced nothing and every restore of the same file added the match again.
let savedDeps
let db
let bm
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  bm = await import('../../utils_beach/backupManager_beach')
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})
beforeEach(async () => {
  await Promise.all(db.tables.map(t => t.clear()))
})

const KEY = 'match_1792932000000_ext1'

async function fileOfOlderRow() {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, externalId: KEY })
  await db.sets.add({ matchId, index: 1, team1Points: 5, team2Points: 4, finished: false })
  await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
  const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
  // written on another device: this one has none of it
  await Promise.all(db.tables.map(t => t.clear()))
  return file
}

describe('a backup keyed by externalId only', () => {
  it('restoring the same file twice leaves one match', async () => {
    const file = await fileOfOlderRow()

    await bm.restoreMatchFromJson(JSON.parse(JSON.stringify(file)))
    const id = await bm.restoreMatchFromJson(JSON.parse(JSON.stringify(file)))

    expect(await db.matches.count()).toBe(1)
    expect(await db.matches.get(id)).toMatchObject({ seed_key: KEY, gameN: 7 })
    expect(await db.sets.count()).toBe(1)
    expect(await db.events.count()).toBe(1)
    expect(await db.teams.count()).toBe(2)
  })

  it('restoreMatchInPlace refuses it on another match', async () => {
    const file = await fileOfOlderRow()
    const team1Id = await db.teams.add({ name: 'Keller / Frei' })
    const open = await db.matches.add({ team1Id, status: 'live', gameN: 8, seed_key: 'match_1792933000000_other2' })

    await expect(bm.restoreMatchInPlace(open, file)).rejects.toThrow('This backup belongs to a different match')
  })
})
