// The app header on the scoring screen's phone layout: folded away from its
// first frame (startCollapsed), so the phone layout fills the screen without
// the header showing for a frame and the layout jumping up by its height.
// (OpenVolley feat/phone-scorer, a411fe73.)
import { describe, it, expect, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import MainHeader from '../../components_beach/MainHeader_beach'

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

const props = { connectionStatuses: {}, connectionDebugInfo: {}, isFullscreen: false, toggleFullscreen: () => {}, offlineMode: true, setOfflineMode: () => {}, matchId: 1, collapsible: true }
const header = (extra = {}) => <ScaleProvider><MainHeader {...props} {...extra} /></ScaleProvider>
// The thin bar that opens the folded header again
const foldedBar = () => screen.queryByRole('button', { name: 'Show header' })

describe('MainHeader_beach startCollapsed (phone scoring layout)', () => {
  it('is folded in the first commit, and its thin bar opens it', () => {
    render(header({ startCollapsed: true }))
    expect(foldedBar()).toBeTruthy()
    fireEvent.click(foldedBar())
    expect(foldedBar()).toBeNull()
  })

  it('the desktop / tablet header starts open', () => {
    render(header())
    expect(foldedBar()).toBeNull()
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
  })
})
