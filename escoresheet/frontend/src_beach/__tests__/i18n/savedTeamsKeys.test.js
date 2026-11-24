import { describe, it, expect } from 'vitest'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

// Every saved teams string exists in every locale OpenBeach ships, and the
// German ones are written the Swiss way (ss, never ß).

const LOCALES = { de, 'de-CH': deCH, fr, it: it_ }
const enKeys = Object.keys(en.savedTeams || {})
const placeholders = s => (String(s).match(/\{\{\w+\}\}/g) || []).sort()

describe('savedTeams locale keys', () => {
  it('en has the namespace with the spec keys', () => {
    expect(enKeys).toEqual(expect.arrayContaining([
      'load', 'pickerTitle', 'pickerCompetition', 'pickerAll', 'pickerSearch', 'pickerEmpty', 'pickerOffline',
      'pickerPlayers', 'coach', 'replaceConfirmTitle', 'replaceConfirmBody', 'replace', 'loaded', 'incompleteTeam',
      'countryMismatch', 'suggestionTitle', 'suggestionTeam1', 'suggestionTeam2', 'loadTeam1', 'loadTeam2', 'dismiss',
      'signInNote', 'noAccessNote'
    ]))
  })

  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has every key, non-empty, with the same placeholders`, () => {
      for (const key of enKeys) {
        const v = loc.savedTeams?.[key]
        expect(typeof v, `${name} savedTeams.${key}`).toBe('string')
        expect(v.trim(), `${name} savedTeams.${key}`).not.toBe('')
        expect(placeholders(v), `${name} savedTeams.${key}`).toEqual(placeholders(en.savedTeams[key]))
      }
    })
  }

  it('no ß in de or de-CH', () => {
    for (const loc of [de, deCH]) {
      for (const v of Object.values(loc.savedTeams)) expect(v).not.toContain('ß')
    }
  })
})
