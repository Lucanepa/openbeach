import { describe, it, expect } from 'vitest'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

// The namespaces the volleyui / release work added or rewrote: every key is
// in all 5 locales OpenBeach ships, non-empty, with the same placeholders;
// German is written the Swiss way (ss, never ß).

const NAMESPACES = ['corrections', 'matchEnd', 'manualAdjustmentsEditor', 'app', 'restorePreview', 'update', 'appLifecycle', 'options', 'supportFeedback', 'connection', 'scoreboard.manual', 'scoreboard.sanctionConfirm', 'scoreboard.tto', 'scoreboard.editPin', 'scoreboard.sanctions', 'account', 'alert', 'startupConnectivity', 'syncBanner']
const LOCALES = { de, 'de-CH': deCH, fr, it: it_ }
const placeholders = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort()

const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

const flatten = (obj, prefix = '') => Object.entries(obj || {}).flatMap(([k, v]) =>
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]])


describe.each(NAMESPACES)('locale keys: %s', (ns) => {
  const enKeys = flatten(get(en, ns), `${ns}.`)

  it('exists in English', () => {
    expect(enKeys.length).toBeGreaterThan(0)
  })

  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has every key with the same placeholders`, () => {
      for (const [key, enValue] of enKeys) {
        const v = get(loc, key)
        expect(typeof v, `${name} ${key}`).toBe('string')
        expect(v.trim(), `${name} ${key}`).not.toBe('')
        expect(placeholders(v), `${name} ${key}`).toEqual(placeholders(enValue))
      }
    })
  }

  it('no ß in German', () => {
    for (const loc of [de, deCH]) {
      for (const [, v] of flatten(get(loc, ns))) expect(v).not.toContain('ß')
    }
  })
})

