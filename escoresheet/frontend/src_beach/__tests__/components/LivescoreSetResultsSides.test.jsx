import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// The livescore's FINAL set chips put each set's points under the team on
// that side. The sides come from side_a (Team A's side), the set results are
// stored by team1 / team2 (matches.set_results [{ set, team1, team2 }]); the
// chips took team1's points for Team A, so when Team A was team2 every chip
// was reversed (the winner's 21 under the loser's name). Team A is known from
// the finished match itself: its sets_won_a are team1's or team2's wins.

const rows = vi.hoisted(() => ({ list: [] }))
vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    relayLivescoreNow: () => true,
    createRelayLivescoreFeed: (opts) => ({
      start: () => { opts.onList({ ok: true }); opts.onChange(rows.list) },
      stop: vi.fn(),
      refresh: vi.fn(async () => ({ ok: true }))
    })
  }
})
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: () => { throw new Error('no cloud') } }))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))

const { default: LivescoreApp } = await import('../../LivescoreApp_beach')

// team2 won 21:15, 21:18
const RESULTS = [{ set: 1, team1: 15, team2: 21 }, { set: 2, team1: 18, team2: 21 }]
const ended = (over) => ({
  match_id: 'seed-1', sport_type: 'beach', match_status: 'ended', current_set: 2, test: false,
  points_a: 0, points_b: 0, matches: { set_results: RESULTS }, ...over
})

describe('livescore FINAL chips: each set\'s points under the side\'s team', () => {
  it('Team A is team2 (it won 2:0), on the left: 21–15, 21–18', async () => {
    rows.list = [ended({ team_a_name: 'Schmidt/Fischer', team_b_name: 'Müller/Weber', sets_won_a: 2, sets_won_b: 0, side_a: 'left' })]
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getByText('Schmidt/Fischer')).toBeInTheDocument())
    expect(screen.getByText('21–15')).toBeInTheDocument()
    expect(screen.getByText('21–18')).toBeInTheDocument()
    expect(screen.queryByText('15–21')).toBeNull()
  })

  it('results of an older set end (the relay\'s sets behind its live state): no team told from them', async () => {
    // Team A is team1, on the left, lost 1:2; the results still have set 1
    // only (team2 won it 21:15): A's 1 set is team2's 1 win in them, which
    // told Team A is team2 and put team2's 21 under team1's name
    rows.list = [ended({ team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', sets_won_a: 1, sets_won_b: 2, side_a: 'left', matches: { set_results: [{ set: 1, team1: 15, team2: 21 }] } })]
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getByText('Müller/Weber')).toBeInTheDocument())
    expect(screen.getByText('15–21')).toBeInTheDocument()
    expect(screen.queryByText('21–15')).toBeNull()
  })

  it('Team A is team1 (it lost 0:2), on the right: 21–15 (team2 on the left)', async () => {
    rows.list = [ended({ team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', sets_won_a: 0, sets_won_b: 2, side_a: 'right' })]
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getAllByText('Müller/Weber').length).toBeGreaterThan(0))
    expect(screen.getAllByText('21–15').length).toBeGreaterThan(0)
  })
})
