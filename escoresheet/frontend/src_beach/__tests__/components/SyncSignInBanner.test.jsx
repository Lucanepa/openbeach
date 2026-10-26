import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const auth = vi.hoisted(() => ({ user: null, loading: false, access: { known: false }, joinBeach: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth }))
vi.mock('../../components_beach/auth/LoginModal_beach', () => ({
  default: ({ open }) => (open ? <div>login-modal</div> : null)
}))
vi.mock('../../components_beach/auth/ProfileModal_beach', () => ({
  default: ({ open }) => (open ? <div>account-dialog</div> : null)
}))

import { waitFor } from '@testing-library/react'
import SyncSignInBanner, { shouldShowSyncSignIn, shouldShowJoinBeach, SYNC_BANNER_SPACE_VAR } from '../../components_beach/auth/SyncSignInBanner_beach'

describe('SyncSignInBanner', () => {
  it('shows only while the queue waits for a session', () => {
    expect(shouldShowSyncSignIn({ syncStatus: 'auth_required', loading: false, dismissed: false })).toBe(true)
    expect(shouldShowSyncSignIn({ syncStatus: 'synced', loading: false, dismissed: false })).toBe(false)
    expect(shouldShowSyncSignIn({ syncStatus: 'online_no_supabase', loading: false, dismissed: false })).toBe(false)
    expect(shouldShowSyncSignIn({ syncStatus: 'auth_required', loading: true, dismissed: false })).toBe(false)
    expect(shouldShowSyncSignIn({ syncStatus: 'auth_required', loading: false, dismissed: true })).toBe(false)
  })

  it('offers a sign-in and goes away once synced', () => {
    const { rerender } = render(<SyncSignInBanner syncStatus="auth_required" />)
    expect(screen.getByRole('status')).toHaveTextContent('Not signed in')
    fireEvent.click(screen.getByText('Sign in'))
    expect(screen.getByText('login-modal')).toBeInTheDocument()
    rerender(<SyncSignInBanner syncStatus="synced" />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('says the session expired when the app still has a user', () => {
    auth.user = { id: 'u1' }
    render(<SyncSignInBanner syncStatus="auth_required" compact />)
    expect(screen.getByRole('status')).toHaveTextContent('Session expired')
    auth.user = null
  })

  it('the join banner: a signed-in account the backend reports as not in OpenBeach', () => {
    const base = { syncStatus: 'synced', loading: false, dismissed: false, user: { id: 'u1' }, access: { known: true, needsJoin: true } }
    expect(shouldShowJoinBeach(base)).toBe(true)
    expect(shouldShowJoinBeach({ ...base, access: { known: true, needsJoin: false } })).toBe(false)
    expect(shouldShowJoinBeach({ ...base, user: null })).toBe(false)
    expect(shouldShowJoinBeach({ ...base, dismissed: true })).toBe(false)
    // No cloud here: nothing to join
    expect(shouldShowJoinBeach({ ...base, syncStatus: 'offline' })).toBe(false)
    expect(shouldShowJoinBeach({ ...base, syncStatus: 'online_no_supabase' })).toBe(false)
  })

  it('offers Join OpenBeach, then opens the account dialog (pending, invite code)', async () => {
    sessionStorage.clear()
    auth.user = { id: 'u1' }
    auth.access = { known: true, isPending: true, needsJoin: true }
    auth.joinBeach = vi.fn(async () => ({ data: { member: true }, error: null, status: 200 }))
    try {
      render(<SyncSignInBanner syncStatus="synced" />)
      expect(screen.getByRole('status')).toHaveTextContent('Not in OpenBeach yet')
      fireEvent.click(screen.getByRole('button', { name: 'Join OpenBeach' }))
      await waitFor(() => expect(auth.joinBeach).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('account-dialog')).toBeInTheDocument()
    } finally {
      auth.user = null
      auth.access = { known: false }
      auth.joinBeach = null
    }
  })

  it('a refused session wins over the join banner', () => {
    sessionStorage.clear()
    auth.user = { id: 'u1' }
    auth.access = { known: true, isPending: true, needsJoin: true }
    try {
      render(<SyncSignInBanner syncStatus="auth_required" />)
      expect(screen.getByRole('status')).toHaveTextContent('Session expired')
    } finally {
      auth.user = null
      auth.access = { known: false }
    }
  })

  // Floating at the bottom of the page (the coin toss, the setup), the
  // banner lay over the page's last action, "Confirm the coin toss", at every
  // common window size, and no scroll position showed it (stress test
  // 2026-10-25): it now keeps its space free under the page (App's .panel
  // pads its scroll end by SYNC_BANNER_SPACE_VAR).
  it('keeps its space free under the page while it floats at the bottom', () => {
    sessionStorage.clear()
    const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(97)
    const space = () => document.documentElement.style.getPropertyValue(SYNC_BANNER_SPACE_VAR)
    try {
      const { rerender, unmount } = render(<SyncSignInBanner syncStatus="auth_required" />)
      expect(space()).toBe('calc(env(safe-area-inset-bottom, 0px) + 121px)')
      // the scoring screen's one line at the top takes no space at the bottom
      rerender(<SyncSignInBanner syncStatus="auth_required" compact />)
      expect(space()).toBe('')
      rerender(<SyncSignInBanner syncStatus="auth_required" />)
      expect(space()).not.toBe('')
      fireEvent.click(screen.getByText('Later'))
      expect(space()).toBe('')
      unmount()
      expect(space()).toBe('')
    } finally {
      height.mockRestore()
      sessionStorage.clear()
    }
  })
})
