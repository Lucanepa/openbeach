// Manual adjustments and the match officials (2026-11-20): a save wrote the
// four main officials as an object { ref1, ref2, scorer, asstScorer } over
// Match Setup's list. The line judges were deleted (any save: a team's name
// is enough), the scorers' country too, the Scoreboard's officials.find(...)
// threw on the object and the cloud merged it into its list. The save keeps
// the list now, line judges included, on the device and in the cloud job;
// a match saved the old way opens with its officials and is saved as a list.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

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

const OFFICIALS = [
  { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
  { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '14.03.1990' },
  { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'ITA', dob: '0077' },
  { role: 'assistant scorer', firstName: 'Ada', lastName: 'Assist', country: 'CHE', dob: null },
  { role: 'line judge 1', name: 'Lia Linie' },
  { role: 'line judge 2', name: 'Lina Linie' },
  { role: 'line judge 3', name: 'Leo Linie' }
]

async function addMatch(officials) {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  const team1Id = await db.teams.add({ name: 'Muster / Beispiel' })
  const team2Id = await db.teams.add({ name: 'Sonne / Strand' })
  return db.matches.add({
    team1Id, team2Id, status: 'ended', seed_key: 'ext-officials-1', test: false,
    scheduledAt: '2026-07-10T16:30:00.000Z', hall: 'Seebad', city: 'Musterdorf',
    officials
  })
}

async function editRef1LastAndSave(matchId, lastName) {
  render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
  const tab = await screen.findByRole('radio', { name: 'Match info' }).catch(() => screen.findByRole('button', { name: 'Match info' }))
  await act(async () => { fireEvent.click(tab) })
  await screen.findByLabelText('1st referee Licence')
  const last = screen.getAllByPlaceholderText(/last name/i)[0]
  await act(async () => { fireEvent.change(last, { target: { value: lastName } }) })
  const save = screen.getByRole('button', { name: /^Save/ })
  await waitFor(() => expect(save).not.toBeDisabled())
  await act(async () => { fireEvent.click(save) })
  await waitFor(async () => expect((await db.matches.get(matchId)).manualChanges?.length).toBeGreaterThan(0))
}

beforeEach(() => cleanup())

describe('ManualAdjustments_beach: the officials', () => {
  it('a save keeps Match Setup\'s list: the line judges and the scorer\'s country stay, the edit is in', async () => {
    const matchId = await addMatch(OFFICIALS)
    await editRef1LastAndSave(matchId, 'Richter')

    const saved = (await db.matches.get(matchId)).officials
    expect(Array.isArray(saved)).toBe(true)
    expect(saved.map(o => o.role)).toEqual(['1st referee', '2nd referee', 'scorer', 'assistant scorer', 'line judge 1', 'line judge 2', 'line judge 3'])
    expect(saved[0]).toMatchObject({ firstName: 'Rita', lastName: 'Richter', country: 'CHE', dob: '204411' })
    expect(saved[2]).toMatchObject({ lastName: 'Schreiber', country: 'ITA', dob: '0077' })
    expect(saved.slice(4)).toEqual(OFFICIALS.slice(4))

    // the cloud job: the same list as Match Setup sends it (replaces the cloud's, no object merged in)
    const job = (await db.sync_queue.toArray()).find(j => j.resource === 'match' && j.payload?.officials)
    expect(job).toBeTruthy()
    expect(Array.isArray(job.payload.officials)).toBe(true)
    expect(job.payload.officials[0]).toEqual({ role: '1st referee', first_name: 'Rita', last_name: 'Richter', country: 'CHE', dob: '204411' })
    expect(job.payload.officials[1].dob).toBe('1990-03-14')
    expect(job.payload.officials.slice(4)).toEqual(OFFICIALS.slice(4))
  })

  it('a match saved the old way (the object) opens with its officials and is saved as the list', async () => {
    const matchId = await addMatch({
      ref1: { firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: '204411' },
      ref2: { firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: '' },
      scorer: { firstName: 'Sina', lastName: 'Schreiber', dob: '0077' },
      asstScorer: { firstName: '', lastName: '', dob: '' }
    })
    render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
    const tab = await screen.findByRole('radio', { name: 'Match info' }).catch(() => screen.findByRole('button', { name: 'Match info' }))
    await act(async () => { fireEvent.click(tab) })
    expect(await screen.findByLabelText('1st referee Licence')).toHaveValue('204411')
    expect(screen.getAllByPlaceholderText(/first name/i)[0]).toHaveValue('Rita')
    cleanup()

    await editRef1LastAndSave(matchId, 'Richter')
    const saved = (await db.matches.get(matchId)).officials
    expect(Array.isArray(saved)).toBe(true)
    expect(saved.map(o => o.role)).toEqual(['1st referee', '2nd referee', 'scorer'])
    expect(saved[0]).toMatchObject({ role: '1st referee', firstName: 'Rita', lastName: 'Richter' })
  })
})
