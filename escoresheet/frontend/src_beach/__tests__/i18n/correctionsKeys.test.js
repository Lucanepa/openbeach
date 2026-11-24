import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import en from '../../i18n_beach/locales/en.json'
import { ERROR_DEFAULTS, NOTE_DEFAULTS, ADDABLE_SANCTIONS, MISCONDUCT_SANCTIONS, TEAM_SANCTIONS } from '../../utils_beach/corrections_beach'

// Every corrections.* key the beach corrections ask for (tr(t, 'corrections.x', ...),
// and the error / note / sanction keys built from their names) is in en.json
// with the same English text; localeParity.test.js checks the other 4 locales.

const FILES = [
  'utils_beach/corrections_beach.js',
  'components_beach/corrections/CorrectionsPanel_beach.jsx',
  'components_beach/corrections/forms_beach.jsx',
  'components_beach/corrections/shared_beach.jsx',
  'components_beach/ManualAdjustments_beach.jsx'
]
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

describe('corrections locale keys', () => {
  it('every key called with a default is in en.json with that text', () => {
    const missing = []
    for (const file of FILES) {
      const src = readFileSync(resolve(__dirname, '../..', file), 'utf8')
      for (const m of src.matchAll(/\btr?\(\s*(?:[\w?.]+\s*,\s*)?'(corrections\.[\w.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)) {
        const value = get(en, m[1])
        if (value !== m[2].replace(/\\'/g, "'")) missing.push(`${file}: ${m[1]}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('the errors, notes and sanctions built from their names are there', () => {
    for (const [k, v] of Object.entries(ERROR_DEFAULTS)) expect(get(en, `corrections.error.${k}`)).toBe(v)
    for (const [k, v] of Object.entries(NOTE_DEFAULTS)) expect(get(en, `corrections.note.${k}`)).toBe(v)
    for (const type of new Set([...ADDABLE_SANCTIONS, ...MISCONDUCT_SANCTIONS, ...TEAM_SANCTIONS])) {
      expect(typeof get(en, `corrections.sanction.${type}`)).toBe('string')
    }
  })
})
