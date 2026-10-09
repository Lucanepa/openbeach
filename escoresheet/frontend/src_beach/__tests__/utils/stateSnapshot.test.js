import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { captureFullStateSnapshot, refreshIntervalSnapshots } from '../../utils_beach/stateSnapshot_beach'
import { swapTeamDesignation } from '../../utils_beach/coinToss_beach'
import { isTeam1LeftInSet } from '../../utils_beach/courtSides_beach'

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
    teams: '++id',
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
async function seedMatch({ coinTossTeamA = 'team1', firstServe = 'team1', withPlayers = true, matchColours = { team1Color: '#ef4444', team2Color: '#3b82f6' }, teamColours = null } = {}) {
  const t1 = ++teamSeq
  const t2 = ++teamSeq
  if (teamColours) {
    await db.teams.put({ id: t1, name: 'Muster / Beispiel', color: teamColours.team1 })
    await db.teams.put({ id: t2, name: 'Rossi / Bianchi', color: teamColours.team2 })
  }
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live',
    team1Name: 'Muster / Beispiel', team2Name: 'Rossi / Bianchi',
    ...matchColours,
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

  it('the sides (sideA) are the scorer\'s: after a change of courts, in a set without its own override, in set 3', async () => {
    const sideAWith = async (fields, setIndex = 1) => {
      const matchId = await seedMatch()
      await db.matches.update(matchId, fields)
      if (setIndex > 1) {
        await db.sets.where({ matchId }).modify({ finished: true })
        await db.sets.add({ matchId, index: setIndex, team1Points: 0, team2Points: 0, finished: false })
      }
      return (await captureFullStateSnapshot(db, matchId)).sideA
    }
    // the change of courts at the TTO (or any other) wrote B on the left
    expect(await sideAWith({ setLeftTeamOverrides: { 1: 'B' } })).toBe('right')
    // set 2 without its own override: where set 1 ended (no change between
    // sets unless asked), not alternated
    expect(await sideAWith({ setLeftTeamOverrides: { 1: 'A' } }, 2)).toBe('left')
    expect(await sideAWith({ setLeftTeamOverrides: { 1: 'B' } }, 2)).toBe('right')
    // set 3: its toss's side until its first change
    expect(await sideAWith({ setLeftTeamOverrides: { 1: 'A', 2: 'A' }, set3LeftTeam: 'B' }, 3)).toBe('right')
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

// An interval tap refreshes the snapshots of the events logged in the
// interval with the sides and serve of now. After a "Swap team A ↔ B" those
// snapshots keep their own Team A: the refreshed fields are written in it
// (the swap moves nothing; an undo reads them in the snapshot's designation).
// The live state (referee, livescore) had the colours of the match record
// only: Manual Adjustments edits only the team, so those screens kept the
// old colour, and without any colour team A got red even as team 2 (blue
// on the scorer's court). It now carries what the scorer's court shows.
describe('captureFullStateSnapshot: the team colours the scorer\'s court shows', () => {
  it('the team\'s own colour wins over the match\'s copy', async () => {
    const matchId = await seedMatch({ coinTossTeamA: 'team2', teamColours: { team1: '#22c55e', team2: '#a855f7' } })
    const snapshot = await captureFullStateSnapshot(db, matchId)
    expect(snapshot.teamAColor).toBe('#a855f7')
    expect(snapshot.teamBColor).toBe('#22c55e')
  })

  it('colours only on the teams: sent all the same', async () => {
    const matchId = await seedMatch({ matchColours: {}, teamColours: { team1: '#eab308', team2: '#065f46' } })
    const snapshot = await captureFullStateSnapshot(db, matchId)
    expect(snapshot.teamAColor).toBe('#eab308')
    expect(snapshot.teamBColor).toBe('#065f46')
  })

  it('inside a transaction without the teams table: still a snapshot, with the match\'s colours', async () => {
    const matchId = await seedMatch({ teamColours: { team1: '#22c55e', team2: '#a855f7' } })
    const snapshot = await db.transaction('r', [db.matches, db.sets, db.events, db.players], () => captureFullStateSnapshot(db, matchId))
    expect(snapshot).toBeTruthy()
    expect(snapshot.teamAColor).toBe('#ef4444')
    expect(snapshot.teamBColor).toBe('#3b82f6')
  })

  it('no colour anywhere: team 2 as team A sends the team 2 blue the court shows, not red', async () => {
    const matchId = await seedMatch({ coinTossTeamA: 'team2', matchColours: {} })
    const snapshot = await captureFullStateSnapshot(db, matchId)
    expect(snapshot.teamAColor).toBe('#3b82f6')
    expect(snapshot.teamBColor).toBe('#ef4444')
  })
})

describe('refreshIntervalSnapshots after a swap of team A / B', () => {
  it('the sides, the set 3 labels and the line-ups in the snapshot\'s own designation', async () => {
    const matchId = await seedMatch()
    await db.sets.where({ matchId }).modify({ finished: true, team1Points: 21, team2Points: 10 })
    await db.sets.add({ matchId, index: 2, team1Points: 10, team2Points: 21, finished: true })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    // set 3's toss with A = team1: team2 (B) on the left, A serves
    await db.matches.update(matchId, { set3CoinTossWinner: 'team1', set3LeftTeam: 'B', set3FirstServe: 'A', setLeftTeamOverrides: { 2: 'A' } })
    const toss = await db.events.add({ matchId, setIndex: 3, seq: 3, type: 'set3_coin_toss_winner', payload: { winner: 'team1' } })
    await db.events.update(toss, { stateSnapshot: await captureFullStateSnapshot(db, matchId) })
    const tossSnap = (await db.events.get(toss)).stateSnapshot
    expect(tossSnap).toMatchObject({ teamAKey: 'team1', sideA: 'right', set3LeftTeam: 'B', set3FirstServe: 'A' })

    // the swap: A = team2 (labels flipped, nobody moves)
    const match = await db.matches.get(matchId)
    await db.matches.update(matchId, swapTeamDesignation(match))
    const written = {}
    await refreshIntervalSnapshots(db, matchId, 3, async (id, snap) => { written[id] = snap })
    const snap = written[toss]
    expect(snap.teamAKey).toBe('team1')
    // in its own designation, as before the swap: team2 (B) on the left, A serves
    expect(snap.sideA).toBe('right')
    expect(snap.set3LeftTeam).toBe('B')
    expect(snap.set3FirstServe).toBe('A')
    expect(isTeam1LeftInSet(3, { coinTossTeamA: 'team1', ...snap })).toBe(false)
    // lineupA is team1's still
    // (team1's captain is its no. 1, team2's its no. 2)
    const captain = (lineup) => Object.values(lineup || {}).find(p => p?.isCaptain)?.number
    expect(captain(tossSnap.lineupA)).toBe(1)
    expect(captain(snap.lineupA)).toBe(1)
    expect(snap.lineupA).toEqual(tossSnap.lineupA)
    expect(snap.lineupB).toEqual(tossSnap.lineupB)
  })
})
