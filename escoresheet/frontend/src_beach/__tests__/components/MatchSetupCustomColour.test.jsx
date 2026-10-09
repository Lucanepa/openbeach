import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { accessFromRoles } from '../../lib_beach/access_beach'
import { readableTextOn } from '../../utils_beach/teamColours_beach'

// MatchSetup_beach "Choose the colour of Team 1": the Custom tile's hex is
// saved on the team and the match, and the team's shirt and number are
// drawn with it; a saved colour that is none of the twelve presets selects
// the Custom tile; two close colours get a gentle note on the cards.

const h = vi.hoisted(() => ({ auth: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => h.auth }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../hooks_beach/useSavedTeams_beach', () => ({
  useSavedTeams: () => ({ teams: [], competitions: [], meta: null, loading: false, lastStatus: null, refresh: async () => {}, reload: async () => {} })
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => false,
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
beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  try { localStorage.clear() } catch { /* none */ }
  h.auth = { user: null, profile: null, getCachedProfile: () => null, access: { ...accessFromRoles([]), known: true } }
})

const rgb = (hex) => `rgb(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)})`
const shirtsOf = (colour) => [...document.querySelectorAll('.shirt')].filter((el) => el.dataset.color === colour)

async function openSetup(team1Color, team2Color = '#3b82f6') {
  const team1Id = await db.teams.add({ name: 'Muster / Meier', color: team1Color, createdAt: new Date().toISOString() })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi', color: team2Color, createdAt: new Date().toISOString() })
  const matchId = await db.matches.add({ status: 'scheduled', test: true, gameNumber: '1', court: '1', team1Id, team2Id, createdAt: new Date().toISOString() })
  render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
  await screen.findAllByRole('button', { name: 'Edit roster' })
  await waitFor(() => expect(shirtsOf(team1Color.toLowerCase()).length).toBeGreaterThan(0))
  return { matchId, team1Id }
}

describe('MatchSetup_beach custom team colour', () => {
  it('picking a custom hex saves it and the card shirt and number render with it', async () => {
    const { matchId, team1Id } = await openSetup('#dc2626')
    await act(async () => { fireEvent.click(shirtsOf('#dc2626')[0]) })
    const dialog = await screen.findByRole('dialog')
    await act(async () => { fireEvent.click(dialog.querySelector('[data-custom-tile]')) })
    expect(screen.getByLabelText('Custom colour', { selector: 'input[type="color"]' })).toBeInTheDocument()
    await act(async () => { fireEvent.change(screen.getByLabelText('Hex code'), { target: { value: '#0E7490' } }) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })) })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(async () => expect((await db.teams.get(team1Id)).color).toBe('#0e7490'))
    expect((await db.matches.get(matchId)).team1Color).toBe('#0e7490')
    const shirt = shirtsOf('#0e7490')[0]
    expect(shirt).toBeTruthy()
    expect(shirt.querySelector('[data-part="body"]').getAttribute('fill')).toBe('#0e7490')
    expect(shirt.querySelector('.number').style.color).toBe(rgb(readableTextOn('#0e7490')))
    expect(shirtsOf('#dc2626')).toHaveLength(0)
  })

  it('a saved colour that is none of the presets selects the Custom tile, showing it', async () => {
    await openSetup('#7b1e2b')
    await act(async () => { fireEvent.click(shirtsOf('#7b1e2b')[0]) })
    const dialog = await screen.findByRole('dialog')
    const custom = dialog.querySelector('[data-custom-tile]')
    expect(custom.getAttribute('aria-pressed')).toBe('true')
    expect(custom.getAttribute('aria-label')).toBe('Custom colour #7b1e2b')
    expect(custom.querySelector('.shirt').dataset.color).toBe('#7b1e2b')
    expect(dialog.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1)
  })

  it('two close team colours get the gentle note on the setup cards', async () => {
    await openSetup('#dc2626', '#e2001a')
    expect((await screen.findAllByText("Close to the other team's colour")).length).toBeGreaterThan(0)
  })
})
