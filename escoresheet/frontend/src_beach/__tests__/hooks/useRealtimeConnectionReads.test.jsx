import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The database's change notifications of a rally come in a burst (its
// events, the set row, the live state twice) and each read the whole match
// (getMatchData): under fast scoring every referee tablet behind the venue's
// IP tripped its per-IP read limits (stress test 2026-10-25). A burst now
// makes one read at once and one after it, not one each.

const rt = vi.hoisted(() => ({ handlers: [], reads: 0 }))
vi.mock('../../lib_beach/supabaseClient_beach', () => {
  const channel = {
    on: (_kind, filter, cb) => { rt.handlers.push({ table: filter.table, cb }); return channel },
    subscribe: (cb) => { if (cb) cb('SUBSCRIBED'); return channel }
  }
  return { supabase: { channel: () => channel, removeChannel: () => {} } }
})
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiFrom: () => {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: '00000000-0000-4000-8000-000000000001' }, error: null }) }
    return q
  }
}))
vi.mock('../../utils_beach/serverDataSync_beach', () => ({
  subscribeToMatchData: () => () => {},
  getMatchData: async () => { rt.reads++; await new Promise(r => setTimeout(r, 30)); return { success: true, match: {} } },
  getWebSocketStatus: () => 'disconnected',
  forceReconnect: vi.fn()
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => true
}))

const { useRealtimeConnection } = await import('../../hooks_beach/useRealtimeConnection_beach')

beforeEach(() => { rt.handlers.length = 0; rt.reads = 0 })

describe('useRealtimeConnection_beach: reads of the match on change notifications', () => {
  it('a burst of 20 notifications: two reads, not 20', async () => {
    const onData = vi.fn()
    renderHook(() => useRealtimeConnection({ matchId: 'match_seed', preferredConnection: 'supabase', onData, enabled: true }))
    await waitFor(() => expect(rt.handlers.length).toBeGreaterThan(0))
    await act(async () => { await new Promise(r => setTimeout(r, 1200)) })
    const before = rt.reads
    await act(async () => {
      for (let i = 0; i < 20; i++) rt.handlers[i % rt.handlers.length].cb({})
    })
    await act(async () => { await new Promise(r => setTimeout(r, 1500)) })
    expect(rt.reads - before).toBe(2)
    expect(onData).toHaveBeenCalled()
  }, 20000)
})
