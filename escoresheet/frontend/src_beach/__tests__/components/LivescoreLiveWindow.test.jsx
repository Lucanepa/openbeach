import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'

// The beach livescore and the scoreboard's Remote picker read every beach
// row of match_live_state, and a match's row stays after it ends: later in
// the season the header said "156 games live" for 6 matches of the day
// (75 finished on earlier days, 75 abandoned), and the picker listed all
// 150 old matches (stress test 2026-10-25). Both now ask for the rows of
// the last day, and only the games not finished count as live (as indoor).

const DAY = 24 * 60 * 60 * 1000
const db = vi.hoisted(() => ({ rows: [], queries: [] }))
vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  relayLivescoreNow: () => false
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true
}))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))
// The backend's /api/db: its eq and gte filters on the rows
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  apiFrom: (table) => {
    const filters = []
    db.queries.push({ table, filters })
    const q = {
      select: () => q,
      order: () => q,
      eq: (col, val) => { filters.push(['eq', col, val]); return q },
      gte: (col, val) => { filters.push(['gte', col, val]); return q },
      then: (res, rej) => Promise.resolve({
        data: db.rows.filter(r => filters.every(([op, col, val]) => (op === 'eq' ? r[col] === val : r[col] >= val))),
        error: null
      }).then(res, rej)
    }
    return q
  }
}))

import '../../i18n_beach'
const { default: LivescoreApp } = await import('../../LivescoreApp_beach')
const { default: ScoreboardApp } = await import('../../ScoreboardApp_beach')

const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString()
const game = (i, status, msAgo) => ({
  match_id: `m-${status}-${i}-${msAgo}`, sport_type: 'beach', match_status: status, current_set: 1,
  team_a_name: `${status} ${i} ${Math.round(msAgo / DAY)}d A`, team_b_name: `${status} ${i} ${Math.round(msAgo / DAY)}d B`,
  points_a: 3, points_b: 2, sets_won_a: 0, sets_won_b: 0, side_a: 'left', serving_team: 'left',
  updated_at: iso(msAgo), matches: { set_results: [] }
})

beforeEach(() => {
  cleanup()
  db.queries.length = 0
  db.rows = [
    // today: 3 being played, 2 finished
    game(1, 'live', 60000), game(2, 'live', 120000), game(3, 'interval', 180000),
    game(4, 'ended', 3600000), game(5, 'ended', 7200000),
    // earlier days: finished, and abandoned (never ended on the scorer)
    ...Array.from({ length: 5 }, (_, i) => game(10 + i, 'ended', (3 + i) * DAY)),
    ...Array.from({ length: 5 }, (_, i) => game(20 + i, 'live', (10 + i) * DAY))
  ]
})

describe('beach livescore: the games of the last day', () => {
  it('lists today\'s 5 games and says 3 games live', async () => {
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getByText('3 games live')).toBeInTheDocument())
    const liveQuery = db.queries.find(q => q.table === 'match_live_state')
    const since = liveQuery.filters.find(([op, col]) => op === 'gte' && col === 'updated_at')
    expect(since).toBeTruthy()
    expect(Math.abs(Date.parse(since[2]) - (Date.now() - DAY))).toBeLessThan(60000)
    expect(document.body.textContent).toContain('live 1 0d A')
    expect(document.body.textContent).not.toContain('3d A')
    expect(document.body.textContent).not.toContain('10d A')
  })
})

describe('beach scoreboard Remote picker: the games of the last day', () => {
  it('lists today\'s games only', async () => {
    window.history.replaceState(null, '', '/scoreboard_beach.html')
    render(<ScoreboardApp />)
    fireEvent.click(await screen.findByText('Remote'))
    await waitFor(() => expect(document.body.textContent).toContain('live 1 0d A'))
    expect(document.body.textContent).not.toContain('3d A')
    expect(document.body.textContent).not.toContain('10d A')
  })
})
