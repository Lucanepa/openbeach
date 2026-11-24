import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// AuthContext_beach and the saved teams cache: the access flags come from the
// profile's roles, approved accounts refresh the cache, and the cache (personal
// data) is cleared on sign-out, account deletion, account switch and when the
// login goes away without a sign-out (rejected or expired).

const h = vi.hoisted(() => ({ authCb: null, profileRoles: {}, profileFail: new Set(), profileGate: null, me: null, redeem: null, join: null }))

vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => true }))
vi.mock('../../db_beach/savedTeams_beach', () => ({
  clearSavedTeams: vi.fn(async () => {}),
  clearSavedTeamsOfOtherAccount: vi.fn(async () => false),
  refreshSavedTeams: vi.fn(async () => ({ status: 'refreshed', teams: [] }))
}))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  // /api/me: none (404) unless a test sets one
  apiMe: async () => (h.me ? { data: h.me, error: null, status: 200 } : { data: null, error: { message: 'Not found' }, status: 404 }),
  apiRedeemInvite: async (code) => h.redeem(code),
  apiJoinBeach: async () => h.join(),
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
import { ACCESS_CHANGED_EVENT } from '../../lib_beach/access_beach'
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
  h.me = null
  h.redeem = async () => ({ data: { roles: ['beach:scorer'] }, error: null, status: 200 })
  h.join = vi.fn(async () => ({ data: { app: 'beach', member: true, already_member: false }, error: null, status: 200 }))
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

  it('/api/me apps.beach wins over the roles (an indoor scorer who is not an OpenBeach member)', async () => {
    h.me = { apps: { beach: { canScore: false, canManageTeams: false, isPending: true, member: false } } }
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.isPending).toBe(true))
    expect(ctx.access).toMatchObject({ canScore: false, canReadTeams: false, known: true })
  })

  it('without /api/me the roles decide (an older backend)', async () => {
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.canScore).toBe(true))
    expect(ctx.access.isPending).toBe(false)
  })

  it('a redeemed invite code applies its roles at once', async () => {
    await signInAs('pending')
    await waitFor(() => expect(ctx.access.isPending).toBe(true))
    h.profileRoles.pending = ['beach:scorer']
    let result
    await act(async () => { result = await ctx.redeemInvite('ABCD-1234-EFGH') })
    expect(result.error).toBeNull()
    await waitFor(() => expect(ctx.access).toMatchObject({ isPending: false, canScore: true }))
  })

  it('an OpenVolley account not in OpenBeach needs to join; after the join it is pending', async () => {
    h.me = { apps: { beach: { roles: [], canScore: false, canManageTeams: false, canReadTeams: false, isPending: true, member: false } } }
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.needsJoin).toBe(true))
    expect(ctx.access).toMatchObject({ isPending: true, member: false, known: true })
    // The server's answer after the join
    h.me = { apps: { beach: { roles: [], canScore: false, canManageTeams: false, canReadTeams: false, isPending: true, member: true } } }
    let result
    await act(async () => { result = await ctx.joinBeach() })
    expect(h.join).toHaveBeenCalledTimes(1)
    expect(result.error).toBeNull()
    await waitFor(() => expect(ctx.access.needsJoin).toBe(false))
    expect(ctx.access).toMatchObject({ isPending: true, member: true })
  })

  it('a refused join keeps the account as it was', async () => {
    h.me = { apps: { beach: { roles: [], isPending: true, member: false } } }
    h.join = vi.fn(async () => ({ data: null, error: { message: 'Service unavailable' }, status: 503 }))
    await signInAs('scorer1')
    await waitFor(() => expect(ctx.access.needsJoin).toBe(true))
    let result
    await act(async () => { result = await ctx.joinBeach() })
    expect(result.status).toBe(503)
    expect(ctx.access.needsJoin).toBe(true)
  })

  it('tells the sync queue when the account may score now (an invite redeemed)', async () => {
    const seen = []
    const on = (e) => seen.push(e.detail)
    window.addEventListener(ACCESS_CHANGED_EVENT, on)
    try {
      await signInAs('pending')
      await waitFor(() => expect(ctx.access.isPending).toBe(true))
      h.profileRoles.pending = ['beach:scorer']
      await act(async () => { await ctx.redeemInvite('ABCD-1234-EFGH') })
      await waitFor(() => expect(seen.some(d => d.canScore === true)).toBe(true))
    } finally {
      window.removeEventListener(ACCESS_CHANGED_EVENT, on)
    }
  })
})
