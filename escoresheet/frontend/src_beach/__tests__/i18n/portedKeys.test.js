import { describe, it, expect } from 'vitest'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

// Keys ported from OpenVolley with its fixes (the kit date and time pickers,
// Re-sign / Clear at the match end, the match PIN dialog): in all 5 locales,
// non-empty, the same placeholders as English, and German written the Swiss
// way (ss, never ß).

const KEYS = [
  'picker',
  'matchEnd.resign', 'matchEnd.clearSignature', 'matchEnd.signatureLocked', 'matchEnd.signatureSaveFailed',
  'matchSetup.matchPinTitle', 'matchSetup.matchPinLabel', 'matchSetup.enterPinPrompt'
]
const LOCALES = { en, de, 'de-CH': deCH, fr, it: it_ }
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)
const placeholders = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort()
const flatten = (value, prefix) => (value && typeof value === 'object'
  ? Object.entries(value).flatMap(([k, v]) => flatten(v, `${prefix}.${k}`))
  : [[prefix, value]])

describe.each(KEYS)('ported keys: %s', (key) => {
  const enKeys = flatten(get(en, key), key)

  it('exists in English', () => {
    expect(enKeys.length).toBeGreaterThan(0)
  })

  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has every key with the same placeholders`, () => {
      for (const [k, enValue] of enKeys) {
        const v = get(loc, k)
        expect(typeof v, `${name} ${k}`).toBe('string')
        expect(v.trim(), `${name} ${k}`).not.toBe('')
        expect(placeholders(v), `${name} ${k}`).toEqual(placeholders(enValue))
        if (name.startsWith('de')) expect(v, `${name} ${k}`).not.toContain('ß')
      }
    })
  }
})
