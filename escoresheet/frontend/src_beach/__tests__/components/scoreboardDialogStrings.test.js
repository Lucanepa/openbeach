// The scoring screen's confirm dialogs answered in English in every language:
// Confirm / Cancel of the time-out request, the sanction, the expulsion, the
// BMP outcome, the decision change and the set start time, "Yes, Reopen",
// Close, and "Confirm time-out request?" (OpenVolley 4b281c0e: the undo and
// substitution dialogs' Yes / Cancel). They go through t() now.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const src = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
const locale = (l) => JSON.parse(readFileSync(resolve(__dirname, `../../i18n_beach/locales/${l}.json`), 'utf8'))

describe('Scoreboard_beach dialog strings', () => {
  it('no button or question of a dialog is an English literal', () => {
    for (const literal of ['Cancel', 'Confirm', 'Close', 'Yes, Reopen', 'Confirm time-out', 'Confirm time-out request?']) {
      expect(src).not.toMatch(new RegExp(`\\n\\s*${literal.replace(/[?]/g, '\\$&')}\\n`))
    }
    expect(src).toMatch(/\{t\('scoreboard\.modals\.confirmTimeoutRequest'\)\}/)
  })

  it('every key they use is in all five locales', () => {
    for (const l of ['en', 'de', 'de-CH', 'fr', 'it']) {
      const d = locale(l)
      expect(d.scoreboard.modals.confirmTimeoutRequest, l).toBeTruthy()
      expect(d.scoreboard.buttons.confirmTimeout, l).toBeTruthy()
      expect(d.matchEnd.yesReopen, l).toBeTruthy()
      for (const k of ['cancel', 'confirm', 'close']) expect(d.common[k], `${l} common.${k}`).toBeTruthy()
    }
    expect(locale('de').scoreboard.modals.confirmTimeoutRequest).toBe('Timeout-Anfrage bestätigen?')
  })
})
