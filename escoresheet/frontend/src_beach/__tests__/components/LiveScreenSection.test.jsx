import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import LiveScreenSection, { venueTvUrl } from '../../components_beach/options/LiveScreenSection_beach'
import { getLiveCode, setLiveCode } from '../../utils_beach/liveScreen_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// Options › Live screen: start a code, join another device's, show the TV link

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', interpolation: { escapeValue: false }, resources: { en: { translation: en }, de: { translation: de } } })
})
beforeEach(() => { useMemoryLocalStorage() })
afterEach(async () => { cleanup(); delete window.__TAURI_INTERNALS__; await i18n.changeLanguage('en') })

const renderKit = () => render(<div className="ov-kit"><LiveScreenSection /></div>)

describe('LiveScreenSection', () => {
  it('off by default: a start button and a code field, nothing goes online', () => {
    renderKit()
    expect(screen.getByText('Scores on TVs')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start a live screen' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Live screen code' })).toBeInTheDocument()
    expect(getLiveCode()).toBe(null)
  })

  it('starts a live screen: a code, its link, QR and a way to turn it off', () => {
    renderKit()
    fireEvent.click(screen.getByTestId('live-screen-start'))
    const code = getLiveCode()
    expect(code).toMatch(/^[A-Z2-9]{8}$/)
    expect(screen.getByTestId('live-screen-code').textContent).toBe(`${code.slice(0, 4)} ${code.slice(4)}`)
    expect(screen.getByTestId('live-screen-url').textContent).toBe(`https://openvolley.app/tv/${code}`)
    const panel = screen.getByTestId('live-screen-panel')
    expect(panel.querySelector('svg title')?.textContent).toBe(`https://openvolley.app/tv/${code}`)
    expect(within(panel).getByText(`On a smart TV: open the TV's web browser and type openvolley.app/tv/${code}.`)).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('live-screen-off'))
    expect(getLiveCode()).toBe(null)
    expect(screen.getByTestId('live-screen-start')).toBeInTheDocument()
  })

  it('joins another device\'s code, and refuses a wrong one', () => {
    renderKit()
    fireEvent.change(screen.getByTestId('live-screen-input'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByTestId('live-screen-join'))
    expect(screen.getByRole('alert').textContent).toBe(en.liveScreen.badCode)
    expect(screen.getByTestId('live-screen-input')).toHaveAttribute('aria-invalid', 'true')
    expect(getLiveCode()).toBe(null)
    fireEvent.change(screen.getByTestId('live-screen-input'), { target: { value: 'abcd 2345' } })
    fireEvent.keyDown(screen.getByTestId('live-screen-input'), { key: 'Enter' })
    expect(getLiveCode()).toBe('ABCD2345')
    expect(screen.getByTestId('live-screen-code').textContent).toBe('ABCD 2345')
  })

  it('follows a code set elsewhere on the page, and speaks the app language', async () => {
    await i18n.changeLanguage('de')
    renderKit()
    expect(screen.getByRole('button', { name: 'Live-Bildschirm starten' })).toBeInTheDocument()
    setLiveCode('WXYZ2345')
    expect(await screen.findByTestId('live-screen-code')).toHaveTextContent('WXYZ 2345')
  })

  it('no venue TV link in the desktop app (its relay has no TV page)', () => {
    window.__TAURI_INTERNALS__ = {}
    expect(venueTvUrl('ABCD2345')).toBe(null)
  })
})
