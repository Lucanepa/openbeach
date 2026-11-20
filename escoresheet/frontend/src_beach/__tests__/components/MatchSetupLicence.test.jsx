import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beachBundle, MUELLER_WEBER_ID } from '../fixtures/beachBundle'
import { teamKeys } from '../../utils_beach/savedTeams_beach'
import { accessFromRoles } from '../../lib_beach/access_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// MatchSetup_beach with the licence column on (Options > Licence numbers,
// owner 19.11.2026): beside each player a text field for the licence, or a
// date of birth typed with dots; "Load saved team" fills the saved licence,
// never a date of birth.

const h = vi.hoisted(() => ({ auth: null, teams: [] }))

vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => h.auth }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../hooks_beach/useSavedTeams_beach', () => ({
  useSavedTeams: ({ enabled }) => ({
    teams: enabled === false ? [] : h.teams, competitions: [], meta: null, loading: false, lastStatus: null,
    refresh: async () => {}, reload: async () => {}
  })
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true,
  getBackendUrl: () => 'http://backend.test',
  getApiUrl: () => null
}))

function rowsOf(bundle) {
  const comps = new Map(bundle.competitions.map(c => [c.id, { id: c.id, name: c.name, season: c.season, gender: c.gender, archived: c.archived, sport: 'beach' }]))
  return bundle.teams.map(t => ({
    id: t.id, competitionId: t.competition_id, competition: comps.get(t.competition_id), name: t.name,
    shortName: t.short_name || '', club: t.club || '', color: t.color || '', ...teamKeys(t),
    players: t.players, staff: t.staff, updatedAt: t.updated_at
  }))
}

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

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  const store = useMemoryLocalStorage()
  store.set('manageDob', 'true')
  const bundle = beachBundle()
  const mw = bundle.teams.find(t => t.id === MUELLER_WEBER_ID)
  mw.players[0].license_number = '100101'
  h.teams = rowsOf(bundle)
  h.auth = {
    user: { id: 'u1' }, profile: { roles: ['scorer'] }, getCachedProfile: () => null,
    access: { ...accessFromRoles(['scorer']), known: true }
  }
})

async function openTeam1View() {
  render(<MatchSetup onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
  const edit = await screen.findAllByRole('button', { name: 'Edit roster' })
  await act(async () => { fireEvent.click(edit[0]) })
  await screen.findByText('Roster')
}

describe('MatchSetup_beach licence column', () => {
  it('a "Licence" heading and a text field per player, with the full keyboard', async () => {
    await openTeam1View()
    expect(screen.getAllByText('Licence').length).toBeGreaterThan(0)
    expect(screen.queryByText('Date of birth')).toBeNull()
    const field = screen.getByTestId('team1-licence-0')
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('inputmode', 'text')
    expect(field).toHaveAttribute('placeholder', 'Licence or dd.mm.yyyy')
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })

  it('takes a licence and a date of birth typed with dots', async () => {
    await openTeam1View()
    const lic = screen.getByTestId('team1-licence-0')
    fireEvent.focus(lic)
    await act(async () => { fireEvent.change(lic, { target: { value: '123456' } }) })
    await act(async () => { fireEvent.blur(lic) })
    const date = screen.getByTestId('team1-licence-1')
    fireEvent.focus(date)
    await act(async () => { fireEvent.change(date, { target: { value: '14.3.2008' } }) })
    await act(async () => { fireEvent.blur(date) })
    expect(screen.getByTestId('team1-licence-0')).toHaveValue('123456')
    expect(screen.getByTestId('team1-licence-1')).toHaveValue('14.03.2008')
  })

  it('a saved team fills the saved licence, never its date of birth', async () => {
    await openTeam1View()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load saved team' })) })
    await act(async () => { fireEvent.click(screen.getAllByTestId('saved-team-row').find(r => within(r).queryByText('Müller / Weber'))) })
    await waitFor(() => expect(screen.getByDisplayValue('Anna')).toBeInTheDocument())
    expect(screen.getByTestId('team1-licence-0')).toHaveValue('100101')
    expect(screen.getByTestId('team1-licence-1')).toHaveValue('')
    expect(screen.queryByDisplayValue(/1998|1997/)).toBeNull()
  })
})

// Owner 20.11.2026: "Licence numbers" is on by default. A device that never
// touched the switch shows the column; a scorer who turned it off keeps it off.
describe('MatchSetup_beach licence column by default', () => {
  it('no stored choice (a new install): the Licence column shows', async () => {
    useMemoryLocalStorage()
    await openTeam1View()
    expect(screen.getAllByText('Licence').length).toBeGreaterThan(0)
    expect(screen.getByTestId('team1-licence-0')).toBeInTheDocument()
  })

  it('the switch turned off: no Licence column', async () => {
    const store = useMemoryLocalStorage()
    store.set('manageDob', 'false')
    await openTeam1View()
    expect(screen.queryByTestId('team1-licence-0')).toBeNull()
    expect(screen.queryByText('Licence')).toBeNull()
  })
})
