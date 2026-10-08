import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LEGAL_DOCS, LEGAL_LANGUAGES, LEGAL_PATHS, LEGAL_SITE, legalLanguage, legalUrl } from '../../lib_beach/legalUrls_beach'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

// The legal pages on openvolley.app cover OpenVolley and OpenBeach; OpenBeach
// links the same URLs (a copy of openvolley's src/legal/legalUrls.js).

// The app language under test; t() reads the English strings.
let language = 'en'
const lookup = (key) => key.split('.').reduce((o, k) => o?.[k], en)
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key) => lookup(key) ?? key, i18n: { language, resolvedLanguage: language } })
}))

const { default: LegalLinks, LegalLink } = await import('../../components_beach/LegalLinks_beach')

describe('legal page URLs', () => {
  it('has a page for every document in every language, under openvolley.app', () => {
    expect(LEGAL_SITE).toBe('https://openvolley.app')
    expect(LEGAL_DOCS).toEqual(['privacy', 'terms', 'impressum', 'opensource'])
    for (const lang of LEGAL_LANGUAGES) {
      expect(Object.keys(LEGAL_PATHS[lang]).sort()).toEqual([...LEGAL_DOCS].sort())
    }
    const all = LEGAL_LANGUAGES.flatMap((l) => Object.values(LEGAL_PATHS[l]))
    expect(new Set(all).size).toBe(all.length)
  })

  it('pins the same URLs as OpenVolley (openvolley_home legal/build.mjs ROUTES)', () => {
    const table = {
      de: ['/datenschutz', '/nutzungsbedingungen', '/impressum', '/open-source'],
      en: ['/en/privacy', '/en/terms', '/en/imprint', '/en/open-source'],
      fr: ['/fr/confidentialite', '/fr/conditions', '/fr/mentions-legales', '/fr/open-source'],
      it: ['/it/privacy', '/it/condizioni', '/it/note-legali', '/it/open-source']
    }
    for (const [lng, paths] of Object.entries(table)) {
      expect(LEGAL_DOCS.map((doc) => legalUrl(doc, lng))).toEqual(paths.map((p) => `https://openvolley.app${p}`))
    }
  })

  it('maps the app languages: de-CH to German, unknown languages to English', () => {
    expect(legalLanguage('de-CH')).toBe('de')
    expect(legalLanguage('de')).toBe('de')
    expect(legalLanguage('fr-CH')).toBe('fr')
    expect(legalLanguage('it')).toBe('it')
    expect(legalLanguage('en')).toBe('en')
    expect(legalLanguage('rm')).toBe('en')
    expect(legalLanguage(undefined)).toBe('en')
    expect(() => legalUrl('cookies', 'en')).toThrow(/unknown legal document/)
  })
})

describe('legal strings', () => {
  it('every locale names the four pages, German the Swiss way', () => {
    for (const [lng, data] of Object.entries({ en, de, 'de-CH': deCH, fr, it: it_ })) {
      for (const key of ['nav', ...LEGAL_DOCS]) expect(data.legal?.[key], `${lng}.${key}`).toBeTruthy()
    }
    expect(JSON.stringify(deCH.legal)).not.toMatch(/ß/)
    expect(de.legal.privacy).toBe('Datenschutzerklärung')
    expect(fr.legal.impressum).toBe('Mentions légales')
    expect(it_.legal.terms).toBe('Condizioni d’uso')
  })
})

describe('LegalLinks', () => {
  it('links the pages in the app language, opening in the browser', () => {
    language = 'de-CH'
    render(<LegalLinks />)
    const links = [...screen.getByTestId('legal-links').querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://openvolley.app/datenschutz',
      'https://openvolley.app/nutzungsbedingungen',
      'https://openvolley.app/impressum',
      'https://openvolley.app/open-source'
    ])
    expect(links.map((a) => a.textContent)).toEqual(['Privacy policy', 'Terms of use', 'Legal notice', 'Open-source notice'])
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a.getAttribute('rel')).toMatch(/noopener/)
    }
    expect(screen.getByRole('navigation', { name: 'Legal' })).toBeInTheDocument()
  })

  it('falls back to English for other languages and lists only the pages asked for', () => {
    language = 'es'
    render(<LegalLinks docs={['privacy', 'impressum']} />)
    const hrefs = [...screen.getByTestId('legal-links').querySelectorAll('a')].map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['https://openvolley.app/en/privacy', 'https://openvolley.app/en/imprint'])
  })

  it('LegalLink takes its own words', () => {
    language = 'it'
    render(<LegalLink doc="privacy">informativa</LegalLink>)
    expect(screen.getByRole('link', { name: 'informativa' })).toHaveAttribute('href', 'https://openvolley.app/it/privacy')
  })
})
