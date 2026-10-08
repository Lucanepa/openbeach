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
