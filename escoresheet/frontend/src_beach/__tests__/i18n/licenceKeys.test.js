// Owner 19.11.2026: the value beside a name is the licence (a date of birth
// still works, typed with dots). Every locale says "Licence" with the hint
// "or date of birth (dd.mm.yyyy)", and the old date-of-birth labels are gone.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

const LOCALES = { en, de, 'de-CH': deCH, fr, it: it_ }
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

const REMOVED = [
  'roster.dob', 'roster.dateOfBirth', 'rosterSetup.dob', 'matchSetup.dateOfBirth', 'matchSetup.dateOfBirthPlaceholder',
  'auth.dob', 'modal.birthdateWarning', 'matchSetup.modals.reviewVerifyDob', 'validation.invalidBirthdate',
  'options.manageDob', 'options.manageDobInfo', 'account.saveName'
]

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return ['__tests__', 'i18n_beach', 'node_modules'].includes(name) ? [] : sources(p)
    return /\.(jsx?|tsx?)$/.test(name) ? [p] : []
  })
}

describe('licence wording', () => {
  it('English: "Licence", the hint names the date form', () => {
    expect(en.licence).toEqual({ label: 'Licence', hint: 'or date of birth (dd.mm.yyyy)', placeholder: 'Licence or dd.mm.yyyy' })
    expect(en.options.manageLicence).toBe('Licence numbers')
  })

  it('each locale has its own words, the date form in its letters', () => {
    expect(de.licence.label).toBe('Lizenz')
    expect(deCH.licence.label).toBe('Lizenz')
    expect(fr.licence.label).toBe('Licence')
    expect(it_.licence.label).toBe('Licenza')
    expect(de.licence.hint).toMatch(/TT\.MM\.JJJJ/)
    expect(fr.licence.hint).toMatch(/jj\.mm\.aaaa/)
    expect(it_.licence.hint).toMatch(/gg\.mm\.aaaa/)
  })

  it('the account licence and the placeholder check are in every locale', () => {
    for (const [name, loc] of Object.entries(LOCALES)) {
      for (const key of ['account.licence', 'account.licenceHint', 'account.licenceInvalid', 'account.save', 'validation.placeholderLicence', 'options.manageLicenceInfo']) {
        expect(typeof get(loc, key), `${name} ${key}`).toBe('string')
      }
      expect(get(loc, 'account.licenceInvalid'), name).toMatch(/4/)
    }
  })

  it('the old date-of-birth keys are gone from every locale and from the code', () => {
    for (const [name, loc] of Object.entries(LOCALES)) {
      for (const key of REMOVED) expect(get(loc, key), `${name} ${key}`).toBeUndefined()
    }
    const root = resolve(__dirname, '../..')
    const code = [...sources(root), ...sources(resolve(root, '../scoresheet_pdf_beach'))].map(f => readFileSync(f, 'utf8')).join('\n')
    for (const key of REMOVED) expect(code, key).not.toContain(`'${key}'`)
  })
})
