/**
 * 360 px at 130 % text (OpenVolley 7ef94cdb): the Match info and Match
 * officials cards ran past the column (title, sync badge and Edit in one row
 * that never wrapped, in a grid item as wide as its content: the right border
 * and Edit cut off), and in the roster editor a player's 1 / 2, C and Clear
 * ran past the card, Clear and the name fields with them. The cards shrink
 * and their heading row wraps (only when the title cannot wrap any further);
 * a player's row wraps on a phone, the grid from sm up. jsdom lays nothing
 * out: measured in Chromium at 360x780 (100 % and 130 %), 412x915 (130 %),
 * 900x780 and 1280x800.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const setup = readFileSync(resolve(__dirname, '../../components_beach/MatchSetup_beach.jsx'), 'utf8')

describe('Match setup at large text on a phone', () => {
  it('the Match info and Match officials cards shrink, their heading row wraps', () => {
    expect(setup).toMatch(/'flex min-w-0 flex-col justify-between gap-4 rounded-xl bg-stone-50\/60 p-4 sm:p-5'/)
    expect(setup).toMatch(/cn\('flex min-w-0 flex-col justify-between gap-4 p-4 sm:p-5', SETUP_BLOCK/)
    const rows = setup.match(/<div className="mb-3 flex flex-wrap items-center justify-between gap-2">\s*<div className="flex flex-1 basis-0 items-center gap-2">/g)
    expect(rows).toHaveLength(2)
    expect(setup).not.toMatch(/<div className="mb-3 flex items-center justify-between gap-2">/)
  })

  it('a player\'s row in the roster editor wraps on a phone, a grid from sm up', () => {
    expect(setup).toMatch(/const ROSTER_ROW = 'flex flex-wrap items-center gap-2 sm:grid sm:grid-cols-\[96px_minmax\(0,1fr\)_minmax\(0,1fr\)_84px_auto\]'/)
    expect(setup.match(/className=\{cn\(ROSTER_ROW, manageDob && ROSTER_GRID_DOB, 'px-3 py-2\.5'/g)).toHaveLength(2)
    expect(setup.match(/<div className="order-2 flex flex-1 justify-end sm:order-none sm:justify-center">/g)).toHaveLength(2)
    expect(setup.match(/<div className="order-3 ml-auto sm:order-none">/g)).toHaveLength(2)
  })
})
