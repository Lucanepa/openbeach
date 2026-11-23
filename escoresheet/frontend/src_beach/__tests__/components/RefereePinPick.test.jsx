import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// The referee page asks for the game first, then the PIN, and the PIN check
// names the game picked: the backend and the relay compare the PIN with that
// match only (OpenVolley audit round 3, SEC-06). Two listed games with the
// same game number stay two games. A stored PIN that the backend refuses
// to compare after a reload (429) is kept for the next load.

vi.hoisted(() => { globalThis.__APP_VERSION__ = 'test' })

const sync = vi.hoisted(() => ({
  listCloud: vi.fn(),
  checkCloud: vi.fn(),
  checkLan: vi.fn()
}))

vi.mock('../../utils_beach/serverDataSync_beach', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    listAvailableMatchesSupabase: (...a) => sync.listCloud(...a),
    listAvailableMatches: async () => ({ success: false, matches: [] }),
    validatePinSupabase: (...a) => sync.checkCloud(...a),
    validatePin: (...a) => sync.checkLan(...a),
    relayIsCloud: () => true
  }
})
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getRelayWebSocketUrl: () => null, isRelayOriginPage: () => false }
})
// The connected referee view is not what this test is about
vi.mock('../../components_beach/Referee_beach', () => ({
  default: ({ matchId }) => <div data-testid="referee-view">{String(matchId)}</div>
}))

import RefereeApp from '../../RefereeApp_beach'
import { db } from '../../db_beach/db_beach'

const rows = [
  { id: 'match_a', external_id: 'match_a', gameNumber: 12, team1Name: 'Rossi / Bianchi', team2Name: 'Meier / Huber', refereeConnectionEnabled: true },
  // the same game number at another venue
  { id: 'match_b', external_id: 'match_b', gameNumber: 12, team1Name: 'Keller / Graf', team2Name: 'Frei / Moser', refereeConnectionEnabled: true }
]

// setup.js makes localStorage a set of vi.fn: a real store for this page
const store = new Map()
beforeEach(() => {
  store.clear()
  localStorage.getItem.mockImplementation((k) => (store.has(k) ? store.get(k) : null))
  localStorage.setItem.mockImplementation((k, v) => { store.set(k, String(v)) })
  localStorage.removeItem.mockImplementation((k) => { store.delete(k) })
  sync.listCloud.mockResolvedValue({ success: true, matches: rows })
  sync.checkCloud.mockReset()
  sync.checkLan.mockReset()
  vi.spyOn(db.matches, 'count').mockResolvedValue(0)
})
afterEach(() => vi.restoreAllMocks())

describe('referee PIN screen', () => {
  it('shows the PIN only once a game is picked, and the check names that game', async () => {
    sync.checkCloud.mockImplementation(async (pin, type, opts) => ({
      success: true,
      match: { id: opts?.matchExternalId, sportType: 'beach', gameNumber: 12, refereeConnectionEnabled: true, status: 'live' }
    }))
    render(<RefereeApp />)
    const pick = await screen.findAllByRole('button', { name: /select game/i })
    expect(screen.queryByPlaceholderText('000000')).toBeNull()

    fireEvent.click(pick[0])
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByText(/Keller/))
    const pin = await screen.findByPlaceholderText('000000')
    fireEvent.change(pin, { target: { value: '482917' } })
    fireEvent.submit(pin.closest('form'))

    await waitFor(() => expect(sync.checkCloud).toHaveBeenCalled())
    expect(sync.checkCloud).toHaveBeenCalledWith('482917', 'referee', { matchExternalId: 'match_b' })
    expect(await screen.findByTestId('referee-view')).toHaveTextContent('match_b')
    expect(localStorage.getItem('refereeMatchId')).toBe('match_b')
  })

  it('keeps the stored PIN when its re-check is refused without comparing (429)', async () => {
    localStorage.setItem('refereeMatchId', 'match_a')
    localStorage.setItem('refereePin', '482917')
    sync.checkCloud.mockResolvedValue({ success: false, error: 'Too many failed attempts. Please wait 10 minutes before trying again.', status: 429 })
    render(<RefereeApp />)
    await waitFor(() => expect(sync.checkCloud).toHaveBeenCalledWith('482917', 'referee', { matchExternalId: 'match_a' }))
    expect(await screen.findByText(/Too many failed attempts/)).toBeInTheDocument()
    expect(localStorage.getItem('refereeMatchId')).toBe('match_a')
    expect(localStorage.getItem('refereePin')).toBe('482917')
  })
})
