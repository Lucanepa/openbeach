import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { accessFromRoles } from '../../lib_beach/access_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
import { findOfficial } from '../../utils_beach/officials_beach'

// Match Setup's officials (OpenVolley audit round 3, PERM-08, owner decision
// 6): the 1st and 2nd referee take the address of the appointed referee's
// account. It is stored with the match and synced (officials[].email).

const h = vi.hoisted(() => ({ auth: null }))

vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => h.auth }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../hooks_beach/useSavedTeams_beach', () => ({
  useSavedTeams: () => ({ teams: [], competitions: [], meta: null, loading: false, lastStatus: null, refresh: async () => {}, reload: async () => {} })
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true,
  getBackendUrl: () => 'http://backend.test',
  getApiUrl: () => null
}))

let MatchSetup
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  MatchSetup = (await import('../../components_beach/MatchSetup_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

const SEED = 'match_1792000000000_refml'

async function addMatch() {
  const team1Id = await db.teams.add({ name: 'Rossi / Bianchi', color: '#ef4444' })
  const team2Id = await db.teams.add({ name: 'Meier / Huber', color: '#3b82f6' })
  return db.matches.add({
    team1Id, team2Id, status: 'scheduled', seed_key: SEED, test: false,
    scheduledAt: '2026-07-10T16:30:00.000Z', hall: 'Seebad', city: 'Musterdorf',
    matchInfoConfirmedAt: '2026-07-10T15:00:00.000Z',
    officials: [
      { role: '1st referee', firstName: 'Rita', lastName: 'Referee', country: 'CHE', dob: null, email: 'rita@example.ch' },
      { role: '2nd referee', firstName: 'Remo', lastName: 'Zweiter', country: 'CHE', dob: null },
      { role: 'scorer', firstName: 'Sina', lastName: 'Schreiber', country: 'CHE', dob: null }
    ]
  })
}

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  useMemoryLocalStorage()
  h.auth = {
    user: { id: 'u1' }, profile: { roles: ['beach:scorer'] }, getCachedProfile: () => null,
    access: { ...accessFromRoles(['beach:scorer']), known: true }
  }
})

async function openOfficials(matchId) {
  render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
  const heading = await screen.findByRole('heading', { name: 'Match officials' })
  const card = heading.closest('div.flex.min-w-0')
  const edit = within(card).getByRole('button', { name: 'Edit' })
  await waitFor(() => expect(edit).not.toBeDisabled())
  await act(async () => { fireEvent.click(edit) })
  await screen.findByRole('button', { name: /^1st referee/ })
}

describe('Match Setup: the referees\' account addresses', () => {
  it('shows the stored address, and Save keeps the typed one on the device and in the cloud job', async () => {
    const matchId = await addMatch()
    await openOfficials(matchId)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^1st referee/ })) })
    const ref1 = await screen.findByTestId('ref1-email')
    expect(ref1).toHaveValue('rita@example.ch')
    expect(ref1).toHaveAttribute('type', 'email')
    expect(ref1.getAttribute('aria-label')).toMatch(/Email of their account$/)
    expect(screen.getByText(/Only this match's scorers see it\./)).toBeInTheDocument()
    // the scorers' boxes have no address field (their slot is the match's own accounts)
    expect(screen.queryByTestId('scorer-email')).toBeNull()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^2nd referee/ })) })
    const ref2 = await screen.findByTestId('ref2-email')
    await act(async () => { fireEvent.change(ref2, { target: { value: ' Remo.Zweiter@Example.CH ' } }) })

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm' })) })

    await waitFor(async () => {
      const row = await db.matches.get(matchId)
      expect(findOfficial(row.officials, '2nd referee').email).toBe('remo.zweiter@example.ch')
    })
    const row = await db.matches.get(matchId)
    expect(findOfficial(row.officials, '1st referee').email).toBe('rita@example.ch')
    expect(findOfficial(row.officials, 'scorer')).not.toHaveProperty('email')

    const jobs = (await db.sync_queue.toArray()).filter(j => j.resource === 'match' && j.payload?.officials)
    expect(jobs.length).toBeGreaterThan(0)
    const cloud = jobs.at(-1).payload
    expect(cloud.id).toBe(SEED)
    expect(findOfficial(cloud.officials, '1st referee')).toMatchObject({ first_name: 'Rita', email: 'rita@example.ch' })
    expect(findOfficial(cloud.officials, '2nd referee')).toMatchObject({ first_name: 'Remo', email: 'remo.zweiter@example.ch' })
  })
})
