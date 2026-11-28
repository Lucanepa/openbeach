// The guide (Home → Guide) described INDOOR volleyball: a court of 6
// positions I to VI that rotate clockwise, 6 substitutions per set with a
// substitution demo, "TO: 0/2", a match won with 3 sets, the deciding set's
// coin toss and change of courts at 8 points, a setup mockup with 12 players.
// Beach (FIVB beach rules 2025-2028): 2 players and no positions (4.1.1,
// 7.4.1), the service order (7.6), no substitutions (15.2.2), one time-out
// per set (15.1) and the technical time-out at 21 in sets 1 and 2 (15.4.2),
// sets to 21 and 15 (6.2, 6.3.2), changes of courts every 7 / 5 points
// (18.2.1), 2 sets to win (6.3.1). And its German, French and Italian texts
// were English.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup, act } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'
import InteractiveGuide from '../../components_beach/InteractiveGuide_beach'
import { TEAM_TIMEOUT_SECONDS } from '../../utils_beach/countdownClock_beach'

const LOCALES = { en, de, 'de-CH': deCH, fr, it: it_ }
const flatten = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) =>
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]])

beforeAll(async () => {
  // jsdom has no scrolling: a section scrolls to its top when chosen
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: 'en',
    resources: Object.fromEntries(Object.entries(LOCALES).map(([lng, translation]) => [lng, { translation }]))
  })
})
afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const openSection = (name) => fireEvent.click(screen.getByRole('button', { name }))
// every section and every question open (an open section shows its questions)
const openAll = () => {
  for (let closed; (closed = document.querySelectorAll('button[aria-expanded="false"]')).length;) {
    closed.forEach(b => fireEvent.click(b))
  }
}

describe('InteractiveGuide: beach rules', () => {
  it('the court has the two players of a team, no positions', () => {
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    openSection(/Court and players/)
    expect(screen.getByText(/no fixed positions on the court/)).toBeTruthy()
    expect(screen.getAllByTestId(/^guide-court-player-/)).toHaveLength(2)
    expect(within(screen.getByTestId('guide-court-player-1')).getByTestId('guide-court-serve')).toBeTruthy()
  })

  it('the service order demo passes the serve to the other player', () => {
    vi.useFakeTimers()
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    openSection(/Service order/)
    const serves = (n) => within(screen.getByTestId(`guide-court-player-${n}`)).queryByTestId('guide-court-serve')
    expect(serves(1)).toBeTruthy()
    expect(serves(2)).toBeNull()
    act(() => { vi.advanceTimersByTime(2000 + 300) })
    expect(serves(1)).toBeNull()
    expect(serves(2)).toBeTruthy()
    act(() => { vi.advanceTimersByTime(2000 + 300) })
    expect(serves(1)).toBeTruthy()
  })

  it('sets to 21 and 15, changes of courts every 7 and 5 points, one time-out per set', () => {
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    openSection(/Sets and court switches/)
    openSection(/Set 3 \(deciding set\)/)
    openSection(/Time-outs/)
    const text = document.body.textContent
    expect(text).toContain('Sets 1 and 2 are played to 21 points')
    expect(text).toContain('change courts every 7 points')
    expect(text).toContain('Played to 15 points')
    expect(text).toContain('change courts every 5 points')
    expect(text).toContain('one time-out per set')
    expect(text).toContain('technical time-out when the two teams have 21 points together')
    // the time-out demo counts as the app (45 s, to the whistle)
    expect(screen.getAllByText(String(TEAM_TIMEOUT_SECONDS)).length).toBeGreaterThan(0)
  })

  it('no indoor rules and no substitutions anywhere in the guide', () => {
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    openAll()
    const text = document.body.textContent
    expect(text).not.toMatch(/substitut/i)
    expect(text).not.toMatch(/6 positions|I through VI|clockwise|0\/2|wins 3 sets|at 8 points|tie-break/i)
    expect(text).not.toMatch(/interactiveGuide\./)
    // the scoreboard mockups: two players a side
    expect(text).not.toMatch(/12 players|11 players/)
  })

  it('the guide has no substitution keys in any language (beach has none, 15.2.2)', () => {
    for (const [name, loc] of Object.entries(LOCALES)) {
      const keys = flatten(loc.interactiveGuide).map(([k]) => k)
      expect(keys.filter(k => /sub(stitut|Demo|sDesc|Click|Drag|LongPress|Methods)|stateSub|frontRow|backRow|onCourt|clickToSwap/i.test(k)), name).toEqual([])
    }
  })
})

describe('InteractiveGuide: translated', () => {
  // the same word in English and in that language
  const SAME = new Set(['TEAM 1', 'TEAM 2', 'Point Team 1', 'Point Team 2', 'Team A (Team 1)', 'Team B (Team 2)',
    'Dashboards', 'Desktop', 'Tablet', 'Smartphone', 'Cloud', 'Backup', 'Options',
    'Action', 'Description', 'Signatures', 'Sanctions', 'Expulsion', 'Disqualification', 'Sets', 'Point'])

  it.each(['de', 'de-CH', 'fr', 'it'])('%s: no English left', (name) => {
    const english = new Map(flatten(en.interactiveGuide))
    const left = flatten(LOCALES[name].interactiveGuide)
      .filter(([k, v]) => v === english.get(k) && !SAME.has(v))
    expect(left).toEqual([])
  })

  it.each([
    ['de', ['Aufschlagreihenfolge', 'Auszeiten', 'Sätze und Seitenwechsel', 'Satz 3 (Entscheidungssatz)'], /Timeout|Ballwechsel|Auswechslung|Captain/],
    ['fr', ['Ordre au service', 'Temps-morts', 'Sets et changements de camp', 'Set 3 (set décisif)'], /temps mort|rallye|remplacement|Timeout/],
    ['it', ['Ordine di battuta', 'Timeout', 'Set e cambi di campo', 'Set 3 (set decisivo)'], /sostituzion|Substitution/]
  ])('%s: the scoreboard section in the official terms', async (lng, terms, wrong) => {
    await i18n.changeLanguage(lng)
    render(<InteractiveGuide open={true} onClose={() => {}} />)
    openAll()
    const text = document.body.textContent
    for (const term of terms) expect(text).toContain(term)
    expect(text).not.toMatch(wrong)
    expect(text).not.toMatch(/interactiveGuide\./)
  })
})
