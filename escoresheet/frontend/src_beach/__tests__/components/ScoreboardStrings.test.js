import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// The scoring screen's dialogs carried hard-coded English in Title Case
// ("Apply Delay Warning to Team A?" with a green Yes / No, "Manual Changes
// Summary" with ⚡ and ▼ text chevrons, "Edit Referee PIN", "Technical
// Timeout"...). They go through t() now, with verb buttons and lucide icons.

const src = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')

describe('Scoreboard_beach strings', () => {
  it('no hard-coded Title Case dialog texts left', () => {
    for (const literal of [
      'Apply {sanctionConfirm', '                  Manual Changes Summary\n', 'Do you want to undo action?', 'Current Set\n', 'Score &amp; Sets', 'Match Settings\n', 'Event History\n',
      'Add Event\n', '>Improper Req<', '>Rally Start<', "'Edit Referee PIN'",
      'title="Technical Timeout"', 'Technical Timeout at 21', '`Time-out — ', '`Timeouts - ', '<h3>Remarks</h3>',
      'Improper Request:<', '>Yes<', '                Yes\n', '                No\n'
    ]) {
      expect(src, literal).not.toContain(literal)
    }
  })

  it('no emoji or text chevrons as icons', () => {
    expect(src).not.toMatch(/[⚡▼▲]/)
  })

  it('the sanction confirm: Cancel on the left, a verb on the right', () => {
    const block = src.slice(src.indexOf('data-testid="sanction-confirm"'), src.indexOf('data-testid="sanction-confirm"') + 900)
    expect(block.indexOf("t('common.cancel')")).toBeGreaterThan(0)
    expect(block.indexOf("t('common.cancel')")).toBeLessThan(block.indexOf('scoreboard.sanctionConfirm.${kind}Confirm'))
  })

  it('the dead help modal (never opened, English only) is gone', () => {
    expect(src).not.toContain('getHelpContent')
    expect(src).not.toContain('showHelpModal')
  })
})
