import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beachBundle, MUELLER_WEBER_ID, ROSSI_ID } from '../fixtures/beachBundle'
import { teamKeys } from '../../utils_beach/savedTeams_beach'
import { accessFromRoles, NO_ACCESS } from '../../lib_beach/access_beach'

// MatchSetup_beach "Load saved team": the button only for approved accounts
// (a short note otherwise), the picker fills the pair, a roster with names is
// only replaced after a confirmation, and a typed team name suggests the saved
// team. The saved teams hook is mocked with rows of the shared fixture.

const h = vi.hoisted(() => ({ auth: null, teams: [], showAlert: null }))

vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => h.auth }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: h.showAlert }) }))
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
  // no draft of the previous test (MatchSetup auto-saves the setup)
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  h.showAlert = vi.fn()
  h.teams = rowsOf(beachBundle())
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

describe('MatchSetup_beach saved teams', () => {
  it('signed out: no button, a short sign-in note', async () => {
    h.auth = { user: null, profile: null, getCachedProfile: () => null, access: NO_ACCESS }
    await openTeam1View()
    expect(screen.queryByRole('button', { name: 'Load saved team' })).toBeNull()
    expect(screen.getByTestId('saved-teams-note').textContent).toBe('Sign in with an approved account to load saved teams.')
  })

  it('pending account: no button, a note that approval is needed', async () => {
    h.auth = { user: { id: 'u2' }, profile: { roles: [] }, getCachedProfile: () => null, access: { ...accessFromRoles([]), known: true } }
    await openTeam1View()
    expect(screen.queryByRole('button', { name: 'Load saved team' })).toBeNull()
    expect(screen.getByTestId('saved-teams-note').textContent).toMatch(/approved scorers/)
  })

  it('signed in, roles not known yet: no button and no approval note', async () => {
    // Profile still loading (or its fetch failed with no cached profile):
    // an approved scorer must not be told to ask for approval
    h.auth = { user: { id: 'u3' }, profile: null, getCachedProfile: () => null, access: { ...accessFromRoles([]), known: false } }
    await openTeam1View()
    expect(screen.queryByRole('button', { name: 'Load saved team' })).toBeNull()
    expect(screen.queryByTestId('saved-teams-note')).toBeNull()
  })

  it('a scorer loads a saved pair into the empty roster', async () => {
    await openTeam1View()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load saved team' })) })
    const rows = screen.getAllByTestId('saved-team-row')
    await act(async () => { fireEvent.click(rows.find(r => within(r).queryByText('Müller / Weber'))) })
    // no confirmation: the roster had no names
    expect(screen.queryByText('Replace the players?')).toBeNull()
    await waitFor(() => expect(screen.getByDisplayValue('Anna')).toBeInTheDocument())
    expect(screen.getByDisplayValue('Sara')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Müller / Weber')).toBeInTheDocument() // team name was empty
    expect(h.showAlert).toHaveBeenCalledWith('Müller / Weber loaded', 'success')
  })

  it('asks before replacing entered players, and Cancel keeps them', async () => {
    await openTeam1View()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load saved team' })) })
    await act(async () => { fireEvent.click(screen.getAllByTestId('saved-team-row').find(r => within(r).queryByText('Müller / Weber'))) })
    await waitFor(() => expect(screen.getByDisplayValue('Anna')).toBeInTheDocument())

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load saved team' })) })
    await act(async () => { fireEvent.click(screen.getAllByTestId('saved-team-row').find(r => within(r).queryByText('Rossi'))) })
    expect(screen.getByText('Replace the players?')).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel' })) })
    expect(screen.getByDisplayValue('Anna')).toBeInTheDocument()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load saved team' })) })
    await act(async () => { fireEvent.click(screen.getAllByTestId('saved-team-row').find(r => within(r).queryByText('Rossi'))) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Replace' })) })
    await waitFor(() => expect(screen.getByDisplayValue('Lia')).toBeInTheDocument())
    expect(screen.queryByDisplayValue('Anna')).toBeNull()
    // one saved player: the scorer is told to add the second one
    expect(h.showAlert).toHaveBeenCalledWith(expect.stringMatching(/^Rossi has fewer than two saved players/), 'info')
  })

  it('a typed team name suggests the saved team; loading it fills the roster', async () => {
    await openTeam1View()
    expect(screen.queryByTestId('saved-team-suggestion-team1')).toBeNull()
    const nameInput = screen.getAllByRole('textbox')[0]
    await act(async () => { fireEvent.change(nameInput, { target: { value: 'Weber / Müller' } }) })
    const strip = await screen.findByTestId('saved-team-suggestion-team1')
    expect(strip.textContent).toContain('Team 1: Müller / Weber')
    await act(async () => { fireEvent.click(within(strip).getByRole('button', { name: 'Load team 1' })) })
    await waitFor(() => expect(screen.getByDisplayValue('Anna')).toBeInTheDocument())
    expect(screen.queryByTestId('saved-team-suggestion-team1')).toBeNull()
    // the typed name is kept
    expect(screen.getByDisplayValue('Weber / Müller')).toBeInTheDocument()
  })

  it('"Not now" hides the suggestion', async () => {
    await openTeam1View()
    await act(async () => { fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'Rossi' } }) })
    const strip = await screen.findByTestId('saved-team-suggestion-team1')
    await act(async () => { fireEvent.click(within(strip).getByRole('button', { name: 'Not now' })) })
    expect(screen.queryByTestId('saved-team-suggestion-team1')).toBeNull()
    expect(screen.queryByDisplayValue('Lia')).toBeNull()
  })

  it('ids of the fixture are the ones offered', () => {
    expect(h.teams.map(t => t.id)).toEqual([MUELLER_WEBER_ID, ROSSI_ID])
  })
})

describe('MatchSetup_beach auto-save and the game PIN', () => {
  // The auto-save wrote gamePin: null for a test match, so the PIN it got when
  // it was created (it guards the match's relay room) was gone half a second
  // after the setup opened, and each later sync made a new one.
  async function autoSaved(match) {
    const matchId = await db.matches.add({ status: 'scheduled', gameNumber: '1', court: '1', createdAt: new Date().toISOString(), ...match })
    render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
    await screen.findAllByRole('button', { name: 'Edit roster' })
    // let the debounced (500 ms) auto-save run
    await act(async () => { await new Promise(r => setTimeout(r, 900)) })
    return db.matches.get(matchId)
  }

  it('a test match keeps its game PIN', async () => {
    const saved = await autoSaved({ test: true, seedKey: 'test-match-default-abc', gamePin: '482913' })
    expect(saved.gamePin).toBe('482913')
  })

  it('an official match keeps its game PIN', async () => {
    const saved = await autoSaved({ test: false, gamePin: '102938' })
    expect(saved.gamePin).toBe('102938')
  })

  it('a match without one gets a 6-digit game PIN', async () => {
    const saved = await autoSaved({ test: true, seedKey: 'test-match-default-def', gamePin: null })
    expect(saved.gamePin).toMatch(/^\d{6}$/)
  })
})
