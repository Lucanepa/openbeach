import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// A restore from a backup file sends the match to the cloud (the 'restore'
// job). Its coin toss had team A / B and the first server but no serve_a: a
// later restore by game number + PIN read serve_a undefined and the coin
// toss screen showed team A serving, whoever served (found by a check,
// 2026-10-09). serve_a now goes with it, following the first server.
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

const SEED = 'match_1759740000000_serve'

// Team A is team1, team B (team2) served first
async function seedMatch(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  const matchId = await db.matches.add({
    team1Id, team2Id, status: 'live', gameN: 12, seed_key: SEED, gamePin: '900001',
    coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2',
    firstServe: 'team2', coinTossServeA: false, coinTossServeB: true, ...extra
  })
  await db.sets.add({ matchId, index: 1, team1Points: 3, team2Points: 5 })
  return matchId
}
const restoreJob = async () => (await db.sync_queue.toArray()).find(j => j.action === 'restore')

// What a restore by game number + PIN makes of the cloud row the job wrote
async function restoredByPin(coinToss) {
  await Promise.all(db.tables.map(t => t.clear()))
  const id = await bm.importMatchFromSupabase({
    match: { external_id: SEED, status: 'live', game_n: 12, sport_type: 'beach', team1_data: { name: 'A' }, team2_data: { name: 'B' }, coin_toss: coinToss },
    sets: [], events: []
  })
  return db.matches.get(id)
}

describe('a backup restore sends the coin toss with serve_a', () => {
  it('from a file: serve_a false (team B served), and a restore by PIN shows B serving', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await Promise.all(db.tables.map(t => t.clear()))
    await bm.restoreMatchFromJson(file)
    const toss = (await restoreJob()).payload.match.coin_toss
    expect(toss).toMatchObject({ team_a: 'team1', team_b: 'team2', first_serve: 'team2', serve_a: false })
    expect(await restoredByPin(toss)).toMatchObject({ coinTossTeamA: 'team1', coinTossServeA: false })
  })

  it('in place: serve_a true when team A served', async () => {
    const matchId = await seedMatch({ firstServe: 'team1', coinTossServeA: true, coinTossServeB: false })
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await bm.restoreMatchInPlace(matchId, file)
    const toss = (await restoreJob()).payload.match.coin_toss
    expect(toss).toMatchObject({ team_a: 'team1', first_serve: 'team1', serve_a: true })
  })

  it('in place: serve_a false when team B served', async () => {
    const matchId = await seedMatch()
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await bm.restoreMatchInPlace(matchId, file)
    expect((await restoreJob()).payload.match.coin_toss.serve_a).toBe(false)
  })

  it('a match without a coin toss yet sends no serve_a', async () => {
    const matchId = await seedMatch({ coinTossConfirmed: false, coinTossTeamA: undefined, coinTossTeamB: undefined, firstServe: undefined, coinTossServeA: undefined, coinTossServeB: undefined })
    const file = JSON.parse(JSON.stringify(await bm.exportMatchData(matchId)))
    await bm.restoreMatchInPlace(matchId, file)
    expect('serve_a' in ((await restoreJob()).payload.match.coin_toss || {})).toBe(false)
  })
})
