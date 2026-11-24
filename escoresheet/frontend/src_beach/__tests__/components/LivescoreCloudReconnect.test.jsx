import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// Stress test 2026-10-25 (beach-cloud-displays-stale-after-reconnect): the
// cloud livescore read the list once, then applied realtime changes. After a
// Wi-Fi drop the realtime connection subscribes again (SUBSCRIBED) but sends
// nothing of what changed meanwhile, so the cards kept the score from before
// the drop until the next point. The list is read again on every SUBSCRIBED.

const cloud = vi.hoisted(() => ({ rows: [], reads: 0, onStatus: null }))
vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => ({ ...(await importOriginal()), relayLivescoreNow: () => false }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({ ...(await importOriginal()), isBackendAvailable: () => true }))
vi.mock('../../lib_beach/apiClient_beach', () => {
  const query = {
    select: () => query,
    eq: () => query,
    gte: () => query,
    order: () => query,
    then: (res, rej) => {
      cloud.reads++
      return Promise.resolve({ data: cloud.rows.map(r => ({ ...r })), error: null }).then(res, rej)
    }
  }
  return { apiFrom: () => query }
})
vi.mock('../../lib_beach/supabaseClient_beach', () => {
  const channel = {
    on: () => channel,
    subscribe: (cb) => { cloud.onStatus = cb; return channel }
  }
  return { supabase: { channel: () => channel, removeChannel: () => {} } }
})
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))

const { default: LivescoreApp } = await import('../../LivescoreApp_beach')

const row = (a, b) => ({
  match_id: 'uuid-1', sport_type: 'beach', match_status: 'in_progress', current_set: 1, test: false,
  team_a_name: 'Müller/Weber', team_b_name: 'Schmidt/Fischer', points_a: a, points_b: b, sets_won_a: 0, sets_won_b: 0,
  side_a: 'left', updated_at: new Date().toISOString(), matches: { set_results: [] }
})

describe('cloud livescore after a reconnect', () => {
  it('reads the list again when the realtime connection subscribes again', async () => {
    cloud.rows = [row(1, 0)]
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getByText('Müller/Weber')).toBeInTheDocument())
    const readsBefore = cloud.reads
    // two points while the display was offline; the connection is back
    cloud.rows = [row(1, 2)]
    await act(async () => { cloud.onStatus('SUBSCRIBED') })
    await waitFor(() => expect(cloud.reads).toBeGreaterThan(readsBefore))
    await waitFor(() => expect(document.body.textContent).toMatch(/1\D*2/))
  })
})
