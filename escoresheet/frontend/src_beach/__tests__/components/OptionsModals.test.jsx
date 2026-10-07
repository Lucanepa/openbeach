import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import HomeOptionsModal from '../../components_beach/options/HomeOptionsModal_beach'
import ScoreboardOptionsModal from '../../components_beach/options/ScoreboardOptionsModal_beach'
import ConnectionSetupModal from '../../components_beach/options/ConnectionSetupModal_beach'
import SupportFeedbackModal from '../../components_beach/SupportFeedbackModal_beach'

// Home → Options, Support & feedback and the connection setup were dark
// legacy modals (navy panel, blue selection, green Support button, Title Case,
// a red asterisk); their toggles were unnamed buttons with no role. Now light
// volleyui dialogs with kit switches named by their row.

vi.mock('../../utils_beach/networkInfo_beach', async (orig) => ({
  ...(await orig()),
  getLocalIP: vi.fn(async () => '192.168.1.20'),
  getServerStatus: vi.fn(async () => ({ running: true, wsPort: 8081 })),
  getConnectionCount: vi.fn(async () => ({ totalClients: 0 }))
}))

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, de: { translation: de } } })
})

afterEach(async () => {
  delete window.__TAURI_INTERNALS__
  await i18n.changeLanguage('en')
})

const matchOptions = (over = {}) => ({
  checkAccidentalRallyStart: true,
  setCheckAccidentalRallyStart: vi.fn(),
  accidentalRallyStartDuration: 3,
  setAccidentalRallyStartDuration: vi.fn(),
  checkAccidentalPointAward: false,
  setCheckAccidentalPointAward: vi.fn(),
  accidentalPointAwardDuration: 3,
  setAccidentalPointAwardDuration: vi.fn(),
  keybindingsEnabled: false,
  setKeybindingsEnabled: vi.fn(),
  manageDob: false,
  setManageDob: vi.fn(),
  scoreFont: 'default',
  setScoreFont: vi.fn(),
  ...over
})
const displayOptions = () => ({ displayMode: 'auto', setDisplayMode: vi.fn(), detectedDisplayMode: 'desktop', enterDisplayMode: vi.fn(), exitDisplayMode: vi.fn() })

function renderHome(props = {}) {
  const opts = matchOptions()
  render(
    <AlertProvider>
      <HomeOptionsModal open onClose={() => {}} matchOptions={opts} displayOptions={displayOptions()} wakeLock={{ wakeLockActive: false, toggleWakeLock: vi.fn() }} {...props} />
    </AlertProvider>
  )
  return opts
}

describe('Home → Options', () => {
  it('is a light kit dialog, sentence case, Support & feedback a secondary button', () => {
    renderHome()
    const dialog = screen.getByRole('dialog', { name: 'Options' })
    expect(dialog.className).toMatch(/bg-white/)
    expect(dialog.closest('.legacy-dark')).toBeNull()
    expect(within(dialog).getByText('Check accidental rally start')).toBeInTheDocument()
    const support = within(dialog).getByRole('button', { name: 'Support & feedback' })
    expect(support.className).toMatch(/border-stone-300 bg-white/)
    expect(support.getAttribute('style')).toBeNull()
  })

  it('every setting is a named switch that reports its state', () => {
    const opts = renderHome()
    const rally = screen.getByRole('switch', { name: 'Check accidental rally start' })
    expect(rally).toHaveAttribute('aria-checked', 'true')
    const dob = screen.getByRole('switch', { name: 'Manage date of birth' })
    expect(dob).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(dob)
    expect(opts.setManageDob).toHaveBeenCalledWith(true)
    for (const sw of screen.getAllByRole('switch')) expect(sw).toHaveAccessibleName()
    // explanations open on tap: real buttons with a name
    expect(screen.getAllByRole('button', { name: 'Show explanation' }).length).toBeGreaterThan(3)
  })

  it('the screen mode is a segmented control, not blue buttons', () => {
    renderHome()
    const group = screen.getByRole('radiogroup', { name: 'Screen mode' })
    const auto = within(group).getByRole('radio', { name: 'Auto (Desktop)' })
    expect(auto).toHaveAttribute('aria-checked', 'true')
    expect(auto.className).not.toMatch(/blue/)
  })

  it('App version: the plain version in a browser, the updater section in the desktop app', async () => {
    renderHome()
    expect(screen.getByTestId('options-app-version')).toHaveTextContent(`v${__APP_VERSION__}`)
  })

  it('in German', async () => {
    await i18n.changeLanguage('de')
    renderHome()
    expect(screen.getByRole('dialog', { name: 'Optionen' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fertig' })).toBeInTheDocument()
  })
})

describe('Scoring screen → Options', () => {
  it('its toggles are named switches and its (i) are buttons', () => {
    render(
      <AlertProvider>
        <ScoreboardOptionsModal open onClose={() => {}} matchOptions={matchOptions()} displayOptions={displayOptions()} matchId={1} />
      </AlertProvider>
    )
    const switches = screen.getAllByRole('switch')
    expect(switches.length).toBeGreaterThanOrEqual(4)
    for (const sw of switches) {
      expect(sw).toHaveAccessibleName()
      expect(sw).toHaveAttribute('aria-checked')
      expect(sw.className).toMatch(/focus-visible:ring/)
    }
    expect(screen.getByRole('switch', { name: 'Check accidental rally start' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getAllByRole('button', { name: 'Show explanation' }).length).toBeGreaterThan(3)
  })
})

describe('Support & feedback', () => {
  it('a light form: native required, no asterisk, Cancel left of Send', () => {
    render(<SupportFeedbackModal open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Support & feedback' })
    expect(dialog.className).toMatch(/bg-white/)
    const type = within(dialog).getByLabelText(en.supportFeedback.contactTypeLabel)
    expect(type).toBeRequired()
    expect(dialog.textContent).not.toContain('*')
    fireEvent.change(type, { target: { value: 'feedback' } })
    const buttons = within(dialog).getAllByRole('button').map(b => b.textContent.trim()).filter(Boolean)
    expect(buttons.indexOf('Cancel')).toBeLessThan(buttons.indexOf('Send'))
  })
})

describe('Connection setup', () => {
  it('light, QR codes drawn offline, named switches per role', async () => {
    const { container } = render(
      <ConnectionSetupModal open onClose={() => {}} matchId={1} matchSeedKey="match_1_x" match={{ refereeConnectionEnabled: true }} refereePin="123456" />
    )
    const dialog = await screen.findByRole('dialog', { name: 'Connection setup' })
    expect(dialog.closest('.legacy-dark')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Referee dashboard' })).toHaveAttribute('aria-checked', 'true')
    expect(container.ownerDocument.querySelector('img[src*="qrserver"]')).toBeNull()
    expect(dialog.querySelector('svg')).not.toBeNull()
  })
})
