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

  it('opening Sanction does not move the menu: anchored by its top, not centred', () => {
    const menu = between(sb, '{playerActionMenu && (() => {', '// Get available substitutes for this player')
    expect(menu).not.toContain("transform: 'translateY(-50%)'")
    expect(menu).toContain('top: `${menuTop(playerActionMenu.y)}px`')
    for (const key of ['{sanctionDropdown && (() => {', '{injuryDropdown && (() => {']) {
      const block = between(sb, key, 'return (')
      expect(block).not.toContain("transform: 'translateY(-50%)'")
      expect(block).toContain('clampedMenuTop(')
    }
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
    expect(h).toMatch(/switchSidesUpdate\(setIndex, match, \{ beforeSetStart: true \}\)/)
    // from the stored match (behaviour: ScoreboardIntervalSides.test.jsx)
    expect(h).toContain('await db.matches.get(matchId)')
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

describe('issue 5: "Referee BMP" button and dialog', () => {
  it('the in-rally row has one sizing rule, one-line labels and even gaps', () => {
    const rule = between(sb, 'function rallyRowButton(scaleFactor, kind) {', '\n}\n')
    expect(rule).toContain("whiteSpace: 'nowrap'")
    expect(rule).toContain('minHeight: `${Math.max(58, 110 * scaleFactor)}px`')
    const row = between(sb, 'data-testid="rally-row"', '{/* Undo + Decision Change')
    expect(row.match(/style=\{rallyRowButton\(scaleFactor, '(side|point)'\)\}/g)).toHaveLength(4)
    expect(row).not.toMatch(/margin(Left|Right): '30px'/)
    expect(row).not.toContain("fontSize: '17px'")
  })

  it('the dialog\'s three choices shrink inside it, the teams in their colours', () => {
    const style = between(sb, 'const bmpChoiceButton = {', '}\n')
    expect(style).toContain("flex: '1 1 0'")
    expect(style).toContain('minWidth: 0')
    expect(style).toContain("overflow: 'hidden'")
    const dialog = between(sb, '{/* BMP Outcome Modal */}', 'Shared expansion area')
    expect(dialog).not.toContain("'#fcd34d'")
    expect(dialog).toContain('background: leftTeamColor')
    expect(dialog).toContain('background: rightTeamColor')
    // the letters follow the coin toss, not the side
    expect(dialog).toContain("const team1Label = teamAKey === 'team1' ? 'A' : 'B'")
  })

  it('Current / New show the left team first with letters', () => {
    const dialog = between(sb, '{/* BMP Outcome Modal */}', '{/* Court Switch Modal')
    expect(dialog).not.toMatch(/\{currentScore\.team1\} : \{currentScore\.team2\}/)
    expect(dialog).toContain('{courtScore(currentScore)}')
  })
})

describe('issues 11 and 12: scores in court order, the set-end BMP chip', () => {
  it('Last action and the action descriptions print the left team first, with letters', () => {
    const desc = between(sb, 'const getActionDescription = useCallback((event) => {', '}, [data, leftisTeam1, t])')
    expect(desc).toContain('const scoreText = (t1, t2) => formatCourtScore(')
    expect(desc).not.toContain('(${team1Label} ${team1Score}:${team2Score} ${team2Label})')
    expect(sb).toContain('const scoreStr = formatCourtScore({ team1: team1Score, team2: team2Score }, { leftisTeam1, teamAKey })')
  })

  it('the coin toss names the teams, not the country code', () => {
    const desc = between(sb, "if (event.type === 'coin_toss') {", "} else if (event.type === 'point')")
    expect(desc).not.toContain('team1ShortName ||')
    expect(desc).toMatch(/data\?\.match\?\.team1Name \|\| data\?\.team1Team\?\.name/)
  })

  it('the court switch and TTO dialogs show the score as on the court', () => {
    expect(sb).toContain('{courtScoreChips(courtSwitchModal.team1Points, courtSwitchModal.team2Points)}')
    expect(sb).toContain('{courtScoreChips(ttoModal.team1Points, ttoModal.team2Points)}')
  })

  it('the set-end BMP chip has the loser\'s letter from the coin toss; "Decision change" in sentence case', () => {
    const modal = between(sb, 'function SetEndTimeModal(', '\n}\n')
    expect(modal).toContain("const loserTeamLabel = loserTeam === (teamAKey || 'team1') ? 'A' : 'B'")
    expect(modal).not.toMatch(/>\s*Decision Change\s*</)
    expect(modal).toContain("t('scoreboard.buttons.decisionChange', 'Decision change')")
  })
})

describe('issue 13: interval and set-3 toss panel', () => {
  it('the team cards carry the coin toss letter, without nested parentheses', () => {
    // one name per team for the cards and the choice rows: "A · Alpha / Beta"
    expect(sb).toContain("team1: `${teamAKey === 'team1' ? 'A' : 'B'} · ${data?.team1Team?.name")
    expect(sb).toContain("team2: `${teamAKey === 'team2' ? 'A' : 'B'} · ${data?.team2Team?.name")
    expect(sb).toContain('const name = intervalTeamNames[teamKey]')
    expect(sb).not.toContain('{leftLabel} ({leftName})')
    expect(sb).not.toContain('{rightLabel} ({rightName})')
  })

  it('the set-3 toss buttons follow the court order', () => {
    expect(sb).toContain("{(leftisTeam1 ? ['team1', 'team2'] : ['team2', 'team1']).map(key => {")
  })

  it('before the set-3 toss: no SERVE, Start set disabled; the winner is named in Last action', () => {
    expect(sb).toContain('const set3TossPending = isBetweenSets && data?.set?.index === 3 && !data?.match?.set3CoinTossWinner')
    expect(sb).toMatch(/data\?\.set && !set3TossPending \? currentServeTeam === leftServeTeamKey/)
    expect(sb).toContain("disabled={data?.match?.status === 'complete' || set3TossPending}")
    // `before`: the match before the toss, for its undo (ScoreboardSet3TossUndo);
    // `teamA`: the designation of its labels (ScoreboardSwapUndo)
    expect(sb).toContain("{ winner, team: winner, before, teamA: matchBefore.coinTossTeamA || 'team1' }")
  })
})

describe('issue 9: the scoring layout (push up, SERVE, ball)', () => {
  const num = (name) => Number(sb.match(new RegExp(`const ${name} = ([0-9.]+)`))[1])

  it('the layout is top-aligned: no empty band above the score', () => {
    const wrap = between(sb, 'data-testid="scoring-layout"', '}}>')
    expect(wrap).toContain("alignItems: 'flex-start'")
    expect(wrap).not.toContain("alignItems: 'center'")
  })

  it('the header toggle hangs over the page instead of taking a row', () => {
    const toolbar = between(sb, 'function ScoreboardToolbar(', '\n}\n')
    expect(toolbar).toContain("style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)' }}")
    expect(toolbar).not.toContain('flex w-full h-4')
  })

  it('the side cards end with their content', () => {
    expect(sb.match(/alignSelf: 'flex-start',\n\s*maxHeight: '100%',/g)).toHaveLength(2)
  })

  it('SERVE is bigger (box, label, number), scaled with the screen', () => {
    expect(num('SERVE_BOX')).toBeGreaterThanOrEqual(0.092 * 1.35)
    expect(num('SERVE_LABEL')).toBeGreaterThanOrEqual(0.0253 * 1.25)
    expect(num('SERVE_NUMBER')).toBeGreaterThanOrEqual(0.0575 * 1.35)
    expect(sb.match(/maxWidth: `\$\{DESIGN_VMIN \* SERVE_BOX \* scaleFactor\}px`/g)).toHaveLength(4)
    expect(sb).not.toContain('DESIGN_VMIN * 0.0253 * scaleFactor')
  })

  it('the serving ball is ~60 % of the player disc (0.10) and clear of the position badge', () => {
    const ball = num('SERVE_BALL')
    expect(ball / 0.10).toBeLessThanOrEqual(0.65)
    // centred on the disc, half the ball stays inside the disc's half height
    // minus the badge (0.03 at -0.015): 0.05 - 0.015 = 0.035 > ball / 2
    expect(ball / 2).toBeLessThan(0.05 - 0.015)
    expect(sb).not.toMatch(/const ballSize = DESIGN_VMIN \* 0\.08/)
    expect(sb).not.toContain('DESIGN_VMIN * 0.08 * scaleFactor')
  })
})

describe('issue 15: "One point to switch / TTO" does not cover the players', () => {
  it('is a chip under the rally status, out of the flow, not a banner over the court', () => {
    expect(sb).not.toContain("animation: 'preEventPulse 1s ease-in-out infinite'")
    const chip = between(sb, 'data-testid="pre-event-chip"', '</div>')
    expect(chip).toContain("position: 'absolute'")
    expect(chip).toContain("pointerEvents: 'none'")
    expect(chip).toContain("t('scoreboard.onePointToSwitch', 'One point to switch')")
  })
})

describe('issue 16: no blank page at set end', () => {
  it('only the first load is a full-page loader; the set end shows a status over the screen', () => {
    expect(sb).not.toContain('if (!data?.set || setTransitionLoading) {')
    expect(sb).toContain('if (!data?.set) {')
    const overlay = between(sb, 'data-testid="set-transition-status"', '{setTransitionLoading.step}')
    expect(overlay).toContain('role="status"')
    expect(overlay).not.toContain('bg-gradient')
  })

  it('"Syncing to the cloud" only when a sync can finish now; the steps are translated', () => {
    expect(sb).toContain("if (cloudSyncWaitNow()) setSetTransitionLoading({ step: t('scoreboard.transitionSyncing'")
    expect(sb).not.toMatch(/setSetTransitionLoading\(\{ step: '[A-Z]/)
  })
})

describe('issue 19: side-panel sanctions list', () => {
  it('team rows say the set and score; the formal warning names the player', () => {
    expect(sb.match(/const sanctionWhen = \(ev\) => ev \?/g)).toHaveLength(2)
    expect(sb.match(/\{t\('scoreboard\.sanctions\.delayWarning', 'Delay warning'\)\}\{sanctionWhen\(teamSanctionEvents\('delay_warning'\)\[0\]\)\}/g)).toHaveLength(2)
    expect(sb.match(/teamSanctionEvents\('delay_penalty'\)\.map\(\(ev, i\) =>/g)).toHaveLength(2)
    expect(sb.match(/firstWarning \? ` · #\$\{firstWarning\.payload\?\.playerNumber\}/g)).toHaveLength(2)
  })

  it('the player grid centres letter and score under the player number', () => {
    expect(sb).not.toContain("<div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>")
  })
})
