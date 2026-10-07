import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Scoring actions were below 44 px: at 1024×600 TO 69×26, Undo 67×22,
// "Improper request" / "Delay warning" 178×20, Point A/B ~76×50, because the
// rally controls are scaled down with the screen and the team-column
// buttons sized by it. Measured after the fix (Playwright, 1024×600 and
// 1280×800): TO / BMP 48, sanctions 44, Undo 51, points 128×50 / 128×62.
// jsdom has no layout, so this pins the floors in the source.

const src = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
const css = readFileSync(resolve(__dirname, '../../styles_beach.css'), 'utf8')

describe('scoring touch targets', () => {
  it('the rally controls never scale below 0.85', () => {
    expect(src).toMatch(/const RALLY_MIN_SCALE = 0\.85/)
    expect(src).toContain('transform: `scale(${Math.max(scaleFactor, RALLY_MIN_SCALE)})`')
    expect(src).not.toContain("transform: `scale(${scaleFactor})`, transformOrigin: 'center center', gap: '6px'")
  })

  it('team-column TO / BMP and sanctions have a 44-48 px floor', () => {
    expect(src).not.toContain('height: `${DESIGN_VMIN * 0.045 * scaleFactor}px`')
    expect(src).not.toContain('height: `${DESIGN_VMIN * 0.028 * scaleFactor}px`')
    expect(src.match(/height: `max\(48px, \$\{DESIGN_VMIN \* 0\.045/g)).toHaveLength(4)
    expect(src.match(/height: `max\(44px, \$\{DESIGN_VMIN \* 0\.028/g).length).toBeGreaterThanOrEqual(6)
  })

  it('rally buttons, Undo and the points have minimum sizes', () => {
    expect(src).toMatch(/const SB_RALLY_BASE = `inline-flex min-h-12 /)
    expect(src).toContain("minHeight: 'max(52px, calc(60px * var(--scale-factor, 1)))'")
    expect(src.match(/minHeight: `\$\{Math\.max\(58, 110 \* scaleFactor\)\}px`/g)).toHaveLength(2)
    expect(css).toContain('min-height: max(64px, calc(92px * var(--scale-factor)))')
  })
})
