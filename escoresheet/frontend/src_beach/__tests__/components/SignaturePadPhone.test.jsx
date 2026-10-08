/**
 * SignaturePad_beach and Sign on phone (ported from OpenVolley d451686d,
 * 84a06005; OpenVolley docs/qr-signing-spec.md 5.3, 5.4, 8.5): the button
 * beside the pad, disabled with the reason when no way exists; the panel in
 * place of the canvas and back; a drawn signature reports { source: 'device' }.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import en from '../../i18n_beach/locales/en.json'

const lookup = (key) => key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), en)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      const found = lookup(key)
      if (typeof found === 'string') return found
      return typeof opts === 'string' ? opts : key
    },
    i18n: { language: 'en' }
  })
}))
const auth = vi.hoisted(() => ({ value: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => { if (!auth.value) throw new Error('no provider'); return auth.value } }))
const cfg = vi.hoisted(() => ({ cloud: null }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({
  ...(await orig()),
  getCloudApiBaseUrl: () => cfg.cloud,
  getLocalServerStatusUrl: () => null,
  isCloudBlockedOnThisPort: () => false,
  isServedFromLanOrigin: () => false
}))
const api = vi.hoisted(() => ({ start: null, close: null }))
vi.mock('../../lib_beach/phoneSignApi_beach', () => ({
  startPhoneSign: (...a) => api.start(...a),
  waitPhoneSign: () => new Promise(() => {}),
  closePhoneSign: (...a) => api.close(...a),
  phoneSignUrl: (h) => `${h.phoneBase}/sign#k=${h.token}`
}))

import SignaturePad from '../../components_beach/SignaturePad_beach'

const PHONE = { slot: 'scorer', matchKey: 'seed-1', context: { home: 'A', away: 'B' } }

beforeEach(() => {
  auth.value = null
  cfg.cloud = null
  api.start = vi.fn(async (o) => ({ ok: true, handle: { transport: o.transport, apiBase: o.apiBase, phoneBase: o.phoneBase, token: 'T'.repeat(43), watch: 'W'.repeat(43), ttlSeconds: 600, startedAt: Date.now() } }))
  api.close = vi.fn(async () => ({ ok: true }))
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SignaturePad with Sign on phone', () => {
  it('renders the drawing canvas when open', () => {
    render(<SignaturePad open onClose={() => {}} onSave={() => {}} title="Scorer" />)
    expect(document.querySelector('canvas')).toBeTruthy()
    expect(screen.queryByTestId('sign-on-phone')).toBeNull() // no `phone`: no button
  })

  it('no way to a phone: the button stays, disabled, with the reason', () => {
    render(<SignaturePad open onClose={() => {}} onSave={() => {}} title="Scorer" phone={PHONE} />)
    expect(screen.getByTestId('sign-on-phone')).toBeDisabled()
    expect(screen.getByTestId('sign-on-phone-reason')).toHaveTextContent(en.phoneSign.reasonNone)
  })

  it('online but signed out: the sign-in reason; without a role: the role reason', () => {
    cfg.cloud = 'https://backend.test'
    const { unmount } = render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    expect(screen.getByTestId('sign-on-phone-reason')).toHaveTextContent(en.phoneSign.reasonSignIn)
    unmount()
    auth.value = { user: { id: 'u' }, access: { roles: ['competition_manager'], isAdmin: false } }
    render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    expect(screen.getByTestId('sign-on-phone-reason')).toHaveTextContent(en.phoneSign.reasonRole)
  })

  it('read-only pads offer no phone', () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['scorer'] } }
    render(<SignaturePad open readOnly onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    expect(screen.queryByTestId('sign-on-phone')).toBeNull()
  })

  it('a scorer online: the panel replaces the pad, "Sign here instead" brings it back and closes the link', async () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['scorer'] } }
    render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    const btn = screen.getByTestId('sign-on-phone')
    expect(btn).toBeEnabled()
    expect(api.start).not.toHaveBeenCalled() // nothing before the tap
    fireEvent.click(btn)
    expect(await screen.findByTestId('phone-sign-panel')).toBeInTheDocument()
    expect(document.querySelector('canvas')).toBeNull()
    await waitFor(() => expect(api.start).toHaveBeenCalledWith(expect.objectContaining({ transport: 'cloud', apiBase: 'https://backend.test', slot: 'scorer', matchKey: 'seed-1' })))
    await waitFor(() => expect(screen.getByTestId('phone-sign-link')).toHaveTextContent('https://backend.test/sign#k=TTT'))
    fireEvent.click(screen.getByTestId('sign-here-instead'))
    expect(document.querySelector('canvas')).toBeTruthy()
    expect(api.close).toHaveBeenCalledWith(expect.objectContaining({ watch: 'W'.repeat(43) }), { keepalive: true })
  })

  it('closing the modal while the link is shown closes it', async () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['referee'] } }
    const onClose = vi.fn()
    const { rerender } = render(<SignaturePad open onClose={onClose} onSave={() => {}} phone={PHONE} />)
    fireEvent.click(screen.getByTestId('sign-on-phone'))
    await waitFor(() => expect(screen.getByTestId('phone-sign-link')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: en.signature.cancel }))
    expect(onClose).toHaveBeenCalled()
    rerender(<SignaturePad open={false} onClose={onClose} onSave={() => {}} phone={PHONE} />)
    expect(api.close).toHaveBeenCalledTimes(1)
    // Opened again: the pad first
    rerender(<SignaturePad open onClose={onClose} onSave={() => {}} phone={PHONE} />)
    expect(document.querySelector('canvas')).toBeTruthy()
  })

  it('the phone prop going away while the panel is shown falls back to the pad, no crash', async () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['scorer'] } }
    const { rerender } = render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    fireEvent.click(screen.getByTestId('sign-on-phone'))
    await waitFor(() => expect(screen.getByTestId('phone-sign-link')).toBeInTheDocument())
    rerender(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={null} />)
    expect(screen.queryByTestId('phone-sign-panel')).toBeNull()
    expect(document.querySelector('canvas')).toBeTruthy()
    expect(api.close).toHaveBeenCalledTimes(1)
  })

  it('locked (MatchEnd: approved, closed or final): the button is disabled with the reason, no session starts', async () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['scorer'] } }
    render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={{ ...PHONE, locked: true, lockedReason: en.matchEnd.signatureLocked }} />)
    const btn = screen.getByTestId('sign-on-phone')
    expect(btn).toBeDisabled()
    expect(screen.getByTestId('sign-on-phone-reason')).toHaveTextContent(en.matchEnd.signatureLocked)
    fireEvent.click(btn)
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(screen.queryByTestId('phone-sign-panel')).toBeNull()
    expect(document.querySelector('canvas')).toBeTruthy()
    expect(api.start).not.toHaveBeenCalled()
  })

  it('locked while the link is shown: back on the pad, and the session is closed', async () => {
    cfg.cloud = 'https://backend.test'
    auth.value = { user: { id: 'u' }, access: { roles: ['scorer'] } }
    const { rerender } = render(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    fireEvent.click(screen.getByTestId('sign-on-phone'))
    await waitFor(() => expect(screen.getByTestId('phone-sign-link')).toBeInTheDocument())
    rerender(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={{ ...PHONE, locked: true }} />)
    expect(screen.queryByTestId('phone-sign-panel')).toBeNull()
    expect(document.querySelector('canvas')).toBeTruthy()
    expect(api.close).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('sign-on-phone')).toBeDisabled()
    expect(screen.getByTestId('sign-on-phone-reason')).toHaveTextContent(en.matchEnd.signatureLocked)
    // Unlocked again ("Reopen match"): offered again, nothing started by itself
    rerender(<SignaturePad open onClose={() => {}} onSave={() => {}} phone={PHONE} />)
    expect(screen.getByTestId('sign-on-phone')).toBeEnabled()
    expect(api.start).toHaveBeenCalledTimes(1)
  })

  it('a drawn signature is saved with { source: "device" }', async () => {
    vi.useFakeTimers()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const ctx = { scale() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,DRAWN')
    render(<SignaturePad open onClose={onClose} onSave={onSave} />)
    await act(async () => { vi.advanceTimersByTime(150) })
    const canvas = document.querySelector('canvas')
    fireEvent.mouseDown(canvas, { clientX: 5, clientY: 5 })
    fireEvent.mouseMove(canvas, { clientX: 50, clientY: 20 })
    fireEvent.mouseUp(canvas)
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('button', { name: en.signature.save }))
    expect(onSave).toHaveBeenCalledWith('data:image/png;base64,DRAWN', { source: 'device' })
  })
})
