import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import '../../i18n'
import { beachBundle, MUELLER_WEBER_ID, ROSSI_ID, COOP_ID, OLD_TOUR_ID } from '../fixtures/beachBundle'

const hook = vi.hoisted(() => ({ value: null, args: null }))
vi.mock('../../hooks_beach/useSavedTeams_beach', () => ({
  useSavedTeams: (args) => { hook.args = args; return hook.value }
}))
vi.mock('../../lib_beach/apiClient_beach', () => ({ savedTeamsApi: { fetchBundle: vi.fn() } }))

import SavedTeamPickerModal, { formatFetchedAt } from '../../components_beach/SavedTeamPickerModal_beach'
import { bundleToRows, competitionsOf, bundleCompetitions } from '../../db_beach/savedTeams_beach'
import { accessFromRoles } from '../../lib_beach/access_beach'

function fixtureState({ loading = false } = {}) {
  const b = beachBundle()
  // a team of the archived competition must not be offered
  b.teams.push({
    id: 'archived-team', competition_id: OLD_TOUR_ID, name: 'Archiv / Team', updated_at: '2025-06-01T00:00:00Z',
    players: [{ id: 'x1', number: 1, first_name: 'A', last_name: 'Archiv', country: 'CHE' }, { id: 'x2', number: 2, first_name: 'B', last_name: 'Team', country: 'CHE' }],
    staff: []
  })
  // and a second open competition to filter by
  b.competitions.push({ id: 'c-men', name: 'Swiss Beach Men', season: '2026', gender: 'men', archived: false, sport: 'beach', vm_leagues: [] })
  b.teams.push({ id: 'men-team', competition_id: 'c-men', name: 'Keller / Huber', club: 'BC Bern', updated_at: '2026-08-01T00:00:00Z',
    players: [{ id: 'm1', number: 1, first_name: 'Tim', last_name: 'Keller' }, { id: 'm2', number: 2, first_name: 'Leo', last_name: 'Huber' }], staff: [] })
  const teams = bundleToRows(b)
  const meta = { key: 'bundle', userId: 'u1', fetchedAt: '2026-10-06T08:00:05.000Z', competitions: bundleCompetitions(b) }
  return { teams, competitions: competitionsOf(teams, meta), meta, loading, lastStatus: 'refreshed', refresh: vi.fn(), reload: vi.fn() }
}

const scorer = accessFromRoles(['scorer'])
const rows = () => screen.queryAllByTestId('saved-team-row')
const names = () => rows().map(r => within(r).getAllByText(/./)[0].textContent)

let onLine
beforeEach(() => {
  hook.value = fixtureState()
  onLine = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onLine })
})
afterEach(() => {
  delete window.navigator.onLine
})

function renderPicker(props = {}) {
  const onPick = vi.fn()
  const onClose = vi.fn()
  render(<SavedTeamPickerModal open onClose={onClose} onPick={onPick} userId="u1" access={scorer} side="team1" {...props} />)
  return { onPick, onClose }
}

describe('SavedTeamPickerModal_beach', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SavedTeamPickerModal open={false} onClose={() => {}} onPick={() => {}} userId="u1" access={scorer} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists the non-archived teams with players, club, competition, coach and player count', () => {
    renderPicker()
    expect(hook.args).toMatchObject({ userId: 'u1', access: scorer, refreshOnMount: true })
    expect(screen.getByText('Load saved team')).toBeInTheDocument()
    expect(names()).toEqual(['Keller / Huber', 'Müller / Weber', 'Rossi'])
    const mw = rows()[1]
    expect(within(mw).getByText('Müller / Weber · BC Zürich · Coop Beachtour')).toBeInTheDocument()
    expect(within(mw).getByText('Coach: Eva Kunz')).toBeInTheDocument()
    expect(within(mw).getByText('2/2 players')).toBeInTheDocument()
    expect(within(rows()[2]).getByText('1/2 players')).toBeInTheDocument()
    expect(screen.queryByText('Archiv / Team')).toBeNull()
  })

  it('filters by competition (archived ones are not offered)', () => {
    renderPicker()
    const select = screen.getByLabelText('Competition')
    const options = within(select).getAllByRole('option').map(o => o.value)
    expect(options).toEqual(['', COOP_ID, 'c-men'])
    fireEvent.change(select, { target: { value: COOP_ID } })
    expect(names()).toEqual(['Müller / Weber', 'Rossi'])
    fireEvent.change(select, { target: { value: 'c-men' } })
    expect(names()).toEqual(['Keller / Huber'])
  })

  it('searches by player last name, team name or club', () => {
    renderPicker()
    const search = screen.getByLabelText('Search teams or players')
    fireEvent.change(search, { target: { value: 'weber' } })
    expect(names()).toEqual(['Müller / Weber'])
    fireEvent.change(search, { target: { value: 'bc bern' } })
    expect(names()).toEqual(['Keller / Huber'])
    fireEvent.change(search, { target: { value: 'nobody' } })
    expect(rows()).toHaveLength(0)
    expect(screen.getByText(/No saved beach teams yet/)).toBeInTheDocument()
  })

  it('picking a row hands the cache row to onPick', () => {
    const { onPick } = renderPicker()
    fireEvent.click(rows()[1])
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: MUELLER_WEBER_ID, name: 'Müller / Weber' })
    fireEvent.click(rows()[2])
    expect(onPick.mock.calls[1][0].id).toBe(ROSSI_ID)
  })

  it('offline it shows the date of the cached teams', () => {
    onLine = false
    renderPicker()
    const notice = screen.getByTestId('saved-teams-offline')
    expect(notice.textContent).toBe(`Offline – showing saved teams from ${formatFetchedAt('2026-10-06T08:00:05.000Z')}.`)
    expect(formatFetchedAt('2026-10-06T08:00:05.000Z')).toMatch(/^06\.10\.2026 \d{2}:\d{2}$/)
    expect(names()).toHaveLength(3)
  })

  it('online there is no offline notice', () => {
    renderPicker()
    expect(screen.queryByTestId('saved-teams-offline')).toBeNull()
  })

  it('shows placeholder rows while the first load runs, and the empty text without teams', () => {
    hook.value = { ...fixtureState(), teams: [], competitions: [], loading: true }
    const { unmount } = render(<SavedTeamPickerModal open onClose={() => {}} onPick={() => {}} userId="u1" access={scorer} />)
    expect(screen.getAllByText('…')).toHaveLength(3)
    unmount()
    hook.value = { ...fixtureState(), teams: [], competitions: [], loading: false }
    renderPicker()
    expect(screen.getByText(/No saved beach teams yet/)).toBeInTheDocument()
  })
})
