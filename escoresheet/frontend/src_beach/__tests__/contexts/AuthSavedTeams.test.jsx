import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// AuthContext_beach and the saved teams cache: the access flags come from the
// profile's roles, approved accounts refresh the cache, and the cache (personal
// data) is cleared on sign-out, account deletion and account switch.

const h = vi.hoisted(() => ({ authCb: null, profileRoles: {} }))

vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => true }))
vi.mock('../../db_beach/savedTeams_beach', () => ({
  clearSavedTeams: vi.fn(async () => {}),
  refreshSavedTeams: vi.fn(async () => ({ status: 'refreshed', teams: [] }))
}))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiAuth: {
    onAuthStateChange: (cb) => { h.authCb = cb; return { data: { subscription: { unsubscribe: () => {} } } } },
    getSession: async () => ({ data: { session: null } }),
    signOut: async () => ({ error: null }),
    deleteUser: async () => ({ error: null })
  },
  apiFrom: () => {
    let userId = null
    const q = {
      select: () => q,
      eq: (_c, v) => { userId = v; return q },
      single: () => Promise.resolve({ data: { user_id: userId, roles: h.profileRoles[userId] ?? [] }, error: null })
    }
    return q
  }
}))

import { AuthProvider, useAuth } from '../../contexts_beach/AuthContext_beach'
import { clearSavedTeams, refreshSavedTeams } from '../../db_beach/savedTeams_beach'

let ctx
function Probe() {
  ctx = useAuth()
  return null
}

async function signInAs(id) {
  await act(async () => { await h.authCb('INITIAL_SESSION', { user: { id } }) })
}

beforeEach(() => {
  useMemoryLocalStorage()
  clearSavedTeams.mockClear()
  refreshSavedTeams.mockClear()
  h.profileRoles = { scorer1: ['scorer'], scorer2: ['scorer'], pending: [], referee: ['referee'] }
  render(<AuthProvider><Probe /></AuthProvider>)
})

describe('AuthContext_beach saved teams wiring', () => {
  it('signed out: no access and no refresh', async () => {
    await act(async () => { await h.authCb('INITIAL_SESSION', null) })
    expect(ctx.access).toMatchObject({ canReadTeams: false, isPending: false })
    expect(refreshSavedTeams).not.toHaveBeenCalled()
  })

  it('a scorer gets read access and refreshes the cache once', async () => {
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.canReadTeams).toBe(true))
    await waitFor(() => expect(refreshSavedTeams).toHaveBeenCalledTimes(1))
    expect(refreshSavedTeams.mock.calls[0][0]).toMatchObject({ userId: 'scorer1', access: { canReadTeams: true } })
  })

  it('a pending account or a referee does not refresh', async () => {
    await signInAs('pending')
    await waitFor(() => expect(ctx.access.isPending).toBe(true))
    expect(ctx.access.canReadTeams).toBe(false)
    await signInAs('referee')
    await waitFor(() => expect(ctx.access.roles).toEqual(['referee']))
    expect(refreshSavedTeams).not.toHaveBeenCalled()
  })

  it('sign-out and account deletion clear the cache', async () => {
    await signInAs('scorer1')
    await act(async () => { await ctx.signOut() })
    expect(clearSavedTeams).toHaveBeenCalledTimes(1)
    await signInAs('scorer1')
    await act(async () => { await ctx.deleteAccount() })
    expect(clearSavedTeams).toHaveBeenCalledTimes(2)
  })

  it('another account on this device clears the previous one\'s cache', async () => {
    await signInAs('scorer1')
    expect(clearSavedTeams).not.toHaveBeenCalled()
    await signInAs('scorer2')
    await waitFor(() => expect(clearSavedTeams).toHaveBeenCalledTimes(1))
  })
})
