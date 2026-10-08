import { Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../ui/volleyui/cn.js'
import { LEGAL_DOCS, legalUrl } from '../lib_beach/legalUrls_beach'

/**
 * Links to the legal pages on openvolley.app (they cover OpenVolley and
 * OpenBeach) in the reader's language (de/de-CH -> German, fr, it, everything
 * else English); German is binding. Plain external links, like "Create
 * account" in the sign-in dialog: the desktop app opens them in the system
 * browser, the Android WebView hands other hosts to the browser.
 * (Port of openvolley src/legal/LegalLinks.jsx; OpenBeach has no in-app
 * sign-up, so no LegalSentence.)
 */

export const LEGAL_LINK_CLASS = 'whitespace-nowrap underline decoration-stone-300 underline-offset-2 transition-colors hover:text-stone-800 hover:decoration-stone-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 focus-visible:ring-offset-1 rounded-sm'

/** The language of the open app, also where tests mock useTranslation without i18n. */
function useLegalLanguage() {
  const { i18n } = useTranslation()
  return i18n?.resolvedLanguage || i18n?.language || 'en'
}

export function LegalLink({ doc, className, children }) {
  const { t } = useTranslation()
  const lng = useLegalLanguage()
  return (
    <a href={legalUrl(doc, lng)} target="_blank" rel="noopener noreferrer" className={cn(LEGAL_LINK_CLASS, className)}>
      {children ?? t(`legal.${doc}`)}
    </a>
  )
}

/**
 * "Privacy policy · Terms of use · Legal notice · Open-source notice".
 * docs: which pages, in that order (default all four).
 */
export default function LegalLinks({ docs = LEGAL_DOCS, className, linkClassName, ...rest }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('legal.nav')} data-testid="legal-links" className={cn('text-xs leading-relaxed text-stone-500', className)} {...rest}>
      {docs.map((doc, i) => (
        <Fragment key={doc}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <LegalLink doc={doc} className={linkClassName} />
        </Fragment>
      ))}
    </nav>
  )
}
