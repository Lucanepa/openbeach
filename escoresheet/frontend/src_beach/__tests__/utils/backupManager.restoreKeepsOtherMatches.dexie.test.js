import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// restoreMatchFromJson cleared every match, set and event on the device
// before it restored the backup (and gave the restored match id 1): restoring
// one match from a file or a cloud backup lost every other match of the
// tournament the device still held, finished ones not yet in the cloud too.
// It replaces only this device's copy of the restored match now, as
// OpenVolley does (b3227e75, 92a288da).
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

const OTHER = 'match_1792931000000_other1'
const RESTORED = 'match_1792932000000_rest2'

async function seedMatch(seedKey, [name1, name2], { points = [21, 15], status = 'live', gameN = 1 } = {}) {
  const team1Id = await db.teams.add({ name: name1 })
  const team2Id = await db.teams.add({ name: name2 })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, lastName: `${name1} 1` },
    { teamId: team1Id, number: 2, lastName: `${name1} 2` },
    { teamId: team2Id, number: 1, lastName: `${name2} 1` },
    { teamId: team2Id, number: 2, lastName: `${name2} 2` }
  ])
  const matchId = await db.matches.add({ team1Id, team2Id, status, gameN, seed_key: seedKey, gamePin: `90000${gameN}` })
  await db.sets.add({ matchId, index: 1, team1Points: points[0], team2Points: points[1], finished: status !== 'live' })
  await db.events.bulkAdd([
    { matchId, setIndex: 1, type: 'coin_toss', seq: 1, payload: {} },
    { matchId, setIndex: 1, type: 'point', seq: 2, payload: { team: 'team1' } }
  ])
  return matchId
}

// Every row of one local match, without the ids the restore gives out
async function rowsOf(matchId) {
  const match = await db.matches.get(matchId)
  const teams = await db.teams.bulkGet([match.team1Id, match.team2Id])
  const players = await db.players.where('teamId').anyOf([match.team1Id, match.team2Id]).toArray()
  return {
    match,
    teams,
    players: players.map(p => p.lastName).sort(),
    sets: (await db.sets.where('matchId').equals(matchId).toArray()).map(s => `${s.index}:${s.team1Points}-${s.team2Points}`),
    events: (await db.events.where('matchId').equals(matchId).toArray()).map(e => `${e.seq}:${e.type}`)
  }
}

describe('restoreMatchFromJson keeps the other matches on the device', () => {
  it('replaces only this match\'s copy: the other match, its teams, players, sets and events stay', async () => {
    // a finished match of the same pair, still on the device
    const other = await seedMatch(OTHER, ['Müller / Weber', 'Rossi / Bianchi'], { points: [21, 12], status: 'ended', gameN: 3 })
    const otherBefore = await rowsOf(other)
    // the match being restored: its backup has a later score than the copy here
    const copy = await seedMatch(RESTORED, ['Müller / Weber', 'Keller / Frei'], { points: [5, 4], gameN: 7 })
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(copy)))
    file.sets[0].team1Points = 18
    file.sets[0].team2Points = 16
    file.events.push({ matchId: copy, setIndex: 1, type: 'point', seq: 3, payload: { team: 'team2' } })
    const copyTeams = [file.match.team1Id, file.match.team2Id]

    const restored = await bm.restoreMatchFromJson(file)

    // the other match is untouched, under its own ids
    expect(await rowsOf(other)).toEqual(otherBefore)
    expect(await db.matches.count()).toBe(2)
    // the restored match is new, with the backup's sets and events
    expect(restored).not.toBe(other)
    expect(restored).not.toBe(copy)
    expect(await db.matches.get(copy)).toBeUndefined()
    expect(await db.matches.filter(m => m.seed_key === RESTORED).count()).toBe(1)
    const r = await rowsOf(restored)
    expect(r.match).toMatchObject({ seed_key: RESTORED, gameN: 7, status: 'live' })
    expect(r.sets).toEqual(['1:18-16'])
    expect(r.events).toEqual(['1:coin_toss', '2:point', '3:point'])
    // its own team rows: never the other match's "Müller / Weber"
    expect(r.teams.map(t => t.name)).toEqual(['Müller / Weber', 'Keller / Frei'])
    expect([r.match.team1Id, r.match.team2Id]).not.toContain(otherBefore.match.team1Id)
    expect(r.players).toEqual(['Keller / Frei 1', 'Keller / Frei 2', 'Müller / Weber 1', 'Müller / Weber 2'])
    // the replaced copy's teams and players went with it
    expect(await db.teams.bulkGet(copyTeams)).toEqual([undefined, undefined])
    expect(await db.players.where('teamId').anyOf(copyTeams).count()).toBe(0)
    expect(await db.teams.count()).toBe(4)
    expect(await db.sets.count()).toBe(2)
    expect(await db.events.count()).toBe(5)
  })

  it('a match that is not on the device yet is added next to the others', async () => {
    const first = await seedMatch(OTHER, ['Müller / Weber', 'Rossi / Bianchi'], { gameN: 3 })
    const second = await seedMatch(RESTORED, ['Keller / Frei', 'Huber / Graf'], { gameN: 7 })
    const firstBefore = await rowsOf(first)
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(second)))
    file.match.seed_key = 'match_1792933000000_new3'
    file.match.gameN = 8

    const restored = await bm.restoreMatchFromJson(file)

    expect(await rowsOf(first)).toEqual(firstBefore)
    expect(await db.matches.get(second)).toMatchObject({ seed_key: RESTORED, gameN: 7 })
    expect(await db.sets.where('matchId').equals(second).count()).toBe(1)
    expect(await db.events.where('matchId').equals(second).count()).toBe(2)
    expect(await db.matches.get(restored)).toMatchObject({ seed_key: 'match_1792933000000_new3', gameN: 8 })
    expect(await db.matches.count()).toBe(3)
  })

  it('a team row another local match still uses stays when the copy is replaced', async () => {
    // an earlier restore left two matches on one team row
    const copy = await seedMatch(RESTORED, ['Müller / Weber', 'Keller / Frei'], { gameN: 7 })
    const shared = (await db.matches.get(copy)).team1Id
    const otherTeam2 = await db.teams.add({ name: 'Rossi / Bianchi' })
    const other = await db.matches.add({ team1Id: shared, team2Id: otherTeam2, status: 'ended', seed_key: OTHER })
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(copy)))

    await bm.restoreMatchFromJson(file)

    expect(await db.teams.get(shared)).toMatchObject({ name: 'Müller / Weber' })
    expect(await db.players.where('teamId').equals(shared).count()).toBe(2)
    expect(await db.matches.get(other)).toMatchObject({ team1Id: shared, seed_key: OTHER })
  })
})
