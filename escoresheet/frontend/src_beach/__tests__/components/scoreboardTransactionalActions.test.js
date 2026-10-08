/**
 * Every scorer action of Scoreboard_beach is ONE Dexie transaction and ONE
 * screen change (useScorerActions_beach + useActionLiveQuery_beach, tested in
 * hooks/). "First the score, then the dialog" came from every write being its
 * own transaction. Scoreboard_beach.jsx is too large to mount, so this pins
 * the wiring. Ported from OpenVolley
 * src/components/__tests__/scoreboardTransactionalActions.test.js.
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

describe('the scoring screen reads its data in one read transaction', () => {
  it('useActionLiveQuery over db.transaction(\'r\', ...), not useLiveQuery', () => {
    expect(sb).toContain("const [data, commits] = useActionLiveQuery(() => db.transaction('r', db.matches, db.teams, db.sets, db.players, db.events, async () => {")
    expect(sb).not.toMatch(/const data = useLiveQuery\(/)
  })

  it('the actions hold the event mutex and capture the final snapshot', () => {
    const b = between('const { runAction, deferUi, deferEffect, inAction } = useScorerActions({', '})')
    expect(b).toContain('mutexRef: eventInProgressRef')
    expect(b).toContain('captureFinalSnapshot: captureFullStateSnapshot')
    expect(b).toContain('onError: onConfirmFailed')
  })
})

describe('a point is one action', () => {
  it('handlePoint runs awardPoint as the keyed action', () => {
    const b = between('const handlePoint = useCallback(', 'const handleStartRally = useCallback(')
    expect(b).toContain("runAction(fromPenalty ? null : 'point', () => awardPoint(side, skipConfirmation, fromPenalty))")
  })

  it('the dialogs a point opens come with its data (deferUi), the set end check is awaited inside', () => {
    const b = between('const awardPoint = useCallback(', 'const handlePoint = useCallback(')
    for (const setter of ['setCourtSwitchModal', 'setTtoModal', 'setPreEventPopup', 'setAccidentalPointConfirmModal']) {
      expect(b).toContain(`deferUi(() => ${setter}(`)
      // never set directly (the onConfirm closure, run later, is no part of the action)
      expect(b.replace(/setAccidentalPointConfirmModal\(null\)/g, '').match(new RegExp(`(?<!deferUi\\(\\(\\) => )${setter}\\(`, 'g'))).toBeNull()
    }
    expect(b).toContain('await checkSetEnd(freshCurrentSet, team1Points, team2Points)')
    const check = between('const checkSetEnd = useCallback(', '// Determine who has serve')
    expect(check.match(/deferUi\(\(\) => setSetEndTimeModal\(/g)).toHaveLength(2)
  })
})

describe('logEvent inside an action', () => {
  const body = () => between('  const logEvent = useCallback(', '  // Keep logEventRef updated')

  it('does not wait on the mutex the action holds (a timer would commit the transaction early)', () => {
    expect(body()).toContain('const shouldAcquireMutex = !options.skipMutex && !inAction()')
  })

  it('runs its network side effects after the commit, the live state once with the final snapshot', () => {
    const b = body()
    expect(b).not.toMatch(/\n\s+syncToReferee\(\)/)
    expect(b).not.toMatch(/\n\s+syncLiveStateToSupabase\(/)
    expect(b).not.toMatch(/\n\s+refreshScoresheet\(\)/)
    expect(b).toContain('afterRefereeSync()')
    expect(b).toContain('afterLiveState(type, eventTeam, eventData, useSnapshot)')
    expect(b).toContain('afterScoresheetRefresh()')
    expect(b).toContain("runOrDefer({ once: 'backup'")
  })
})

describe('sanctions, undo, replay and decision change are one action each', () => {
  it('a delay penalty: the sanction and its point commit together', () => {
    const b = between('const confirmSanction = useCallback(', 'const confirmSetStartTime = useCallback(')
    expect(b).toContain("runAction('sanction', async () => {")
    expect(b.indexOf("runAction('sanction'")).toBeLessThan(b.indexOf('await handlePoint(otherSide, false, true)'))
    const p = between('const confirmPlayerSanction = useCallback(', 'const executeExpulsionOrDisqualification')
    expect(p).toContain("await runAction('sanction', async () => {")
  })

  for (const [head, end, key] of [
    ['const handleUndo = useCallback(', 'const cancelUndo = useCallback(', 'undo'],
    ['const handleReplayRally = useCallback(', 'const cancelReplayRally = useCallback(', 'decision'],
    ['const handleDecisionChange = useCallback(', 'const handleTimeout = useCallback(', 'decision']
  ]) {
    it(`${head.slice(6, head.indexOf(' ='))}: one action that rolls back as a whole on a failure`, () => {
      const b = between(head, end)
      expect(b).toContain(`runAction('${key}', async () => {`)
      expect(b).toMatch(/catch \(error\) \{[^}]*throw error/)
      expect(b).not.toMatch(/\n\s+syncToReferee\(\)/)
      expect(b).not.toMatch(/\n\s+syncLiveStateToSupabase\(/)
      expect(b).not.toMatch(/\n\s+refreshScoresheet\(\)/)
    })
  }

  it('a failure is reported once (the action, not the confirm again)', () => {
    const b = between('const onConfirmFailed = useCallback(', '}, [showAlert, t])')
    expect(b).toContain('if (isReportedActionError(err)) return')
  })
})

// A sanction painted in two frames in the desktop app: the dialog closed,
// the score / sanction list changed 64-97 ms later. The dialog now closes in
// the render that shows the action's data (deferUi), as in OpenVolley.
describe('a sanction is one screen change', () => {
  it('confirmSanction (improper request, delay warning, delay penalty)', () => {
    const b = between('const confirmSanction = useCallback(', '// Confirm set start time')
    expect(b).toContain("runSanctionConfirm(() => runAction('sanction', async () => {")
    expect(b).toContain('deferUi(() => setSanctionConfirm(null))')
    expect(b.replace(/deferUi\(\(\) => setSanctionConfirm\(null\)\)/g, '')).not.toContain('setSanctionConfirm(null)')
  })

  it('confirmPlayerSanction: a warning or a penalty', () => {
    const b = between('const confirmPlayerSanction = useCallback(', 'const executeExpulsionOrDisqualification')
    const regular = b.slice(b.indexOf('// Regular sanction'))
    expect(regular).toContain("await runAction('sanction', async () => {")
    expect(regular).toContain('deferUi(() => setSanctionConfirmModal(null))')
    expect(regular.replace(/deferUi\(\(\) => setSanctionConfirmModal\(null\)\)/g, '')).not.toContain('setSanctionConfirmModal(null)')
  })
})
