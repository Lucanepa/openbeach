import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const auth = vi.hoisted(() => ({ user: null, loading: false }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth }))
vi.mock('../../components_beach/auth/LoginModal_beach', () => ({
  default: ({ open }) => (open ? <div>login-modal</div> : null)
}))

import SyncSignInBanner, { shouldShowSyncSignIn } from '../../components_beach/auth/SyncSignInBanner_beach'

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
})
