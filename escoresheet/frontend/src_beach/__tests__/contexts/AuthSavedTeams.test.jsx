import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// AuthContext_beach and the saved teams cache: the access flags come from the
// profile's roles, approved accounts refresh the cache, and the cache (personal
// data) is cleared on sign-out, account deletion, account switch and when the
// login goes away without a sign-out (rejected or expired).

const h = vi.hoisted(() => ({ authCb: null, profileRoles: {}, profileFail: new Set(), profileGate: null }))

vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => true }))
vi.mock('../../db_beach/savedTeams_beach', () => ({
  clearSavedTeams: vi.fn(async () => {}),
  clearSavedTeamsOfOtherAccount: vi.fn(async () => false),
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
      single: async () => {
        if (h.profileGate) await h.profileGate
        if (h.profileFail.has(userId)) return { data: null, error: { message: 'offline' } }
        return { data: { user_id: userId, roles: h.profileRoles[userId] ?? [] }, error: null }
      }
    }
    return q
  }
}))

import { AuthProvider, useAuth } from '../../contexts_beach/AuthContext_beach'
import { clearSavedTeams, clearSavedTeamsOfOtherAccount, refreshSavedTeams } from '../../db_beach/savedTeams_beach'

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
  clearSavedTeamsOfOtherAccount.mockClear()
  refreshSavedTeams.mockClear()
  h.profileFail = new Set()
  h.profileGate = null
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
    expect(clearSavedTeams).toHaveBeenCalled()
    clearSavedTeams.mockClear()
    await signInAs('scorer1')
    await act(async () => { await ctx.deleteAccount() })
    expect(clearSavedTeams).toHaveBeenCalled()
  })

  it('another account on this device clears the previous one\'s cache', async () => {
    await signInAs('scorer1')
    expect(clearSavedTeams).not.toHaveBeenCalled()
    await signInAs('scorer2')
    await waitFor(() => expect(clearSavedTeams).toHaveBeenCalledTimes(1))
  })

  it('a login that goes away without a sign-out clears the cache and the cached profile', async () => {
    // getSession got a rejection: apiAuth drops the token and announces SIGNED_OUT
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.canReadTeams).toBe(true))
    expect(JSON.parse(localStorage.getItem('cachedProfile')).user_id).toBe('scorer1')
    clearSavedTeams.mockClear()
    await act(async () => { await h.authCb('SIGNED_OUT', null) })
    await waitFor(() => expect(clearSavedTeams).toHaveBeenCalledTimes(1))
    expect(localStorage.getItem('cachedProfile')).toBeNull()
    expect(ctx.access).toMatchObject({ canReadTeams: false, known: false })
  })

  it('once the login is resolved, a cache of another account is dropped (also across a reload)', async () => {
    await act(async () => { await h.authCb('INITIAL_SESSION', null) })
    await waitFor(() => expect(clearSavedTeamsOfOtherAccount).toHaveBeenCalledWith(null))
    await signInAs('scorer2')
    await waitFor(() => expect(clearSavedTeamsOfOtherAccount).toHaveBeenCalledWith('scorer2'))
  })

  it('never takes the roles of another account\'s cached profile', async () => {
    localStorage.setItem('cachedProfile', JSON.stringify({ user_id: 'admin1', roles: ['admin'] }))
    h.profileFail.add('pending')
    await signInAs('pending')
    expect(ctx.access).toMatchObject({ canReadTeams: false, isAdmin: false, known: false })
    expect(refreshSavedTeams).not.toHaveBeenCalled()
  })

  it('uses the cached profile of the same account offline', async () => {
    localStorage.setItem('cachedProfile', JSON.stringify({ user_id: 'scorer1', roles: ['scorer'] }))
    h.profileFail.add('scorer1')
    await signInAs('scorer1')
    expect(ctx.access).toMatchObject({ canReadTeams: true, known: true })
  })

  it('roles not known while the profile loads', async () => {
    let release
    h.profileGate = new Promise(r => { release = r })
    let pending
    act(() => { pending = h.authCb('INITIAL_SESSION', { user: { id: 'scorer1' } }) })
    await waitFor(() => expect(ctx.user?.id).toBe('scorer1'))
    expect(ctx.access).toMatchObject({ known: false, isPending: true, canReadTeams: false })
    await act(async () => { release(); await pending })
    expect(ctx.access).toMatchObject({ known: true, isPending: false, canReadTeams: true })
  })
})
