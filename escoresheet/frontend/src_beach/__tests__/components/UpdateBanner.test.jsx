import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'

// The update banner hid itself when version.json named the version already
// running. A deploy without a version bump still has a new service worker
// waiting (registerType 'prompt'), so the banner never offered it and the
// worker stayed waiting. The waiting worker decides; the version is a label.
// (OpenVolley 7dd9eb04.)

const sw = vi.hoisted(() => ({ needRefresh: true, updateServiceWorker: () => {}, dismissUpdate: () => {} }))
vi.mock('../../hooks_beach/useServiceWorker_beach', () => ({ default: () => sw }))

import UpdateBanner from '../../components_beach/UpdateBanner_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  sw.needRefresh = true
})

describe('UpdateBanner', () => {
  it('shows while a new worker waits, even when the version did not change', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ version: __APP_VERSION__ }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<UpdateBanner />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // let the version label settle
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.getByRole('status')).toHaveTextContent('Update available')
    expect(screen.getByRole('button', { name: /Refresh to update/ })).toBeInTheDocument()
    // the same version is no label: "new version"
    expect(screen.getByRole('status')).toHaveTextContent(`${__APP_VERSION__} → new version`)
    // asked relative to the app's base, past the HTTP cache
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toMatch(/^\/version\.json\?t=\d+$/)
    expect(init).toMatchObject({ cache: 'no-store' })
  })

  it('names a newer version', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => ({ version: '99.0.0' }) }))
    render(<UpdateBanner />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${__APP_VERSION__} → 99.0.0`))
  })

  it('nothing without a waiting worker', () => {
    sw.needRefresh = false
    const { container } = render(<UpdateBanner />)
    expect(container).toBeEmptyDOMElement()
  })
})
