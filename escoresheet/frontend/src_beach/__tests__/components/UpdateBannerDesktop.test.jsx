import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'

// On the desktop app the binary IS the update: its first start still runs the
// previous build from the service worker, with the new one waiting. The app
// then applies it at once instead of showing "Update available".

const sw = vi.hoisted(() => ({ needRefresh: true, updateServiceWorker: vi.fn(), dismissUpdate: () => {} }))
vi.mock('../../hooks_beach/useServiceWorker_beach', async (importOriginal) => ({ ...(await importOriginal()), default: () => sw }))

import UpdateBanner from '../../components_beach/UpdateBanner_beach'
import { AUTO_UPDATE_KEY } from '../../hooks_beach/useServiceWorker_beach'
import { forgetDesktopWindowRole } from '../../diagnostics_beach/popupForward_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  forgetDesktopWindowRole(window)
  delete window.__TAURI_INTERNALS__
  vi.unstubAllGlobals()
  sw.updateServiceWorker.mockReset()
})

describe('UpdateBanner on the desktop app', () => {
  it('applies the waiting build at once, no banner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ version: '9.9.9' }) }))
    window.__TAURI_INTERNALS__ = { invoke: vi.fn(), metadata: { currentWindow: { label: 'main' } } }
    const { container } = render(<UpdateBanner />)
    await waitFor(() => expect(sw.updateServiceWorker).toHaveBeenCalledTimes(1))
    expect(container).toBeEmptyDOMElement()
  })

  it('a browser still gets the banner', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ version: '9.9.9' }) }))
    const { container } = render(<UpdateBanner />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).not.toBeEmptyDOMElement()
    expect(sw.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('a second time right after its own try: the banner instead (no reload loop)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ version: '9.9.9' }) }))
    window.__TAURI_INTERNALS__ = { invoke: vi.fn(), metadata: { currentWindow: { label: 'main' } } }
    sessionStorage.setItem(AUTO_UPDATE_KEY, String(Date.now() - 4000))
    const { container } = render(<UpdateBanner />)
    await new Promise((r) => setTimeout(r, 0))
    expect(container).not.toBeEmptyDOMElement()
    expect(sw.updateServiceWorker).not.toHaveBeenCalled()
  })

  it('a desktop pop-up (Linux: its metadata says "main"; the app refuses it): the banner, never on its own', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ version: '9.9.9' }) }))
    const invoke = vi.fn(async (cmd) => {
      if (cmd === 'diagnostics_append') throw 'diagnostics_append not allowed on window "popup-1", webview "popup-1", URL: http://localhost:5173/referee/'
      return null
    })
    window.__TAURI_INTERNALS__ = { invoke, metadata: { currentWindow: { label: 'main' } } }
    const { container } = render(<UpdateBanner />)
    await waitFor(() => expect(container).not.toBeEmptyDOMElement())
    expect(invoke).toHaveBeenCalledWith('diagnostics_append', { lines: [] })
    expect(sw.updateServiceWorker).not.toHaveBeenCalled()
  })
})
