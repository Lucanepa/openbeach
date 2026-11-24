import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// restoreMatchInPlace (a cloud backup restored on the scoring screen) wrote
// the backup's team1Id / team2Id onto the open match. Those are local ids of
// the device and the copy that wrote the backup: restoreMatchFromJson gives a
// restored match new team rows and removes the replaced copy's, so an older
// backup of the same match pointed the open match at deleted rows (no teams,
// no players). The open match keeps its own team rows now, and a backup of
// another match is refused (as OpenVolley 92a288da).
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

const SEED = 'match_1792932000000_inpl1'

async function seedMatch(seedKey = SEED) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, lastName: 'Müller' },
    { teamId: team1Id, number: 2, lastName: 'Weber' },
    { teamId: team2Id, number: 1, lastName: 'Rossi' },
    { teamId: team2Id, number: 2, lastName: 'Bianchi' }
  ])
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'live', gameN: 7, seed_key: seedKey, gamePin: '900007' })
  await db.sets.add({ matchId, index: 1, team1Points: 5, team2Points: 4, finished: false })
  await db.events.add({ matchId, setIndex: 1, type: 'point', seq: 1, payload: { team: 'team1' } })
  return matchId
}

describe('restoreMatchInPlace keeps the open match\'s own team rows', () => {
  it('an older backup of a match restored from a file since: the teams and players stay', async () => {
    const original = await seedMatch()
    const older = JSON.parse(JSON.stringify(await bm.exportMatchData(original)))
    const restored = await bm.restoreMatchFromJson(JSON.parse(JSON.stringify(older)))
    const { team1Id, team2Id } = await db.matches.get(restored)
    // the replaced copy's team rows are gone: the older backup names them
    expect(await db.teams.bulkGet([older.match.team1Id, older.match.team2Id])).toEqual([undefined, undefined])

    await bm.restoreMatchInPlace(restored, older)

    const match = await db.matches.get(restored)
    expect(match).toMatchObject({ team1Id, team2Id, seed_key: SEED })
    expect((await db.teams.bulkGet([match.team1Id, match.team2Id])).map(t => t?.name)).toEqual(['Müller / Weber', 'Rossi / Bianchi'])
    expect(await db.players.where('teamId').anyOf([match.team1Id, match.team2Id]).count()).toBe(4)
  })

  it('a backup of another match is refused and the open match is left as it is', async () => {
    const open = await seedMatch()
    const before = await db.matches.get(open)
    const other = JSON.parse(JSON.stringify(await bm.exportMatchData(await seedMatch('match_1792933000000_other2'))))

    await expect(bm.restoreMatchInPlace(open, other)).rejects.toThrow('This backup belongs to a different match')

    expect(await db.matches.get(open)).toEqual(before)
    expect(await db.events.where('matchId').equals(open).count()).toBe(1)
    expect(await db.sync_queue.filter(j => j.action === 'restore').count()).toBe(0)
  })
})
