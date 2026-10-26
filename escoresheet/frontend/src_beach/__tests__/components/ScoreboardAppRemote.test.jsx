import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act, cleanup, fireEvent } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// Stress test 2026-10-25:
// - ob-remote-scoreboard-forgets-game-on-reload: a court-side Remote display
//   that reloaded (a power blip, a Refresh to update) went back to "Choose how
//   to connect"; the game was in React state only.
// - beach-cloud-displays-stale-after-reconnect: after a Wi-Fi drop the display
//   stayed on the score from before it, LIVE, until the next point: the
//   realtime connection subscribes again but sends nothing of the gap.

const cloud = vi.hoisted(() => ({ live: null, list: [], reads: 0, onStatus: null }))
vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => ({ ...(await importOriginal()), relayLivescoreNow: () => false }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({ ...(await importOriginal()), isBackendAvailable: () => true }))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiFrom: () => {
    let single = false
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      limit: () => query,
      single: () => { single = true; return query },
      maybeSingle: () => { single = true; return query },
      then: (res, rej) => {
        if (single) cloud.reads++
        return Promise.resolve(single ? { data: cloud.live && { ...cloud.live }, error: null } : { data: cloud.list, error: null }).then(res, rej)
      }
    }
    return query
  }
}))
vi.mock('../../lib_beach/supabaseClient_beach', () => {
  const channel = {
    on: () => channel,
    subscribe: (cb) => { cloud.onStatus = cb; return channel }
  }
  return { supabase: { channel: () => channel, removeChannel: () => {} } }
})
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))

const { default: ScoreboardApp } = await import('../../ScoreboardApp_beach')

const live = (a, b) => ({
  match_id: 'uuid-7', sport_type: 'beach', match_status: 'in_progress', current_set: 1, test: false,
  team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', points_a: a, points_b: b, sets_won_a: 0, sets_won_b: 0,
  side_a: 'left', updated_at: new Date().toISOString()
})

beforeEach(() => {
  cleanup()
  useMemoryLocalStorage()
  window.history.replaceState(null, '', '/scoreboard_beach.html')
  cloud.live = live(1, 0)
  cloud.list = [live(1, 0)]
  cloud.reads = 0
  cloud.onStatus = null
})

describe('Remote scoreboard display', () => {
  it('a game chosen from the list is in the URL and comes back after a reload, without the chooser', async () => {
    render(<ScoreboardApp />)
    fireEvent.click(await screen.findByText('Remote'))
    fireEvent.click(await screen.findByText('Müller/Weber'))
    await waitFor(() => expect(window.location.search).toBe('?mode=remote&match=uuid-7'))
    cleanup()

    // the reload: same URL
    render(<ScoreboardApp />)
    await waitFor(() => expect(cloud.reads).toBeGreaterThan(1))
    expect(document.body.textContent).not.toContain('Choose how to connect')

    // reopened without the parameters (the bare page): the last choice
    cleanup()
    window.history.replaceState(null, '', '/scoreboard_beach.html')
    const readsBefore = cloud.reads
    render(<ScoreboardApp />)
    await waitFor(() => expect(cloud.reads).toBeGreaterThan(readsBefore))
    expect(document.body.textContent).not.toContain('Choose how to connect')
  })

  it('reads the row again when the realtime connection subscribes again after a drop', async () => {
    window.history.replaceState(null, '', '/scoreboard_beach.html?mode=remote&match=uuid-7')
    render(<ScoreboardApp />)
    await waitFor(() => expect(cloud.reads).toBe(1))
    cloud.live = live(1, 2)
    await act(async () => { cloud.onStatus('SUBSCRIBED') })
    await waitFor(() => expect(cloud.reads).toBe(2))
  })
})
