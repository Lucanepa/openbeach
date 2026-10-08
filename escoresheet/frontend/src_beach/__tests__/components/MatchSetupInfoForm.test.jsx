import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { accessFromRoles } from '../../lib_beach/access_beach'
import { getToastsSnapshot, toast } from '../../ui/volleyui/uiStore.js'
import { dateTextToIso, isPastMatchDate, defaultMatchDateTime } from '../../utils_beach/matchInfoForm_beach'

// The OpenBeach screencast of 2026-10-08 (match setup, signed out):
// - "12.3.2025" was refused ("Invalid format"), date and time empty, no
//   warning for last year's date, placeholders shown as "Enter The Site"
//   (CSS capitalize), the Round / Gender selects opened as a dark GTK list;
// - "Create match" showed "Match created! Syncing to database..." for 10 s,
//   then a "saved locally (sync pending)" box to click away.

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
// A healthy cloud with an empty queue ('synced'): only the missing session
// may stop the wait
vi.mock('../../hooks_beach/useSyncQueue_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  getSyncStatus: () => 'synced'
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

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  toast.clear()
  // signed out: no stored session
  window.localStorage.getItem.mockImplementation(() => null)
  h.auth = { user: null, profile: null, getCachedProfile: () => null, access: { ...accessFromRoles([]), known: false } }
})

async function openInfo() {
  const matchId = await db.matches.add({ status: 'setup', seed_key: 'match_seed_vr', test: false, createdAt: new Date().toISOString() })
  render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
  const create = await screen.findByRole('button', { name: 'Create match' })
  await act(async () => { fireEvent.click(create) })
  await screen.findByText('Match info')
}

describe('match info form helpers', () => {
  it('reads "12.3.2025" and an ISO date, and spots a past date', () => {
    expect(dateTextToIso('12.3.2025')).toBe('2025-03-12')
    expect(dateTextToIso('12.03.2025')).toBe('2025-03-12')
    expect(dateTextToIso('12.3.')).toBe('')
    expect(isPastMatchDate('12.03.2025', '2026-10-08')).toBe(true)
    expect(isPastMatchDate('08.10.2026', '2026-10-08')).toBe(false)
    expect(isPastMatchDate('', '2026-10-08')).toBe(false)
  })

  it('a new match starts today, now (rounded down to 5 minutes, Zürich)', () => {
    const d = defaultMatchDateTime(new Date('2026-10-08T09:37:30Z'))
    expect(d).toEqual({ date: '08.10.2026', time: '11:35' })
  })
})

describe('MatchSetup_beach match info', () => {
  it('prefills date and time, keeps what is typed, no native selects', async () => {
    await openInfo()
    const date = screen.getByTestId('match-info-date')
    const time = screen.getByTestId('match-info-time')
    const today = defaultMatchDateTime()
    expect(date.value).toBe(today.date)
    expect(time.value).toMatch(/^\d{2}:\d{2}$/)
    // placeholders and values as typed: no CSS capitalize
    const site = screen.getByPlaceholderText('Enter the site')
    expect(site.className).not.toMatch(/capitalize/)
    expect(screen.getByPlaceholderText('Enter the competition').className).not.toMatch(/capitalize/)
    // no native <select> (WebKitGTK opens it as a dark list)
    expect(document.querySelector('select')).toBeNull()
    expect(screen.getByRole('radiogroup', { name: 'Gender' })).toBeInTheDocument()
    // "12.3.2025" is a date, last year's: a warning, not "Invalid format"
    await act(async () => { fireEvent.change(date, { target: { value: '12.3.2025' } }) })
    expect(screen.queryByText('Invalid format')).toBeNull()
    expect(screen.getByText('This date is in the past.')).toBeInTheDocument()
  })

  it('signed out, "Create match" saves at once: a toast, no "Syncing" box', async () => {
    await openInfo()
    const gameN = screen.getByPlaceholderText('e.g. M01')
    await act(async () => { fireEvent.change(gameN, { target: { value: '12' } }) })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Enter the competition'), { target: { value: 'Coop Beachtour' } }) })
    await act(async () => { fireEvent.change(screen.getByPlaceholderText('Enter the site'), { target: { value: 'Zürich' } }) })
    const confirm = screen.getAllByRole('button', { name: 'Create match' }).at(-1)
    await waitFor(() => expect(confirm).not.toBeDisabled())
    await act(async () => { fireEvent.click(confirm) })
    await waitFor(() => expect(getToastsSnapshot().length).toBeGreaterThan(0))
    expect(getToastsSnapshot().at(-1).message).toBe('Saved on this device. Sign in to sync it to the cloud.')
    expect(screen.queryByText(/Syncing to database/)).toBeNull()
    expect(screen.queryByText(/sync pending/)).toBeNull()
  })
})

describe('MatchSetup_beach test roster (team 2)', () => {
  it('loads the name and the country it names, and closes its dialog', async () => {
    const matchId = await db.matches.add({ status: 'setup', seed_key: 'match_seed_vr2', test: false, createdAt: new Date().toISOString() })
    render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
    const edit = await screen.findAllByRole('button', { name: 'Edit roster' })
    await act(async () => { fireEvent.click(edit[1]) })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Load test roster' })) })
    // the dialog names the team without nested parentheses
    expect(screen.getByText(/\(Schmidt \/ Fischer\)/)).toBeInTheDocument()
    const load = screen.getAllByRole('button', { name: 'Load test roster' }).at(-1)
    await act(async () => { fireEvent.click(load) })
    await waitFor(() => expect(screen.queryByText('Load the test roster?')).toBeNull())
    expect(screen.getByDisplayValue('Schmidt / Fischer')).toBeInTheDocument()
    expect(screen.getAllByText('DEU').length).toBeGreaterThan(0)
  })
})

describe('MatchSetup_beach main view layout', () => {
  it('match info in six rows; the disabled Coin toss button stays readable and says why', async () => {
    const matchId = await db.matches.add({ status: 'setup', seed_key: 'match_seed_vr3', test: false, createdAt: new Date().toISOString() })
    render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
    const heading = await screen.findByRole('heading', { name: 'Match info' })
    const card = heading.closest('div.flex.flex-col')
    expect(card.querySelectorAll('dt').length).toBe(6)
    const coinToss = screen.getByTestId('setup-coin-toss')
    expect(coinToss).toBeDisabled()
    expect(coinToss.className).toMatch(/disabled:text-stone-600/)
    expect(coinToss.getAttribute('title')).toMatch(/first/)
  })
})

describe('MatchSetup_beach roster editor', () => {
  it('the team name reads as a title, the captain column says "Captain", the sign-in note is readable', async () => {
    const matchId = await db.matches.add({ status: 'setup', seed_key: 'match_seed_vr4', test: false, createdAt: new Date().toISOString() })
    render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
    const edit = await screen.findAllByRole('button', { name: 'Edit roster' })
    await act(async () => { fireEvent.click(edit[0]) })
    const title = await screen.findByTestId('roster-team-name')
    expect(title.className).toMatch(/border-transparent/)
    expect(title.className).toMatch(/bg-transparent/)
    expect(screen.getByTestId('roster-captain-header').textContent).toBe('Captain')
    expect(screen.getByTestId('saved-teams-note').className).toMatch(/text-sm/)
  })
})
