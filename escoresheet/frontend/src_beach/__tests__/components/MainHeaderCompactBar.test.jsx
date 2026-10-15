// The header's compact bar: icons without words and the short match chip.
// Below 720 px (openbeach#5: at 640-800 px the chip covered the alarm bell and
// the tablet status), and wider where the full bar was measured not to fit
// (2026-10-15, Chromium: "Se connecter pour synchroniser" with the referee
// tablet on put "Sign in" under the match chip and ran the bar past the right
// edge at 720-760 px). jsdom has no layout, so the last tests stub the bar's
// and the right group's boxes, and the ResizeObserver.
// (OpenVolley the same, openvolley#20.)
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import MainHeader from '../../components_beach/MainHeader_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

const realWidth = window.innerWidth
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: w })
afterEach(() => {
  setWidth(realWidth)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const match = { id: 1, gameNumber: 402397, gamePin: '578487' }
const headerEl = (connectionStatuses = {}) => (
  <ScaleProvider>
    <MainHeader
      connectionStatuses={connectionStatuses}
      connectionDebugInfo={{}}
      matchStatus={{ match }}
      currentOfficialMatch={match}
      matchInfoMenuOpen={false}
      setMatchInfoMenuOpen={() => {}}
      isFullscreen={false}
      toggleFullscreen={() => {}}
      offlineMode
      setOfflineMode={() => {}}
    />
  </ScaleProvider>
)
const header = () => render(headerEl())
const switchWord = () => screen.getByRole('switch').querySelector('.sr-only')

describe('the header bar', () => {
  it('keeps its words from 720 px', () => {
    setWidth(720)
    header()
    expect(switchWord()).toBeNull()
    expect(screen.getByText('Match #402397')).toBeInTheDocument()
  })

  it('is the compact bar below 720 px (an upright 7" tablet)', () => {
    setWidth(640)
    header()
    expect(switchWord()).toHaveTextContent('Offline')
    expect(screen.getByRole('button', { name: 'Match #402397' })).toHaveTextContent('#402397')
    expect(screen.queryByText('Match #402397')).toBeNull()
  })

  // A group shrunk to its min-content let "Sign in" spill out of it over the
  // chip while the group itself stayed inside the bar (760 px, long status)
  it('its two groups share the room but never get narrower than their controls', () => {
    setWidth(1024)
    const { container } = header()
    const kids = [...container.querySelector('[data-diag="header"]').children]
    for (const group of [kids[0], kids[kids.length - 1]]) {
      expect(group.style.flex).toBe('1 1 0px')
      expect(group.style.minWidth).toBe('max-content')
    }
  })

  it('turns compact where the full bar does not fit: its right group ends past the bar', () => {
    setWidth(900)
    stubBoxes(() => 950)
    header()
    expect(switchWord()).toHaveTextContent('Offline')
    expect(screen.queryByText('Match #402397')).toBeNull()
  })

  it('turns compact when a group grows later (Connecting -> Sign in to sync)', () => {
    setWidth(900)
    let rightEnd = 880
    stubBoxes(() => rightEnd)
    const resized = stubResizeObserver()
    header()
    expect(switchWord()).toBeNull()
    rightEnd = 950
    act(() => resized())
    expect(switchWord()).toHaveTextContent('Offline')
  })

  it('tries the full bar again when what it says changes (a shorter status)', () => {
    setWidth(900)
    let rightEnd = 950
    stubBoxes(() => rightEnd)
    const { rerender } = render(headerEl({ api: 'connecting' }))
    expect(switchWord()).toHaveTextContent('Offline')
    rightEnd = 880
    rerender(headerEl({ api: 'connected' }))
    expect(switchWord()).toBeNull()
    expect(screen.getByText('Match #402397')).toBeInTheDocument()
  })
})

// The bar 900 px wide, its right group ending at rightEnd()
function stubBoxes(rightEnd) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const bar = this.dataset?.diag === 'header'
    const right = this.parentElement?.dataset?.diag === 'header' && !this.nextElementSibling
    const r = bar ? 900 : right ? rightEnd() : 0
    return { left: 0, top: 0, right: r, bottom: 40, width: r, height: 40, x: 0, y: 0, toJSON: () => ({}) }
  })
}

// A ResizeObserver whose callbacks the test calls: returns "the groups resized"
function stubResizeObserver() {
  const callbacks = new Set()
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { this.cb = cb }
    observe() { callbacks.add(this.cb) }
    unobserve() {}
    disconnect() { callbacks.delete(this.cb) }
  })
  return () => { for (const cb of [...callbacks]) cb([]) }
}
