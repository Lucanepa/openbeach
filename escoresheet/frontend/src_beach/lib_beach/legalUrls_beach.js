// COPY of the openvolley repo's escoresheet/frontend/src/legal/legalUrls.js
// (the legal pages cover OpenVolley and OpenBeach). Change both;
// __tests__/lib/legalUrls.test.jsx pins the URLs. Named legalUrls, not
// legalLinks: next to a LegalLinks component the two names would differ only
// in case, which clashes on Windows/macOS file systems.

/**
 * The legal pages (privacy policy, terms of use, legal notice, open-source
 * notice) on openvolley.app, in DE/EN/FR/IT; German is the binding version.
 * The one place for these URLs in OpenBeach: Options, the sign-in dialog,
 * the referee and livescore menu, the livescore list and the scoresheet
 * archive link here (not yet the competitions admin, switched off while
 * COMPETITIONS_ENABLED is false).
 *
 * The pages are built by the openvolley_home site (legal/build.mjs, its
 * ROUTES) from the openvolley repo's escoresheet/docs/legal/<lang>/*.md.
 */

export const LEGAL_SITE = 'https://openvolley.app'

/** The documents, in the order the apps list them. */
export const LEGAL_DOCS = ['privacy', 'terms', 'impressum', 'opensource']

export const LEGAL_LANGUAGES = ['de', 'en', 'fr', 'it']

export const LEGAL_PATHS = {
  de: { privacy: '/datenschutz', terms: '/nutzungsbedingungen', impressum: '/impressum', opensource: '/open-source' },
  en: { privacy: '/en/privacy', terms: '/en/terms', impressum: '/en/imprint', opensource: '/en/open-source' },
  fr: { privacy: '/fr/confidentialite', terms: '/fr/conditions', impressum: '/fr/mentions-legales', opensource: '/fr/open-source' },
  it: { privacy: '/it/privacy', terms: '/it/condizioni', impressum: '/it/note-legali', opensource: '/it/open-source' }
}

/**
 * The language of the legal pages for an app language: de, de-CH -> de;
 * fr -> fr; it -> it; English and every other language -> en.
 */
export function legalLanguage(lng) {
  const base = String(lng || '').toLowerCase().split(/[-_]/)[0]
  return LEGAL_LANGUAGES.includes(base) ? base : 'en'
}

/** Absolute URL of one legal page in the reader's language. */
export function legalUrl(doc, lng) {
  const path = LEGAL_PATHS[legalLanguage(lng)][doc]
  if (!path) throw new Error(`unknown legal document: ${doc}`)
  return LEGAL_SITE + path
}
