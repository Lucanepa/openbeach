import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from 'i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import AppErrorBoundary from '../../components_beach/AppErrorBoundary_beach'

// A render error anywhere unmounted the whole page to white (scorer, referee,
// livescore, scoreboard, scoresheets, admin): the kit had an ErrorBoundary but
// no entry mounted it. (OpenVolley 8efbd12e.)

beforeAll(async () => {
  await i18n.init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en }, de: { translation: de } } })
})

const originalLocation = window.location
afterEach(async () => {
  Object.defineProperty(window, 'location', { value: originalLocation, configurable: true, writable: true })
  vi.restoreAllMocks()
  await i18n.changeLanguage('en')
})

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('boom')
  return <span>recovered</span>
}

describe('AppErrorBoundary', () => {
  it('shows a way out instead of a white page; "Try again" mounts the app again', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    shouldThrow = true
    render(<AppErrorBoundary name="test"><Bomb /></AppErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong')
    expect(screen.getByRole('alert')).toHaveTextContent('The match is saved on this device')
    expect(screen.getByText('boom')).toBeInTheDocument()

    shouldThrow = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('recovered')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Reload" keeps the URL (?match= keeps a tablet on its live match)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { href: 'https://host/referee_beach.html?match=42&team=1', replace },
      configurable: true,
      writable: true
    })
    shouldThrow = true
    render(<AppErrorBoundary name="referee"><Bomb /></AppErrorBoundary>)
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }))
    const url = new URL(replace.mock.calls[0][0])
    expect(url.pathname).toBe('/referee_beach.html')
    expect(url.searchParams.get('match')).toBe('42')
    expect(url.searchParams.get('team')).toBe('1')
  })

  it('in the page language', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await i18n.changeLanguage('de')
    shouldThrow = true
    render(<AppErrorBoundary><Bomb /></AppErrorBoundary>)
    expect(screen.getByRole('alert')).toHaveTextContent('Etwas ist schiefgelaufen')
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument()
  })

  // Every app root must be wrapped, or a render error is a white page.
  it.each([
    'main_beach.jsx',
    'referee-main_beach.jsx',
    'livescore-main_beach.jsx',
    'scoreboard-main_beach.jsx',
    'scoresheet-main_beach.jsx',
    'admin-main_beach.jsx'
  ])('%s wraps its app (and the dialog host) in AppErrorBoundary', (file) => {
    const src = readFileSync(resolve(__dirname, '../..', file), 'utf8')
    expect(src).toMatch(/<React\.StrictMode>\s*<AppErrorBoundary[^>]*>[\s\S]*<UiHost \/>[\s\S]*<\/AppErrorBoundary>\s*<\/React\.StrictMode>/)
    // the URL cleanup keeps the query
    expect(src).toMatch(/stripCacheBustParam\(\)/)
    expect(src).not.toMatch(/replaceState\(null, '', window\.location\.pathname\)/)
  })
})
