import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import en from '../../i18n_beach/locales/en.json'

// Owner 2026-11-10: "Made by Swiss referees" under the logo on Home.
const lookup = (key) => key.split('.').reduce((o, k) => o?.[k], en)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, fallback) => {
      const v = lookup(key)
      if (typeof v === 'string') return v
      return typeof fallback === 'string' ? fallback : key
    },
    i18n: { language: 'en', resolvedLanguage: 'en' }
  })
}))
vi.mock('../../components_beach/SupportFeedbackModal_beach', () => ({ default: () => null }))

const { default: HomePage } = await import('../../components_beach/pages/HomePage_beach')

describe('HomePage: who makes it', () => {
  it('says "Made by Swiss referees" right under the logo', () => {
    render(<HomePage newMatchMenuOpen={false} setNewMatchMenuOpen={() => {}} />)
    const line = screen.getByTestId('made-by')
    expect(line).toHaveTextContent('Made by Swiss referees')
    expect(line.previousElementSibling.querySelector('img')).toHaveAttribute('alt', 'OpenBeach')
    expect(line.nextElementSibling).not.toBeNull()
  })
})
