import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// (1) On a venue relay the livescore and the display read the relay feed
// (relayLivescore_beach), not the cloud's match_live_state.

const feedOpts = []
vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    relayLivescoreNow: () => true,
    createRelayLivescoreFeed: (opts) => {
      feedOpts.push(opts)
      return {
        start: () => {
          opts.onList({ ok: true })
          opts.onChange([
            { match_id: 'seed-1', sport_type: 'beach', team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', points_a: 7, points_b: 5, side_a: 'left', current_set: 1, test: false, matches: { set_results: [] } },
            { match_id: 'test-match-default-abc', sport_type: 'beach', team_a_name: 'Rehearsal A', team_b_name: 'Rehearsal B', points_a: 1, points_b: 0, current_set: 1, test: true, matches: { set_results: [] } }
          ])
        },
        stop: vi.fn(),
        refresh: vi.fn(async () => ({ ok: true }))
      }
    }
  }
})
const cloudRead = vi.fn()
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: (...a) => { cloudRead(...a); throw new Error('no cloud') } }))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))

const { default: LivescoreApp } = await import('../../LivescoreApp_beach')

describe('LivescoreApp_beach on a venue relay', () => {
  it('lists the relay\'s beach games, without rehearsal matches, and never asks the cloud', async () => {
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getByText('Müller/Weber')).toBeInTheDocument())
    expect(screen.queryByText('Rehearsal A')).toBeNull()
    expect(cloudRead).not.toHaveBeenCalled()
    expect(feedOpts.length).toBeGreaterThan(0)
  })
})
