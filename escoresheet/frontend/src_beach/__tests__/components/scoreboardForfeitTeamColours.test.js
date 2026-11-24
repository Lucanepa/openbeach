/**
 * "Which team is forfeiting?": each button wears its team's colour with the
 * shared readable text (teamBoxStyle), not white on any colour (a white or
 * yellow team's name disappeared), and with no colour stored team 1 is red
 * and team 2 blue, as on the court (they were swapped). Scoreboard_beach.jsx
 * is too large to mount, so the source is checked for the wiring.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')

describe('the forfeit team buttons', () => {
  const start = sb.indexOf("'Which team is forfeiting?'")
  const block = sb.slice(start, sb.indexOf('</Modal>', start))

  it('take the team colour the court shows, with the shared text rule', () => {
    expect(start).toBeGreaterThan(-1)
    expect(block).toContain("...teamBoxStyle(effectiveTeamColour('team1', data?.team1Team, data?.match))")
    expect(block).toContain("...teamBoxStyle(effectiveTeamColour('team2', data?.team2Team, data?.match))")
  })

  it('write no fixed white text on the team colour', () => {
    expect(block).not.toMatch(/color: '#fff'/)
    expect(block).not.toMatch(/team1Team\?\.color \|\| '#3b82f6'/)
  })
})
