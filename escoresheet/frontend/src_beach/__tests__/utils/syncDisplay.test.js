import { describe, it, expect } from 'vitest'
import { cardSyncStatus, pendingSyncLabel } from '../../utils_beach/syncDisplay_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// The OpenBeach screencast of 2026-10-08 (not signed in): a "Syncing..."
// pill and orange pulsing "Syncing..." card chips from the first save to
// the end of the match, for a sync that waits for a sign-in.
describe('sync display while not signed in', () => {
  it('the setup cards say the match is kept on this device, not syncing', () => {
    expect(cardSyncStatus({ hasQueued: true, signedIn: false })).toBe('local')
    expect(cardSyncStatus({ hasQueued: true, signedIn: true })).toBe('syncing')
    expect(cardSyncStatus({ hasError: true, hasQueued: true, signedIn: false })).toBe('error')
    expect(cardSyncStatus({ inCloud: true })).toBe('synced')
    expect(cardSyncStatus({})).toBe('idle')
  })

  it('the header pill says "Not signed in" or "Local only" instead of "Syncing..."', () => {
    expect(pendingSyncLabel({ pending: 3, signedIn: false, cloudStatus: 'connected' })).toBe('not_signed_in')
    expect(pendingSyncLabel({ pending: 3, signedIn: true, cloudStatus: 'not_configured' })).toBe('local_only')
    expect(pendingSyncLabel({ pending: 3, signedIn: true, cloudStatus: 'connected' })).toBe('syncing')
    expect(pendingSyncLabel({ pending: 0, signedIn: false })).toBeNull()
  })
})

describe('isSignedInOnDevice', () => {
  it('reads the stored session as the sync queue does', async () => {
    useMemoryLocalStorage()
    const { isSignedInOnDevice } = await import('../../utils_beach/syncDisplay_beach')
    localStorage.removeItem('api_auth_token')
    expect(isSignedInOnDevice()).toBe(false)
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 't', expires_at: Date.now() / 1000 - 10 }))
    expect(isSignedInOnDevice()).toBe(false)
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 't', expires_at: Date.now() / 1000 + 3600 }))
    expect(isSignedInOnDevice()).toBe(true)
    localStorage.removeItem('api_auth_token')
  })
})
