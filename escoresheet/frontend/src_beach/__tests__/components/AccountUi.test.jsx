import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// (3) The main app had no account UI (UserButton_beach / ProfileModal_beach
// were never mounted): no way to sign in, see the approval state, enter an
// invite code, sign out of a shared court tablet or delete the account.

const auth = vi.hoisted(() => ({ current: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth.current }))
const ui = vi.hoisted(() => ({ confirm: vi.fn(async () => true) }))
vi.mock('../../ui/volleyui/uiStore.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, confirmDialog: (...a) => ui.confirm(...a) }
})

import UserButton, { accountInitials } from '../../components_beach/auth/UserButton_beach'
import { SIGNUP_URL, RESET_PASSWORD_URL } from '../../lib_beach/accountLinks_beach'
import { roleLabels } from '../../components_beach/auth/ProfileModal_beach'

function signedOut(extra = {}) {
  return { user: null, profile: null, access: { known: false, isPending: false, roles: [] }, loading: false, signIn: vi.fn(async () => ({ error: null })), ...extra }
}
function signedIn(extra = {}) {
  return {
    user: { id: 'u1', email: 'anna@example.ch' },
    profile: { user_id: 'u1', first_name: 'Anna', last_name: 'Müller', roles: [] },
    access: { known: true, isPending: true, roles: [] },
    loading: false,
    signOut: vi.fn(async () => ({ error: null })),
    deleteAccount: vi.fn(async () => ({ error: null })),
    updateProfile: vi.fn(async () => ({ error: null })),
    redeemInvite: vi.fn(async () => ({ data: { roles: ['beach:scorer'] }, error: null, status: 200 })),
    joinBeach: vi.fn(async () => ({ data: { app: 'beach', member: true }, error: null, status: 200 })),
    ...extra
  }
}

beforeEach(() => {
  ui.confirm.mockClear()
})

describe('the header account button', () => {
  it('signed out: Sign in opens the sign-in dialog, with Create account on manager-beach', async () => {
    auth.current = signedOut()
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-sign-in'))
    const dialog = await screen.findByRole('dialog', { name: 'Sign in' })
    const create = within(dialog).getByTestId('create-account-link')
    expect(create).toHaveAttribute('href', 'https://manager-beach.openvolley.app/#signup')
    expect(SIGNUP_URL).toBe('https://manager-beach.openvolley.app/#signup')
    // The external-link icon stays on the text's line (the kit scope makes
    // every svg a block): the link is an inline flex row that does not wrap
    expect(create.className).toMatch(/\binline-flex\b/)
    expect(create.className).toMatch(/\bwhitespace-nowrap\b/)
    expect(create.querySelector('svg')).not.toBeNull()
    expect(within(dialog).getByText('Forgot password?')).toHaveAttribute('href', RESET_PASSWORD_URL)
    // Sentence case and a named close button, no "x" glyph
    expect(within(dialog).queryByText('Sign In')).toBeNull()
    expect(within(dialog).queryByText(/^x$/)).toBeNull()
    // No in-app sign-up any more
    expect(within(dialog).queryByText('Sign Up')).toBeNull()
  })

  it('signs in with the typed email and password', async () => {
    auth.current = signedOut()
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-sign-in'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Email'), { target: { value: ' anna@example.ch ' } })
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'secret' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign in' }))
    await waitFor(() => expect(auth.current.signIn).toHaveBeenCalledWith('anna@example.ch', 'secret'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('signed in and pending: initials with the waiting mark; the dialog has the invite code', async () => {
    auth.current = signedIn()
    render(<UserButton buttonClass="btn" />)
    const button = screen.getByTestId('header-account')
    expect(button).toHaveTextContent('AM')
    expect(button).toHaveAccessibleName(/waiting for approval/)
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Your account' })
    expect(within(dialog).getByTestId('account-email')).toHaveTextContent('anna@example.ch')
    expect(within(dialog).getByTestId('pending-approval')).toBeInTheDocument()
    const code = within(dialog).getByLabelText('Invite code')
    fireEvent.change(code, { target: { value: 'abcd1234efgh' } })
    expect(code).toHaveValue('ABCD-1234-EFGH')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Redeem code' }))
    await waitFor(() => expect(auth.current.redeemInvite).toHaveBeenCalledWith('ABCD-1234-EFGH'))
  })

  it('an OpenVolley account not in OpenBeach: Join OpenBeach, then the pending state', async () => {
    auth.current = signedIn({ access: { known: true, isPending: true, needsJoin: true, roles: ['scorer'] } })
    const { rerender } = render(<UserButton buttonClass="btn" />)
    const button = screen.getByTestId('header-account')
    expect(button).toHaveAccessibleName(/not in OpenBeach yet/)
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Your account' })
    expect(within(dialog).getByTestId('join-beach-section')).toBeInTheDocument()
    // No invite code before the join (the join comes first)
    expect(within(dialog).queryByTestId('pending-approval')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join OpenBeach' }))
    await waitFor(() => expect(auth.current.joinBeach).toHaveBeenCalledTimes(1))
    // The server says: a member now, waiting for approval
    auth.current = { ...auth.current, access: { known: true, isPending: true, needsJoin: false, roles: ['scorer'] } }
    rerender(<UserButton buttonClass="btn" />)
    const after = await screen.findByRole('dialog', { name: 'Your account' })
    expect(within(after).queryByTestId('join-beach-section')).toBeNull()
    expect(within(after).getByTestId('pending-approval')).toBeInTheDocument()
    expect(within(after).getByLabelText('Invite code')).toBeInTheDocument()
  })

  it('a failed join says so in the dialog', async () => {
    auth.current = signedIn({
      access: { known: true, isPending: true, needsJoin: true, roles: [] },
      joinBeach: vi.fn(async () => ({ data: null, error: { message: 'x' }, status: 503 }))
    })
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-account'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Join OpenBeach' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Joining OpenBeach failed')
  })

  it('Save name is the kit primary button', async () => {
    auth.current = signedIn({ access: { known: true, isPending: false, roles: ['beach:scorer'] } })
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-account'))
    const dialog = await screen.findByRole('dialog')
    const save = within(dialog).getByRole('button', { name: 'Save name' })
    expect(save.className).toMatch(/bg-red-600/)
    expect(save.className).not.toMatch(/emerald/)
  })

  it('an approved account has no pending block', async () => {
    auth.current = signedIn({ access: { known: true, isPending: false, roles: ['beach:scorer'] } })
    render(<UserButton buttonClass="btn" />)
    expect(screen.getByTestId('header-account')).not.toHaveAccessibleName(/waiting/)
    fireEvent.click(screen.getByTestId('header-account'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByTestId('pending-approval')).toBeNull()
    expect(within(dialog).getByText('Scorer')).toBeInTheDocument()
  })

  it('signs out (a shared court tablet)', async () => {
    auth.current = signedIn()
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-account'))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(auth.current.signOut).toHaveBeenCalled())
  })

  it('deletes the account only after the confirm dialog', async () => {
    auth.current = signedIn()
    render(<UserButton buttonClass="btn" />)
    fireEvent.click(screen.getByTestId('header-account'))
    const dialog = await screen.findByRole('dialog')
    ui.confirm.mockResolvedValueOnce(false)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(ui.confirm).toHaveBeenCalledTimes(1))
    expect(ui.confirm.mock.calls[0][0]).toMatchObject({ tone: 'danger' })
    expect(auth.current.deleteAccount).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(auth.current.deleteAccount).toHaveBeenCalled())
  })

  it('renders nothing outside an AuthProvider or while loading', () => {
    auth.current = null
    const { container } = render(<UserButton buttonClass="btn" />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('helpers', () => {
  it('initials from the name, else the email', () => {
    expect(accountInitials({ first_name: 'anna', last_name: 'müller' }, 'x@y')).toBe('AM')
    expect(accountInitials(null, 'zoe@example.ch')).toBe('Z')
    expect(accountInitials(null, '')).toBeNull()
  })

  it('role words: beach and plain roles once each', () => {
    const t = (k) => ({ 'account.roles.scorer': 'Scorer', 'account.roles.admin': 'Admin' })[k] || k
    expect(roleLabels(['scorer', 'beach:scorer', 'admin', 'guest'], t)).toEqual(['Scorer', 'Admin'])
  })
})
