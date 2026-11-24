// The guide's Scoreboard section, "Recording points": its score demo drew its
// first button with onClick={addHomePoint}, a name the team1 / team2 rename
// (6e4dd1b) left behind: a ReferenceError while drawing, so opening that
// section threw instead of showing the demo. Its labels read
// demos.home / demos.pointHome / demos.pointteam2, keys that do not exist (the
// raw key showed). Home → Guide → Scoreboard → Recording points.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import InteractiveGuide from '../../components_beach/InteractiveGuide_beach'

beforeAll(async () => {
  // jsdom has no scrolling: a section scrolls to its top when chosen
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('InteractiveGuide: the score demo', () => {
  it('opens and scores a point for either team', () => {
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Scoreboard$/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Recording points/ }))

    // the demo: both teams' names and buttons from the translations, no raw keys
    const demo = within(screen.getByText('Click the buttons to see the score update!').parentElement)
    expect(demo.getByText('TEAM 1')).toBeTruthy()
    expect(demo.getByText('TEAM 2')).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/interactiveGuide\.demos\./)
    expect(demo.getByText('12')).toBeTruthy()
    expect(demo.getByText('10')).toBeTruthy()

    fireEvent.click(demo.getByRole('button', { name: 'Point Team 1' }))
    expect(demo.getByText('13')).toBeTruthy()
    fireEvent.click(demo.getByRole('button', { name: 'Point Team 2' }))
    expect(demo.getByText('11')).toBeTruthy()
  })

  // its 300 ms flash outlived the closed guide: in a loaded test run it fired
  // after the environment was gone ("window is not defined")
  it('closing the guide mid-flash leaves no timer behind', () => {
    vi.useFakeTimers()
    const view = render(<InteractiveGuide open={true} onClose={() => {}} />)
    fireEvent.click(screen.getAllByRole('button', { name: /^Scoreboard$/ })[0])
    fireEvent.click(screen.getByRole('button', { name: /Recording points/ }))
    const demo = within(screen.getByText('Click the buttons to see the score update!').parentElement)
    const before = vi.getTimerCount() // the page's own, not the demo's
    fireEvent.click(demo.getByRole('button', { name: 'Point Team 1' }))
    expect(vi.getTimerCount()).toBeGreaterThan(before)
    view.unmount()
    // the button's and the score's flash went with the demo
    expect(vi.getTimerCount()).toBe(before)
  })
})
