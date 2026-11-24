// The header menu stayed open, sharp above the match-end export modal, with
// "Quit OpenBeach…" pressable (video 08:26-08:40). A press anywhere else now
// closes it; inside it stays open.
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

describe('header menu', () => {
  it('closes on a press outside it, stays open on a press inside', () => {
    render(
      <ScaleProvider>
        <MainHeader connectionStatuses={{}} connectionDebugInfo={{}} isFullscreen={false} toggleFullscreen={() => {}} offlineMode setOfflineMode={() => {}} />
        <button type="button">Confirm and approve</button>
      </ScaleProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const version = screen.getByTestId('header-version')
    fireEvent.pointerDown(version)
    expect(screen.getByTestId('header-version')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Confirm and approve' }))
    expect(screen.queryByTestId('header-version')).toBeNull()
  })
})
