import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { captureFullStateSnapshot } from '../../utils_beach/stateSnapshot_beach'

// captureFullStateSnapshot feeds every event's stateSnapshot and the live
// state (match_live_state, referee, scoreboard display). It catches its own
// errors and answers null, and a null snapshot silently stops the live sync:
// a ReferenceError inside it (a const read before its declaration) kept the
// livescore at 0:0. A real match with one point must give a full snapshot.

let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  db = new Dexie('snapshot-test')
  db.version(1).stores({
    players: '++id,teamId,number',
    matches: '++id',
    sets: '++id,matchId,index',
    events: '++id,matchId,setIndex,seq,[matchId+seq]'
  })
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

let teamSeq = 10
async function seedMatch({ coinTossTeamA = 'team1', firstServe = 'team1', withPlayers = true } = {}) {
  const t1 = ++teamSeq
  const t2 = ++teamSeq
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live',
    team1Name: 'Muster / Beispiel', team2Name: 'Rossi / Bianchi',
    team1Color: '#ef4444', team2Color: '#3b82f6',
    coinTossTeamA, firstServe, team1FirstServe: 1, team2FirstServe: 2
  })
  if (withPlayers) {
    await db.players.bulkAdd([
      { teamId: t1, number: 1, lastName: 'Muster', isCaptain: true },
      { teamId: t1, number: 2, lastName: 'Beispiel' },
      { teamId: t2, number: 1, lastName: 'Rossi' },
      { teamId: t2, number: 2, lastName: 'Bianchi', isCaptain: true }
    ])
  }
  await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false })
  await db.events.add({ matchId, setIndex: 1, seq: 1, type: 'coin_toss', payload: {} })
  await db.events.add({ matchId, setIndex: 1, seq: 2, type: 'point', payload: { team: 'team1' } })
  return matchId
}

describe('captureFullStateSnapshot', () => {
  it('a match with one point gives a full snapshot, without an error', async () => {
    const err = vi.spyOn(console, 'error')
    const matchId = await seedMatch()
    const s = await captureFullStateSnapshot(db, matchId)
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
    expect(s).not.toBeNull()
    expect(s).toMatchObject({
      matchId,
      teamAKey: 'team1',
      teamAName: 'Muster / Beispiel',
      teamBName: 'Rossi / Bianchi',
      currentSetIndex: 1,
      pointsA: 1,
      pointsB: 0,
      setScoreA: 0,
      setScoreB: 0,
      servingTeam: 'team1',
      serverNumber: 1,
      sideA: 'left'
    })
    // the lineups come from the players (no lineup events in beach)
    expect(s.lineupA.I).toMatchObject({ number: 1, isServing: true, isCaptain: true })
    expect(s.lineupA.III).toMatchObject({ number: 2, isServing: false })
    expect(s.lineupB.II).toMatchObject({ number: 2, isCaptain: true })
    expect(s.lineupB.IV).toMatchObject({ number: 1 })
  })

  it('team B as the coin-toss team A: the sides and the rosters swap', async () => {
    const matchId = await seedMatch({ coinTossTeamA: 'team2', firstServe: 'team2' })
    const s = await captureFullStateSnapshot(db, matchId)
    expect(s).not.toBeNull()
    expect(s.teamAKey).toBe('team2')
    expect(s.pointsA).toBe(0)
    expect(s.pointsB).toBe(1)
    expect(s.lineupA.I.number).toBe(2)
  })

  it('a match without players still gives a snapshot', async () => {
    const matchId = await seedMatch({ withPlayers: false })
    const s = await captureFullStateSnapshot(db, matchId)
    expect(s).not.toBeNull()
    expect(s.lineupA).toBeNull()
  })

  it('no match, or no set: null', async () => {
    expect(await captureFullStateSnapshot(db, 999)).toBeNull()
    expect(await captureFullStateSnapshot(db, null)).toBeNull()
    const matchId = await db.matches.add({ status: 'setup' })
    expect(await captureFullStateSnapshot(db, matchId)).toBeNull()
  })
})
