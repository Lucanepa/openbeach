// CoinToss_beach: a forfeit before the match gives the winner sets 1 and 2
// (21:0, 21:0). They were written only in Dexie and the cloud got the match
// update alone, so the server had no sets and a PIN approval was refused
// (OV_RESULT_NOT_SYNCED).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))

let CoinToss
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  CoinToss = (await import('../../components_beach/CoinToss_beach')).default
})
afterAll(() => {
  cleanup()
  Object.assign(Dexie.dependencies, savedDeps)
})

beforeEach(async () => {
  cleanup()
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

async function seed({ test = false } = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber', color: '#ef4444' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi', color: '#3b82f6' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
    { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
    { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
  ])
  return db.matches.add({ team1Id, team2Id, status: 'scheduled', seed_key: 'seed-1', test })
}

const click = (el) => act(async () => { fireEvent.click(el) })

async function team2NoShow(matchId, onConfirm) {
  render(<CoinToss matchId={matchId} onConfirm={onConfirm} onBack={() => {}} />)
  await click(await screen.findByRole('button', { name: 'Forfait' }))
  await click(await screen.findByRole('button', { name: 'Rossi / Bianchi' }))
  await click(await screen.findByRole('button', { name: 'No show' }))
  await click(await screen.findByRole('button', { name: 'Confirm forfait' }))
  await waitFor(() => expect(onConfirm).toHaveBeenCalled())
}

describe('CoinToss_beach: a forfeit before the match', () => {
  it('queues sets 1 and 2 as finished cloud rows, before the match update', async () => {
    const matchId = await seed()
    await team2NoShow(matchId, vi.fn())

    const sets = (await db.sets.where({ matchId }).toArray()).sort((a, b) => a.index - b.index)
    expect(sets.map(s => [s.index, s.finished, s.team1Points, s.team2Points])).toEqual([[1, true, 21, 0], [2, true, 21, 0]])
    const jobs = await db.sync_queue.orderBy('id').toArray()
    const setJobs = jobs.filter(j => j.resource === 'set')
    expect(setJobs.map(j => [j.action, j.payload])).toEqual(sets.map(s => ['insert', {
      external_id: `seed-1:s:${s.id}`, match_id: 'seed-1', index: s.index,
      team1_points: 21, team2_points: 0, finished: true
    }]))
    const matchJob = jobs.findIndex(j => j.resource === 'match' && j.payload?.status === 'ended')
    expect(matchJob).toBeGreaterThan(jobs.indexOf(setJobs.at(-1)))
  })

  it('a test match queues no set', async () => {
    const matchId = await seed({ test: true })
    await team2NoShow(matchId, vi.fn())
    expect((await db.sync_queue.toArray()).filter(j => j.resource === 'set')).toEqual([])
  })
})
