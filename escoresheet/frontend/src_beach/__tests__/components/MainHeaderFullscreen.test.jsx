import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../../i18n_beach/locales/en.json'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import MainHeader from '../../components_beach/MainHeader_beach'

// Fullscreen was a row at the bottom of the header menu: two taps, and on a
// tablet the menu covers the court. It is now a button in the bar next to the
// menu (pressed while fullscreen), and the menu no longer lists it.
// (OpenVolley f191fe09.)

beforeAll(async () => {
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: { en: { translation: en } } })
})

afterEach(() => {
  delete window.__TAURI_INTERNALS__
})

function renderHeader(props = {}) {
  const toggleFullscreen = vi.fn()
  render(
    <ScaleProvider>
      <MainHeader
        connectionStatuses={{}}
        connectionDebugInfo={{}}
        isFullscreen={false}
        toggleFullscreen={toggleFullscreen}
        offlineMode
        setOfflineMode={() => {}}
        {...props}
      />
    </ScaleProvider>
  )
  return { toggleFullscreen }
}

describe('header fullscreen button', () => {
  it('one tap in the bar, not a menu row', () => {
    const { toggleFullscreen } = renderHeader()
    const button = screen.getByRole('button', { name: 'Fullscreen' })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(button)
    expect(toggleFullscreen).toHaveBeenCalledTimes(1)
  })

  it('pressed while fullscreen, named for leaving it', () => {
    renderHeader({ isFullscreen: true })
    expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sits right before the menu button, and the menu no longer lists it', () => {
    renderHeader()
    const menuButton = screen.getByRole('button', { name: 'Menu' })
    const fullscreen = screen.getByTestId('header-fullscreen')
    // the fullscreen button comes right before the menu in the bar
    expect(fullscreen.compareDocumentPosition(menuButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(menuButton)
    // the open menu panel (its version line is always there)
    const menu = screen.getByTestId('header-version').parentElement
    expect(within(menu).getByText(`v${__APP_VERSION__}`)).toBeInTheDocument()
    expect(within(menu).queryByText('Fullscreen')).toBeNull()
    expect(within(menu).queryByText('Exit fullscreen')).toBeNull()
  })
})
