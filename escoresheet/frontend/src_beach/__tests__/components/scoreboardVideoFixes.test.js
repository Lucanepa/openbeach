/**
 * Fixes from the owner's OpenBeach screencast of 2026-10-08 (batch VS).
 * Scoreboard_beach.jsx is too large to mount for every case, so most checks
 * read the source for the wiring; the pure rules are unit tested.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
const css = readFileSync(resolve(__dirname, '../../styles_beach.css'), 'utf8')
const between = (src, from, to) => {
  const start = src.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const end = src.indexOf(to, start + from.length)
  expect(end, to).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('issue 1: the player / sanction / medical menu keeps one size', () => {
  for (const name of ['rollDown', 'rollUp']) {
    it(`${name} ends at the resting transform, with no scale`, () => {
      const kf = between(css, `@keyframes ${name} {`, '\n}\n')
      expect(kf).not.toMatch(/scale\(/)
      expect(kf).toMatch(/to\s*\{[^}]*transform:\s*none/)
    })
  }

  it('the roll wrappers do not set a scaling transform origin', () => {
    const rules = between(css, '.modal-wrapper-roll-down>div {', '@media (prefers-reduced-motion')
    expect(rules).not.toContain('transform-origin')
  })

  it('all three menus use the readable popover size', () => {
    expect(sb).toMatch(/data-player-action-menu\s+className="sb-popover"/)
    expect(sb).toMatch(/data-sanction-dropdown\s+className="sb-popover"/)
    expect(sb).toMatch(/data-medical-dropdown\s+className="sb-popover"/)
    const rule = between(css, '.sb-popover button {', '}')
    expect(rule).toContain('min-height: 44px')
    expect(rule).toMatch(/font-size: max\(15px, calc\(17px \* var\(--scale-factor, 1\)\)\)/)
  })

  it('hovering a menu item does not grow it', () => {
    const menu = between(sb, 'data-player-action-menu', '{sanctionDropdown && (')
    expect(menu).not.toContain("scale(1.02)")
  })
})

describe('issue 2: "Switch sides" in the set interval', () => {
  it('the interval preview uses the same rule as the started set, not team1BenchSide', () => {
    const memo = between(sb, 'const leftisTeam1 = useMemo(() => {', '// Calculate sets won by each team')
    expect(memo).not.toContain('team1BenchSide')
    expect(memo).toContain('isTeam1LeftInSet(data.set.index, data.match)')
  })

  it('the button toggles the side the preview shows', () => {
    const h = between(sb, 'const handleBetweenSetsSwitchSides = useCallback', '// Switch which team serves first')
    expect(h).toContain('switchSidesUpdate(data.set.index, data.match, { beforeSetStart: true })')
    expect(h).not.toMatch(/setIndex % 2 === 1 \? 'A' : 'B'/)
  })

  it('no court switch path keeps its own "default side" (set 2 = B left)', () => {
    expect(sb).not.toMatch(/currentLeftTeam = setIndex % 2 === 1 \? 'A' : 'B'/)
    expect(sb).not.toMatch(/currentLeftAB = setIdx % 2 === 1 \? 'A' : 'B'/)
  })

  it('set 2 is created on the side set 1 finished on; set 3 defaults to the side set 2 finished on', () => {
    const end = between(sb, 'const newSetIndex = setIndex + 1', '// Check if a set with this index already exists')
    expect(end).toContain('leftTeamInSet(2, await db.matches.get(matchId))')
    expect(sb).toContain('const sides = nextSetStartSides(2, sidesMatch)')
  })
})
