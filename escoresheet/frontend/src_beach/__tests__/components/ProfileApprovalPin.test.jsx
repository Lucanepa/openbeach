/**
 * Account → "Approval PIN" (components_beach/auth/ApprovalPinSection_beach.jsx,
 * ported from OpenVolley 0fc2661a; account-approval spec 4.4, tests 6.2): who
 * sees it (indoor or beach referees and scorers: the PIN belongs to the
 * shared account), and set / change / remove with the password, against a
 * mocked API. And the account dialog shows it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within, cleanup, act } from '@testing-library/react'
import en from '../../i18n_beach/locales/en.json'

const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), en)
const interpolate = (text, vars) => String(text).replace(/\{\{(\w+)\}\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : ''))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const found = lookup(key)
      if (typeof found === 'string') return interpolate(found, typeof opts === 'object' ? opts : undefined)
      return typeof opts === 'string' ? opts : key
    },
    i18n: { language: 'en' }
  })
}))

const auth = vi.hoisted(() => ({ value: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth.value }))
const cloud = vi.hoisted(() => ({ on: true }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), getCloudApiUrl: (p) => (cloud.on ? `https://api.test${p}` : null) }))
const asked = vi.hoisted(() => ({ fn: null }))
vi.mock('../../utils_beach/askConfirm_beach', () => ({ askConfirm: (...a) => asked.fn(...a), default: (...a) => asked.fn(...a) }))
const api = vi.hoisted(() => ({ status: null, set: null, remove: null, mine: null, undo: null }))
vi.mock('../../lib_beach/approvalsApi_beach', async (orig) => ({
  ...(await orig()),
  approvalPinApi: { status: (...a) => api.status(...a), set: (...a) => api.set(...a), remove: (...a) => api.remove(...a) },
  approvalsApi: { mine: (...a) => api.mine(...a), undo: (...a) => api.undo(...a) }
}))
const toasts = vi.hoisted(() => ({ success: [], error: [] }))
vi.mock('../../ui/volleyui/uiStore.js', async (orig) => {
  const real = await orig()
  return { ...real, toast: { ...real.toast, success: (m) => toasts.success.push(m), error: (m) => toasts.error.push(m) } }
})

import ApprovalPinSection from '../../components_beach/auth/ApprovalPinSection_beach'
import ProfileModal from '../../components_beach/auth/ProfileModal_beach'
import { accessFromRoles } from '../../lib_beach/access_beach'

const ok = (data) => ({ data, error: null, status: 200 })
const fail = (code, status) => ({ data: null, error: { code, status, message: code }, status })
const STATUS = { available: true, eligible: true, set: false, set_at: null, locked_until: null, disabled: false }

function setAuth(roles, { confirmed = true } = {}) {
  auth.value = {
    user: { id: 'u-1', email: 'ref@club.ch', email_confirmed_at: confirmed ? '2026-10-01T08:00:00Z' : null },
    access: { ...accessFromRoles(roles), known: true }
  }
}

// a working localStorage (the test setup's is an empty mock)
const mem = new Map()
beforeEach(() => {
  mem.clear()
  localStorage.getItem.mockImplementation((k) => (mem.has(k) ? mem.get(k) : null))
  localStorage.setItem.mockImplementation((k, v) => { mem.set(k, String(v)) })
  cloud.on = true
  asked.fn = vi.fn(async () => true)
  api.status = vi.fn(async () => ok(STATUS))
  api.set = vi.fn(async () => ok({ set: true, set_at: '2026-10-07T10:00:00.000Z' }))
  api.remove = vi.fn(async () => ok({ set: false }))
  api.mine = vi.fn(async () => ok({ approvals: [] }))
  api.undo = vi.fn(async () => ok({ approval: {}, already: false }))
  toasts.success = []
  toasts.error = []
  setAuth(['referee'])
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})
afterEach(() => {
  cleanup()
  localStorage.getItem.mockReset()
  localStorage.setItem.mockReset()
})

describe('visibility', () => {
  it('shows for referee and scorer accounts when the server offers it', async () => {
    for (const roles of [['beach:referee'], ['beach:scorer'], ['referee'], ['scorer', 'admin']]) {
      setAuth(roles)
      const view = render(<ApprovalPinSection />)
      expect(await screen.findByTestId('approval-pin-section')).toBeInTheDocument()
      expect(screen.getByTestId('approval-pin-status')).toHaveTextContent(en.approval.pin.notSet)
      view.unmount()
    }
  })

  it('hidden for other roles, outside cloud mode, and when the server has no PIN secret', async () => {
    setAuth(['beach:competition_manager'])
    const other = render(<ApprovalPinSection />)
    await act(async () => {})
    expect(screen.queryByTestId('approval-pin-section')).toBeNull()
    other.unmount()

    setAuth(['admin'])
    let view = render(<ApprovalPinSection />)
    await act(async () => {})
    expect(screen.queryByTestId('approval-pin-section')).toBeNull()
    expect(api.status).not.toHaveBeenCalled()
    view.unmount()

    setAuth(['referee'])
    cloud.on = false
    view = render(<ApprovalPinSection />)
    await act(async () => {})
    expect(screen.queryByTestId('approval-pin-section')).toBeNull()
    view.unmount()

    cloud.on = true
    api.status = vi.fn(async () => ok({ available: false, eligible: false, set: false, set_at: null, locked_until: null, disabled: false }))
    render(<ApprovalPinSection />)
    await waitFor(() => expect(api.status).toHaveBeenCalled())
    expect(screen.queryByTestId('approval-pin-section')).toBeNull()
  })

  it('states: set, locked, blocked, not eligible', async () => {
    api.status = vi.fn(async () => ok({ ...STATUS, set: true, set_at: '2026-07-04T19:42:00.000Z' }))
    let view = render(<ApprovalPinSection />)
    expect(await screen.findByTestId('approval-pin-status')).toHaveTextContent('Set on 04.07.2026 21:42')
    expect(screen.getByRole('button', { name: en.approval.pin.change })).toBeEnabled()
    expect(screen.getByRole('button', { name: en.approval.pin.remove })).toBeEnabled()
    view.unmount()

    api.status = vi.fn(async () => ok({ ...STATUS, set: true, disabled: true }))
    view = render(<ApprovalPinSection />)
    expect(await screen.findByText(en.approval.pin.disabled)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.approval.pin.set })).toBeEnabled()
    view.unmount()

    api.status = vi.fn(async () => ok({ ...STATUS, set: true, locked_until: new Date(Date.now() + 600000).toISOString() }))
    view = render(<ApprovalPinSection />)
    expect(await screen.findByTestId('approval-pin-status')).toHaveTextContent(/^Locked until /)
    view.unmount()

    setAuth(['referee'], { confirmed: false })
    api.status = vi.fn(async () => ok({ ...STATUS, eligible: false }))
    render(<ApprovalPinSection />)
    expect(await screen.findByText(en.approval.pin.ineligible.email)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.approval.pin.set })).toBeDisabled()
  })

  it('offline: the cached status with "Needs internet" and disabled buttons', async () => {
    api.status = vi.fn(async () => ok({ ...STATUS, set: true, set_at: '2026-07-04T19:42:00.000Z' }))
    const view = render(<ApprovalPinSection />)
    await screen.findByTestId('approval-pin-status')
    view.unmount()

    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    api.status = vi.fn()
    render(<ApprovalPinSection />)
    expect(await screen.findByText(en.approval.pin.needsInternet)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: en.approval.pin.change })).toBeDisabled()
    expect(screen.getByRole('button', { name: en.approval.pin.remove })).toBeDisabled()
    expect(api.status).not.toHaveBeenCalled()
  })
})

describe('set, change, remove', () => {
  const dialog = () => screen.getByRole('dialog')
  const field = (label) => within(dialog()).getByLabelText(label)
  const submit = () => within(dialog()).getByTestId('approval-pin-submit')

  it('sets a PIN: password required, format, weak and repeat checks inline', async () => {
    render(<ApprovalPinSection />)
    fireEvent.click(await screen.findByRole('button', { name: en.approval.pin.set }))
    expect(within(dialog()).getByText(en.approval.pin.setTitle)).toBeInTheDocument()
    const pin = field(en.approval.pin.newPin)
    expect(pin).toHaveAttribute('type', 'password')
    expect(pin).toHaveAttribute('inputmode', 'numeric')
    expect(pin).toHaveAttribute('maxlength', '6')
    expect(pin).toHaveAttribute('autocomplete', 'off')
    expect(field(en.approval.pin.currentPassword)).toHaveAttribute('autocomplete', 'current-password')

    // no password yet
    fireEvent.change(pin, { target: { value: '4738' } })
    fireEvent.change(field(en.approval.pin.repeatPin), { target: { value: '4738' } })
    expect(submit()).toBeDisabled()

    fireEvent.change(field(en.approval.pin.currentPassword), { target: { value: 'pw-secret' } })
    expect(submit()).toBeEnabled()

    // weak
    fireEvent.change(pin, { target: { value: '1234' } })
    fireEvent.blur(pin)
    expect(within(dialog()).getByText(en.approval.errors.pinWeak)).toBeInTheDocument()
    expect(submit()).toBeDisabled()
    // too short
    fireEvent.change(pin, { target: { value: '12' } })
    expect(within(dialog()).getByText(en.approval.errors.pinFormat)).toBeInTheDocument()
    // mismatch
    fireEvent.change(pin, { target: { value: '048291' } })
    expect(within(dialog()).getByText(en.approval.pin.mismatch)).toBeInTheDocument()
    fireEvent.change(field(en.approval.pin.repeatPin), { target: { value: '048291' } })
    expect(submit()).toBeEnabled()

    fireEvent.click(submit())
    await waitFor(() => expect(api.set).toHaveBeenCalledWith({ password: 'pw-secret', pin: '048291' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.status).toHaveBeenCalledTimes(2) // refreshed after the save
    // the cached status holds no secret
    expect(mem.get('ob.approvalPinStatus')).toBeTruthy()
    expect(mem.get('ob.approvalPinStatus')).not.toMatch(/048291|pw-secret/)
  })

  it('a wrong password is shown inline and the fields are cleared', async () => {
    api.status = vi.fn(async () => ok({ ...STATUS, set: true, set_at: '2026-07-04T19:42:00.000Z' }))
    api.set = vi.fn(async () => fail('OV_PASSWORD_INVALID', 403))
    render(<ApprovalPinSection />)
    fireEvent.click(await screen.findByRole('button', { name: en.approval.pin.change }))
    expect(within(dialog()).getByText(en.approval.pin.changeTitle)).toBeInTheDocument()
    fireEvent.change(field(en.approval.pin.currentPassword), { target: { value: 'wrong' } })
    fireEvent.change(field(en.approval.pin.newPin), { target: { value: '482917' } })
    fireEvent.change(field(en.approval.pin.repeatPin), { target: { value: '482917' } })
    fireEvent.click(submit())
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(en.approval.errors.passwordInvalid)
    expect(field(en.approval.pin.currentPassword)).toHaveValue('')
    expect(field(en.approval.pin.newPin)).toHaveValue('')
  })

  it('server refusals by role and by an unconfirmed address', async () => {
    api.set = vi.fn()
      .mockResolvedValueOnce(fail('OV_APPROVAL_ROLE_REQUIRED', 403))
      .mockResolvedValueOnce(fail('OV_EMAIL_UNCONFIRMED', 409))
      .mockResolvedValueOnce(fail('OV_TOO_MANY_ATTEMPTS', 429))
    render(<ApprovalPinSection />)
    fireEvent.click(await screen.findByRole('button', { name: en.approval.pin.set }))
    const fill = () => {
      fireEvent.change(field(en.approval.pin.currentPassword), { target: { value: 'pw' } })
      fireEvent.change(field(en.approval.pin.newPin), { target: { value: '482917' } })
      fireEvent.change(field(en.approval.pin.repeatPin), { target: { value: '482917' } })
      fireEvent.click(submit())
    }
    fill()
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent(en.approval.pin.ineligible.role)
    fill()
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent(en.approval.pin.ineligible.email))
    fill()
    await waitFor(() => expect(within(dialog()).getByRole('alert')).toHaveTextContent(en.approval.errors.tooManyAttempts))
  })

  it('removes with the password after askConfirm (danger)', async () => {
    api.status = vi.fn(async () => ok({ ...STATUS, set: true, set_at: '2026-07-04T19:42:00.000Z' }))
    render(<ApprovalPinSection />)
    fireEvent.click(await screen.findByRole('button', { name: en.approval.pin.remove }))
    expect(within(dialog()).queryByLabelText(en.approval.pin.newPin)).toBeNull()
    expect(submit()).toBeDisabled() // the password is required
    fireEvent.change(field(en.approval.pin.currentPassword), { target: { value: 'pw' } })

    asked.fn = vi.fn(async () => false)
    fireEvent.click(submit())
    await waitFor(() => expect(asked.fn).toHaveBeenCalledTimes(1))
    expect(asked.fn.mock.calls[0][0]).toMatchObject({ title: en.approval.pin.removeConfirmTitle, tone: 'danger' })
    expect(api.remove).not.toHaveBeenCalled()

    asked.fn = vi.fn(async () => true)
    fireEvent.click(submit())
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith({ password: 'pw' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

describe('your approvals (review fix: the official sees every use of their PIN)', () => {
  const approval = (over = {}) => ({
    id: 'a-1', short_id: '6F1C2A9B', slot: 'referee1', name: 'Muster Anna', approved_at: '2026-10-07T19:42:10.000Z',
    result_key: 'ov-result-v1|1:25:20', result_matches: true, mine: true, requested_by_name: 'Olga Owner',
    match: { external_id: 'm1', game_n: 4711, home_name: 'Home VC', away_name: 'Away FC', status: 'ended', closed_at: null, test: false },
    ...over
  })

  it('lists them with the sender; undo asks first and reloads; closed or revoked ones have no undo', async () => {
    api.status = vi.fn(async () => ok({ ...STATUS, set: true, set_at: '2026-07-04T19:42:00.000Z' }))
    api.mine = vi.fn()
      .mockResolvedValueOnce(ok({ approvals: [
        approval(),
        approval({ id: 'a-2', short_id: 'A1B2C3D4', slot: 'referee2', match: { ...approval().match, game_n: 12, closed_at: '2026-10-07T20:00:00.000Z' } }),
        approval({ id: 'a-3', short_id: 'B1B2C3D4', revoked_at: '2026-10-07T20:00:00.000Z', revoked_reason: 'undo' })
      ] }))
      .mockResolvedValue(ok({ approvals: [] }))
    render(<ApprovalPinSection />)
    const list = await screen.findByTestId('my-approvals')
    // the list's box is drawn before its effect asks the server: the rows
    // first (under load the call came after the box), then the call
    expect(await within(list).findByText('2nd referee · #12 Home VC – Away FC')).toBeInTheDocument()
    expect(api.mine).toHaveBeenCalledWith({ limit: 10 })
    expect(within(list).getAllByText('1st referee · #4711 Home VC – Away FC').length).toBe(2)
    expect(within(list).getAllByText('Sent by Olga Owner').length).toBe(3)
    expect(within(list).getByText(en.approval.mine.closed)).toBeInTheDocument()
    expect(within(list).getByText(en.approval.mine.revoked)).toBeInTheDocument()
    expect(within(list).getByTestId('my-approval-undo-6F1C2A9B')).toBeInTheDocument()
    expect(within(list).queryByTestId('my-approval-undo-A1B2C3D4')).toBeNull()
    expect(within(list).queryByTestId('my-approval-undo-B1B2C3D4')).toBeNull()

    asked.fn = vi.fn(async () => false)
    fireEvent.click(within(list).getByTestId('my-approval-undo-6F1C2A9B'))
    await waitFor(() => expect(asked.fn).toHaveBeenCalledTimes(1))
    expect(asked.fn.mock.calls[0][0]).toMatchObject({ title: en.approval.undoConfirm, tone: 'danger' })
    expect(api.undo).not.toHaveBeenCalled()

    asked.fn = vi.fn(async () => true)
    fireEvent.click(within(list).getByTestId('my-approval-undo-6F1C2A9B'))
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith('a-1'))
    await waitFor(() => expect(api.mine).toHaveBeenCalledTimes(2))
    expect(toasts.success).toEqual([en.approval.undone])
    expect(await within(list).findByText(en.approval.mine.empty)).toBeInTheDocument()
  })

  it('not loaded offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
    localStorage.setItem('ob.approvalPinStatus', JSON.stringify({ userId: 'u-1', status: { ...STATUS, set: true } }))
    render(<ApprovalPinSection />)
    await screen.findByTestId('approval-pin-section')
    expect(screen.queryByTestId('my-approvals')).toBeNull()
    expect(api.mine).not.toHaveBeenCalled()
  })
})

describe('the account dialog', () => {
  it('shows the approval PIN to a beach referee', async () => {
    setAuth(['beach:referee'])
    auth.value = { ...auth.value, profile: { first_name: 'Anna', last_name: 'Ref' }, updateProfile: vi.fn(), signOut: vi.fn(), deleteAccount: vi.fn() }
    render(<ProfileModal open onClose={() => {}} />)
    expect(await screen.findByTestId('approval-pin-section')).toBeInTheDocument()
    expect(screen.getByTestId('approval-pin-status')).toHaveTextContent(en.approval.pin.notSet)
  })
})
