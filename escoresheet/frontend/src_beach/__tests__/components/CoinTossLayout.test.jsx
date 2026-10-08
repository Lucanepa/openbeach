// CoinToss_beach in the OpenBeach screencast of 2026-10-08: full window
// width, the two switch keys apart from each other, no Serve / Receive
// words (team B's column was empty), the Scoresheet menu opening over
// "Confirm the coin toss", and the winner's choice (rule 7.1.2) not kept.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../components_beach/SignaturePad_beach', () => ({ default: () => null }))

// A test match draws placeholder signatures on a canvas (none in jsdom)
HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: (_t, k) => (k === 'measureText' ? () => ({ width: 10 }) : () => {}), set: () => true })
HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,TEST'

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
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  const team1Id = await db.teams.add({ name: 'Müller / Weber', color: '#000000' })
  const team2Id = await db.teams.add({ name: 'Schmidt / Fischer', color: '#eab308' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team1Id, number: 2, firstName: 'Sara', lastName: 'Weber' },
    { teamId: team2Id, number: 1, firstName: 'Julia', lastName: 'Schmidt', isCaptain: true },
    { teamId: team2Id, number: 2, firstName: 'Nina', lastName: 'Fischer' }
  ])
  matchId = await db.matches.add({ team1Id, team2Id, team1Country: 'CHE', team2Country: 'CHE', status: 'scheduled', seed_key: 'seed-ct', test: true })
})

describe('CoinToss_beach layout', () => {
  it('a centred card; both switch keys one width, top-aligned; Serve and Receive named', async () => {
    const { container } = render(<CoinToss matchId={matchId} onConfirm={() => {}} onBack={() => {}} />)
    await screen.findByRole('button', { name: /Switch serve/ })
    expect(container.firstChild.className).toMatch(/max-w-\[1200px\]/)
    const switches = screen.getByTestId('coin-toss-switches')
    expect(switches.className).toMatch(/sm:justify-start/)
    expect(switches.className).not.toMatch(/(^|\s)self-stretch/)
    const keys = [screen.getByRole('button', { name: /Switch teams/ }), screen.getByRole('button', { name: /Switch serve/ })]
    for (const k of keys) expect(k.className).toMatch(/\bw-48\b/)
    expect(screen.getByTestId('coin-toss-serve-A').textContent).toBe('Serve')
    expect(screen.getByTestId('coin-toss-serve-B').textContent).toBe('Receive')
    // the team names carry no country (it is the flag next to them)
    expect(screen.queryByText(/\(CHE\)/)).toBeNull()
  })

  it('the Scoresheet menu opens upward, away from Confirm', async () => {
    render(<CoinToss matchId={matchId} onConfirm={() => {}} onBack={() => {}} />)
    const menuButton = await screen.findByRole('button', { name: /Scoresheet/ })
    await act(async () => { fireEvent.click(menuButton) })
    const menu = await screen.findByRole('menu')
    await waitFor(() => expect(menu.style.bottom).not.toBe(''))
    expect(menu.style.top).toBe('auto')
  })

  it('records what the winner chose (serve or side) with the coin toss', async () => {
    const onConfirm = vi.fn()
    render(<CoinToss matchId={matchId} onConfirm={onConfirm} onBack={() => {}} />)
    const choice = await screen.findByRole('radiogroup', { name: 'The winner chose' })
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: 'Court side' })) })
    expect(choice).toBeInTheDocument()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Confirm the coin toss' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).coinTossChoice).toBe('side'))
    const ev = (await db.events.toArray()).find(e => e.type === 'coin_toss')
    expect(ev.payload.coinTossChoice).toBe('side')
    // the coin toss runs on after its writes (signatures, the sync and
    // scoresheet steps) until it hands over to the scoreboard: a test that
    // ended before had its setState land after the page was torn down
    // ("window is not defined", a failed full-suite run)
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(matchId), { timeout: 10000 })
  }, 30000)
})
