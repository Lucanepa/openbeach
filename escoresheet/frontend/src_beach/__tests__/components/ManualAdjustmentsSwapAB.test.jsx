// Manual adjustments (the match's editor) "Swap A/B": only which team is A
// and which is B changes (owner's decision, 2026-10-09, as the scoring
// screen's "Swap team A ↔ B" and OpenVolley's editor). It swapped the editor's
// team 1 / team 2 data instead: saved, the device only flipped coinTossTeamA
// (the first server flag, the set 3 toss and the court sides kept their A/B
// labels, so the server and the sides changed team), and the cloud got each
// team's name, players and points under the other team.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { isTeam1LeftInSet } from '../../utils_beach/courtSides_beach'
import { setFirstServer } from '../../utils_beach/coinToss_beach'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))

let ManualAdjustments
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  ManualAdjustments = (await import('../../components_beach/ManualAdjustments_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
let team1Id
let team2Id
beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  team1Id = await db.teams.add({ name: 'Müller / Weber' })
  team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller' },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
    { teamId: team2Id, number: 7, firstName: 'Sara', lastName: 'Rossi' },
    { teamId: team2Id, number: 9, firstName: 'Gia', lastName: 'Bianchi' }
  ])
  // A = team1; set 2 with team2 on the left; set 3's toss: team2 (B) left,
  // team1 (A) serves first; team2 serves set 1
  matchId = await db.matches.add({
    team1Id, team2Id, status: 'live', seed_key: 'match_swap_editor',
    coinTossTeamA: 'team1', coinTossTeamB: 'team2', firstServe: 'team2', coinTossServeA: false, coinTossServeB: true,
    setLeftTeamOverrides: { 2: 'B' }, set3LeftTeam: 'B', set3FirstServe: 'A'
  })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 17, finished: true },
    { matchId, index: 2, team1Points: 5, team2Points: 3, finished: false }
  ])
})

describe('ManualAdjustments_beach "Swap A/B"', () => {
  it('re-labels the teams only: same sides, same servers, each team its data, here and in the cloud', async () => {
    const before = await db.matches.get(matchId)
    render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
    const tab = await screen.findByRole('radio', { name: 'Teams & players' }).catch(() => screen.findByRole('button', { name: 'Teams & players' }))
    await act(async () => { fireEvent.click(tab) })
    const swap = await screen.findByRole('button', { name: 'Swap A/B' })
    await act(async () => { fireEvent.click(swap) })
    const save = await waitFor(() => {
      const b = screen.getAllByRole('button').find(x => /^Save/.test(x.textContent.trim()) && !x.disabled)
      expect(b).toBeTruthy()
      return b
    })
    await act(async () => { fireEvent.click(save) })
    await waitFor(async () => expect((await db.matches.get(matchId)).coinTossTeamA).toBe('team2'))

    const after = await db.matches.get(matchId)
    expect(after.coinTossTeamB).toBe('team1')
    expect(after.team1Id).toBe(team1Id)
    expect(after.team2Id).toBe(team2Id)
    for (const set of [1, 2, 3]) {
      expect(isTeam1LeftInSet(set, after)).toBe(isTeam1LeftInSet(set, before))
      expect(setFirstServer(after, set)).toBe(setFirstServer(before, set))
    }
    expect(after.firstServe).toBe('team2')
    expect(after.coinTossServeA).toBe(true)
    // each team keeps its points
    const sets = (await db.sets.where({ matchId }).toArray()).sort((a, b) => a.index - b.index)
    expect(sets.map(s => [s.team1Points, s.team2Points])).toEqual([[21, 17], [5, 3]])

    // the cloud: team1's name and players stay team1's, the coin toss names
    // the new A with the same first server
    const job = await waitFor(async () => {
      const j = (await db.sync_queue.toArray()).find(x => x.resource === 'match' && x.action === 'update')
      expect(j).toBeTruthy()
      return j
    })
    expect(job.payload.team1_data.name).toBe('Müller / Weber')
    expect(job.payload.team2_data.name).toBe('Rossi / Bianchi')
    expect(job.payload.players_team1.map(p => p.number).sort()).toEqual([1, 2])
    expect(job.payload.set_results.map(s => [s.team1_points, s.team2_points])).toEqual([[21, 17], [5, 3]])
    expect(job.payload.coin_toss).toMatchObject({ team_a: 'team2', team_b: 'team1', first_serve: 'team2', serve_a: true })
  })
})
