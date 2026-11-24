import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// The court display's Remote picker read its list of games once, as it
// opened. Behind a venue IP over its read limit the read got 429, the list
// stayed empty and nothing read it again: a scoreboard opened in the middle
// of fast scoring showed no game for good (stress test 2026-10-25, 2/2 runs).
// It now reads it again until it gets it.

const DAY = 24 * 60 * 60 * 1000
const db = vi.hoisted(() => ({ rows: [], queries: [], refuse: 0 }))
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
      then: (res, rej) => (db.refuse > 0 && db.refuse--
        ? Promise.resolve({ data: null, error: { message: 'Too many requests', status: 429 } })
        : Promise.resolve({
        data: db.rows.filter(r => filters.every(([op, col, val]) => (op === 'eq' ? r[col] === val : r[col] >= val))),
        error: null
      })).then(res, rej)
    }
    return q
  }
}))

import '../../i18n_beach'
const { default: ScoreboardApp } = await import('../../ScoreboardApp_beach')

describe('beach scoreboard Remote picker: a refused read of its list', () => {
  it('is read again, and the game shows', async () => {
    db.rows = [{
      match_id: 'm-1', sport_type: 'beach', match_status: 'live', current_set: 1,
      team_a_name: 'Müller / Weber', team_b_name: 'Schmidt / Fischer',
      points_a: 3, points_b: 2, sets_won_a: 0, sets_won_b: 0, side_a: 'left', serving_team: 'left',
      updated_at: new Date().toISOString(), matches: { set_results: [] }
    }]
    db.refuse = 2
    window.history.replaceState(null, '', '/scoreboard_beach.html')
    render(<ScoreboardApp />)
    fireEvent.click(await screen.findByText('Remote'))
    await waitFor(() => expect(document.body.textContent).toContain('Müller / Weber'), { timeout: 15000 })
    expect(db.queries.filter(q => q.table === 'match_live_state').length).toBe(3)
  }, 30000)
})
