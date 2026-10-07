import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import en from '../../i18n_beach/locales/en.json'
import de from '../../i18n_beach/locales/de.json'
import deCH from '../../i18n_beach/locales/de-CH.json'
import fr from '../../i18n_beach/locales/fr.json'
import it_ from '../../i18n_beach/locales/it.json'

// Every t('ns.key') a screen calls exists in all 5 locales OpenBeach ships
// (ServerConnectionScreen_beach showed raw connection.* keys once).

const LOCALES = { en, de, 'de-CH': deCH, fr, it: it_ }
const get = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj)

const SCREENS = [
  'components_beach/ServerConnectionScreen_beach.jsx',
  'components_beach/StartupConnectivityModal_beach.jsx',
  'LivescoreApp_beach.jsx'
]

function keysOf(file) {
  const src = readFileSync(resolve(__dirname, '../..', file), 'utf8')
  const keys = new Set()
  for (const m of src.matchAll(/\bt\(\s*['`]([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)['`]/g)) keys.add(m[1])
  return [...keys]
}

describe.each(SCREENS)('%s', (file) => {
  const keys = keysOf(file)

  it('calls translated keys', () => {
    expect(keys.length).toBeGreaterThan(0)
  })

  for (const [name, loc] of Object.entries(LOCALES)) {
    it(`${name} has every key`, () => {
      const missing = keys.filter((k) => {
        const v = get(loc, k)
        // a plural key lives as key_one / key_other
        return typeof v !== 'string' && typeof get(loc, `${k}_other`) !== 'string'
      })
      expect(missing).toEqual([])
    })
  }
})
