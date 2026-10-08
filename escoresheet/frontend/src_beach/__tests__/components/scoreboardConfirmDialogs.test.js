/**
 * Every scorer confirmation dialog of Scoreboard_beach follows the
 * useConfirmAction pattern (tested in hooks/useConfirmAction.test.jsx):
 * snapshot, close before the first await, then write; a second tap is refused
 * while the first run is in flight, and a failed write says so. Scoreboard_beach
 * is too large to mount, so this pins that the handlers use it. Ported from
 * OpenVolley src/components/__tests__/scoreboardConfirmDialogs.test.js.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sb = readFileSync(resolve(__dirname, '../../components_beach/Scoreboard_beach.jsx'), 'utf8')
const between = (from, to) => {
  const start = sb.indexOf(from)
  expect(start, from).toBeGreaterThan(-1)
  const end = sb.indexOf(to, start + from.length)
  expect(end, to).toBeGreaterThan(start)
  return sb.slice(start, end)
}

// [handler head, end marker, the close call, the runner]
const DIALOGS = [
  ['const confirmSanction = useCallback(', 'const confirmSetStartTime = useCallback(', 'setSanctionConfirm(null)', 'runSanctionConfirm'],
  ['const handleUndo = useCallback(', 'const cancelUndo = useCallback(', 'setUndoConfirm(null)', 'runUndoConfirm'],
  ['const handleDecisionChange = useCallback(', 'const handleTimeout = useCallback(', 'setReplayRallyConfirm(null)', 'runDecisionChange'],
  ['const confirmCourtSwitch = useCallback(', '// Handle TTO end', 'setCourtSwitchModal(null)', 'runCourtSwitchConfirm'],
  ['const cancelCourtSwitch = useCallback(', '// Check if match is already finished', 'setCourtSwitchModal(null)', 'runCourtSwitchCancel'],
  ['const handleBMPOutcome = useCallback(', '// Count unsuccessful BMPs per team', 'setBmpOutcomeModal(null)', 'runBMPOutcome']
]

describe('confirmation dialogs close before they write and refuse a double tap', () => {
  for (const [head, end, close, runner] of DIALOGS) {
    it(head.replace('const ', '').replace(' = useCallback(', ''), () => {
      const b = between(head, end)
      expect(b).toContain(`useCallback(${head.includes('handleBMPOutcome') ? '(result, pointToTeam = null)' : '()'} => ${runner}(async () => {`)
      expect(sb).toContain(`const ${runner} = useConfirmAction(onConfirmFailed)`)
      const firstAwait = b.indexOf('await ')
      expect(b.indexOf(close)).toBeGreaterThan(-1)
      expect(b.indexOf(close)).toBeLessThan(firstAwait)
    })
  }

  it('a player sanction is guarded and closes before the sanction is written', () => {
    const b = between('const confirmPlayerSanction = useCallback(', 'const executeExpulsionOrDisqualification')
    expect(b).toContain('runPlayerSanctionConfirm(async () => {')
    const write = b.indexOf("await logEvent('sanction'")
    expect(b.lastIndexOf('setSanctionConfirmModal(null)', write)).toBeGreaterThan(b.lastIndexOf('// Regular sanction', write))
  })

  it('a delay penalty confirmed by a double tap gives one point: the dialog closes before the penalty point', () => {
    const b = between('const confirmSanction = useCallback(', 'const confirmSetStartTime = useCallback(')
    expect(b.indexOf('setSanctionConfirm(null)')).toBeLessThan(b.indexOf('await handlePoint(otherSide, false, true)'))
  })

  it('a failed write after the dialog closed is shown to the scorer', () => {
    const b = between('const onConfirmFailed = useCallback(', '}, [showAlert, t])')
    expect(b).toContain("showAlert(t('scoreboard.confirmFailed'), 'error')")
  })
})

describe('point buttons', () => {
  it('a double tap while the first point is written gives one point', () => {
    const b = between('const handlePoint = useCallback(', 'const handleStartRally = useCallback(')
    expect(b).toMatch(/if \(pointInFlightRef\.current && !fromPenalty\) return/)
    expect(b).toMatch(/pointInFlightRef\.current = true/)
    expect(b).toMatch(/finally \{\s*pointInFlightRef\.current = false/)
  })
})
