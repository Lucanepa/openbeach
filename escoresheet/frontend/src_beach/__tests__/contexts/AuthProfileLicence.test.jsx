// Accounts carry a name, an email and an optional licence number, never a
// date of birth (owner 19.11.2026; the shared backend adds
// profiles.license_number). AuthContext_beach sends license_number, never
// dob, and keeps no dob in its state or in the cached profile.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

const h = vi.hoisted(() => ({ authCb: null, updates: [], row: null }))

vi.mock('../../utils_beach/backendConfig_beach', () => ({ isBackendAvailable: () => true }))
vi.mock('../../db_beach/savedTeams_beach', () => ({
  clearSavedTeams: vi.fn(async () => {}),
  clearSavedTeamsOfOtherAccount: vi.fn(async () => false),
  refreshSavedTeams: vi.fn(async () => ({ status: 'refreshed', teams: [] }))
}))
vi.mock('../../lib_beach/apiClient_beach', () => ({
  apiMe: async () => ({ data: null, error: { message: 'Not found' }, status: 404 }),
  apiRedeemInvite: async () => ({}),
  apiJoinBeach: async () => ({}),
  apiAuth: {
    onAuthStateChange: (cb) => { h.authCb = cb; return { data: { subscription: { unsubscribe: () => {} } } } },
    getSession: async () => ({ data: { session: null } }),
    signOut: async () => ({ error: null }),
    deleteUser: async () => ({ error: null })
  },
  apiFrom: () => {
    let update = null
    const q = {
      select: () => q,
      update: (row) => { update = row; h.updates.push(row); return q },
      eq: () => q,
      // an older backend still answers with a dob column
      single: async () => ({ data: { ...h.row, ...(update || {}), dob: '1990-01-15' }, error: null })
    }
    return q
  }
}))

import { AuthProvider, useAuth, withoutDob } from '../../contexts_beach/AuthContext_beach'

let ctx
let store
function Probe() {
  ctx = useAuth()
  return null
}

beforeEach(async () => {
  store = useMemoryLocalStorage()
  h.updates = []
  h.row = { user_id: 'u1', first_name: 'Max', last_name: 'Muster', license_number: null, roles: ['scorer'] }
  render(<AuthProvider><Probe /></AuthProvider>)
  await act(async () => { await h.authCb('INITIAL_SESSION', { user: { id: 'u1' } }) })
})

describe('AuthContext_beach: licence number, no date of birth', () => {
  it('the fetched profile and its cached copy have no dob', () => {
    expect(ctx.profile).toEqual({ user_id: 'u1', first_name: 'Max', last_name: 'Muster', license_number: null, roles: ['scorer'] })
    expect(JSON.parse(store.get('cachedProfile'))).not.toHaveProperty('dob')
    expect(ctx.getCachedProfile()).not.toHaveProperty('dob')
  })

  it('updateProfile sends license_number, never dob', async () => {
    await act(async () => { await ctx.updateProfile({ firstName: 'Max', lastName: 'Muster', licenseNumber: '123456' }) })
    expect(h.updates[0]).toEqual({ first_name: 'Max', last_name: 'Muster', country: undefined, license_number: '123456' })
    expect(JSON.stringify(h.updates)).not.toMatch(/dob/)
    expect(ctx.profile.license_number).toBe('123456')
    expect(ctx.profile).not.toHaveProperty('dob')
    expect(JSON.parse(store.get('cachedProfile'))).not.toHaveProperty('dob')
  })

  it('an empty licence clears it; a name change alone sends no licence key', async () => {
    await act(async () => { await ctx.updateProfile({ firstName: 'Max', lastName: 'Muster', licenseNumber: '' }) })
    expect(h.updates[0].license_number).toBeNull()
    await act(async () => { await ctx.updateProfile({ firstName: 'Maxi', lastName: 'Muster' }) })
    expect('license_number' in h.updates[1]).toBe(false)
  })

  it('a cached profile from an older app version is read without its dob', () => {
    store.set('cachedProfile', JSON.stringify({ user_id: 'u1', first_name: 'Max', dob: '1990-01-15' }))
    expect(ctx.getCachedProfile()).toEqual({ user_id: 'u1', first_name: 'Max' })
  })

  it('withoutDob leaves a profile without one as it is', () => {
    const p = { user_id: 'u1' }
    expect(withoutDob(p)).toBe(p)
    expect(withoutDob(null)).toBeNull()
  })
})
