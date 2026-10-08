import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import en from '../../i18n_beach/locales/en.json'

// The legal pages (privacy policy, terms, legal notice, open-source notice on
// openvolley.app) are linked wherever OpenBeach shows a reader something:
// Options (all four), the sign-in dialog, the referee / livescore menu, the
// livescore list, the scoresheet archive and the competitions admin.

let language = 'en'
const lookup = (key) => key.split('.').reduce((o, k) => o?.[k], en)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => {
      const v = lookup(key)
      if (typeof v === 'string') return v
      return typeof fallback === 'string' ? fallback : key
    },
    i18n: { language, resolvedLanguage: language, changeLanguage: () => {} }
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
  Trans: ({ children }) => children
}))
vi.mock('../../i18n', () => ({ default: { language: 'de', changeLanguage: () => {} } }))
vi.mock('../../i18n_beach', () => ({ default: { language: 'en', changeLanguage: () => {} } }))

const auth = { signIn: vi.fn(async () => ({})), signOut: vi.fn(), user: null, profile: null, loading: false }
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth }))

vi.mock('../../utils_beach/networkInfo_beach', async (orig) => ({
  ...(await orig()),
  getLocalIP: vi.fn(async () => '192.168.1.20'),
  getServerStatus: vi.fn(async () => ({ running: true, wsPort: 8081 })),
  getConnectionCount: vi.fn(async () => ({ totalClients: 0 }))
}))

vi.mock('../../utils_beach/relayLivescore_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  relayLivescoreNow: () => true,
  createRelayLivescoreFeed: (opts) => ({
    start: () => { opts.onList({ ok: true }); opts.onChange([]) },
    stop: () => {},
    refresh: async () => ({ ok: true })
  })
}))
vi.mock('../../lib_beach/apiClient_beach', () => ({ apiFrom: () => { throw new Error('no cloud') }, apiStorage: null }))
vi.mock('../../lib_beach/supabaseClient_beach', () => ({ supabase: null }))
vi.mock('../../components_beach/UpdateBanner_beach', () => ({ default: () => null }))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => false
}))

const { AlertProvider } = await import('../../contexts_beach/AlertContext_beach')
const { default: HomeOptionsModal } = await import('../../components_beach/options/HomeOptionsModal_beach')
const { default: LoginModal } = await import('../../components_beach/auth/LoginModal_beach')
const { default: DashboardHeader } = await import('../../components_beach/DashboardHeader_beach')
const { default: LivescoreApp } = await import('../../LivescoreApp_beach')
const { default: ScoresheetApp } = await import('../../ScoresheetApp_beach')

const hrefs = () => [...screen.getByTestId('legal-links').querySelectorAll('a')].map((a) => a.getAttribute('href'))
const EN_THREE = ['https://openvolley.app/en/privacy', 'https://openvolley.app/en/terms', 'https://openvolley.app/en/imprint']

afterEach(() => {
  cleanup()
  language = 'en'
})

describe('legal links in OpenBeach', () => {
  it('Options → App version links all four pages (browser, desktop About, Android)', () => {
    const noop = vi.fn()
    render(
      <AlertProvider>
        <HomeOptionsModal
          open
          onClose={noop}
          matchOptions={{
            checkAccidentalRallyStart: true, setCheckAccidentalRallyStart: noop, accidentalRallyStartDuration: 3, setAccidentalRallyStartDuration: noop,
            checkAccidentalPointAward: false, setCheckAccidentalPointAward: noop, accidentalPointAwardDuration: 3, setAccidentalPointAwardDuration: noop,
            keybindingsEnabled: false, setKeybindingsEnabled: noop, manageDob: false, setManageDob: noop, scoreFont: 'default', setScoreFont: noop
          }}
          displayOptions={{ displayMode: 'auto', setDisplayMode: noop, detectedDisplayMode: 'desktop', enterDisplayMode: noop, exitDisplayMode: noop }}
          wakeLock={{ wakeLockActive: false, toggleWakeLock: noop }}
        />
      </AlertProvider>
    )
    const section = screen.getByTestId('options-app-version')
    expect(section.contains(screen.getByTestId('legal-links'))).toBe(true)
    expect(hrefs()).toEqual([...EN_THREE, 'https://openvolley.app/en/open-source'])
  })

  it('the sign-in dialog links the privacy policy, terms and legal notice', () => {
    language = 'fr'
    render(<LoginModal open onClose={() => {}} />)
    expect(hrefs()).toEqual([
      'https://openvolley.app/fr/confidentialite',
      'https://openvolley.app/fr/conditions',
      'https://openvolley.app/fr/mentions-legales'
    ])
  })

  it('the referee / livescore menu ends with the legal links in the app language', () => {
    language = 'de-CH'
    render(<DashboardHeader title="Referee" onLoadGames={() => {}} />)
    expect(screen.queryByTestId('legal-links')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    expect(hrefs()).toEqual([
      'https://openvolley.app/datenschutz',
      'https://openvolley.app/nutzungsbedingungen',
      'https://openvolley.app/impressum'
    ])
  })

  it('the public livescore list has a footer line (it shows the players\' names)', async () => {
    render(<LivescoreApp />)
    await waitFor(() => expect(screen.getAllByTestId('legal-links').length).toBeGreaterThan(0))
    const footer = screen.getAllByTestId('legal-links').find((n) => !n.closest('.dashboard-header-menu'))
    expect([...footer.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(EN_THREE)
  })

  it('the scoresheet archive has a footer line', async () => {
    window.history.replaceState(null, '', '/scoresheet_beach.html')
    render(<ScoresheetApp />)
    await waitFor(() => expect(screen.getByTestId('legal-links')).toBeInTheDocument())
    expect(hrefs()).toEqual(EN_THREE)
  })
})
