import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'

// On the desktop app the binary IS the update: its first start still runs the
// previous build from the service worker, with the new one waiting. The app
// then applies it at once instead of showing "Update available".

const sw = vi.hoisted(() => ({ needRefresh: true, updateServiceWorker: vi.fn(), dismissUpdate: () => {} }))
vi.mock('../../hooks_beach/useServiceWorker_beach', () => ({ default: () => sw }))

import UpdateBanner from '../../components_beach/UpdateBanner_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

afterEach(() => {
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
})
