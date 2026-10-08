/**
 * Corrections on the scoring screen (cancel a change of courts, Undo, Replay,
 * decision change, the event editor's deletes). The rules are decided by the
 * tested utils_beach/scorerCorrections_beach.js; Scoreboard_beach.jsx is too
 * large to mount, so this pins that the handlers use them. Ported from
 * OpenVolley src/components/__tests__/scoreboardSweepFixes.test.js.
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

describe('discardEvents: removed events leave nothing behind in the cloud', () => {
  const body = () => between('const discardEvents = useCallback(', 'const applyPointRemovalScore')

  it('drops their unsent insert jobs; the event history voids the server rows (no delete job)', () => {
    const b = body()
    expect(b).toMatch(/withActivityContext\(\{ reason: currentActivityContext\(\)\?\.reason \|\| reason \}, \(\) => db\.events\.bulkDelete\(ids\)\)/)
    expect(b).toMatch(/syncJobsForEvents\(unsent, ids\)/)
    expect(b).not.toMatch(/eventDeleteJob/)
  })
})

describe('the event history: reasons and seqs', () => {
  it('Undo is one \'undo\' action, Replay and the decision change \'decision_change\'', () => {
    expect(between('const handleUndo = useCallback(', 'const cancelUndo = useCallback(')).toMatch(/\}, \{ reason: 'undo' \}\)\n  \}\), \[runUndoConfirm/)
    expect(between('const handleReplayRally = useCallback(', 'const runDecisionChange')).toMatch(/\}, \{ reason: 'decision_change' \}\), \[runAction/)
    expect(between('const handleDecisionChange = useCallback(', '\n  // ')).toMatch(/\}, \{ reason: 'decision_change' \}\)\), \[runDecisionChange/)
  })

  it('cancelling a change of courts takes the point back as an undo', () => {
    const b = between('const cancelCourtSwitch = useCallback(', '// Check if match is already finished')
    expect(b).toMatch(/await discardEvents\(allEvents\.filter\(e => deleteIds\.has\(e\.id\)\), 'undo'\)/)
  })

  it('an undone seq is never given out again (main events and N.x sub-events)', () => {
    expect(between('const getNextSeq = useCallback(', 'const getNextSubSeq')).toMatch(/Math\.floor\(await maxVoidedSeq\(db, matchId\)\)/)
    expect(between('const getNextSubSeq = useCallback(', '// Debug functions')).toMatch(/await maxVoidedSeq\(db, matchId, \{ from: baseSeq, to: baseSeq \+ 0\.99 \}\)/)
  })
})

describe('cancelling a change of courts (every 7 points, 5 in set 3)', () => {
  const body = () => between('const cancelCourtSwitch = useCallback(', '// Check if match is already finished')

  it('takes back the point that reached the change, like Undo, not the newest event row', () => {
    const b = body()
    expect(b).toMatch(/planPointRemoval\(allEvents, null, \{ setIndex: modal\.set\.index, includeRallyStart: true \}\)/)
    expect(b).toMatch(/await discardEvents\(/)
    expect(b).toMatch(/await applyPointRemovalScore\(plan\)/)
    expect(b).not.toMatch(/db\.events\.delete\(lastEvent\.id\)/)
    expect(b).not.toMatch(/sortedEvents\[0\]/)
  })

  it('closes before it writes', () => {
    const b = body()
    expect(b.indexOf('setCourtSwitchModal(null)')).toBeLessThan(b.indexOf('await '))
  })

  it('the referee tablets and the livescore hear about it', () => {
    const b = body()
    expect(b).toMatch(/syncToReferee\(\)/)
    expect(b).toMatch(/syncLiveStateToSupabase\('undo'/)
  })

  it('the set score goes to the cloud through the sync queue, also offline', () => {
    const b = between('const applyPointRemovalScore = useCallback(', '// NEW SNAPSHOT-BASED UNDO SYSTEM')
    expect(b).toMatch(/scoreAfterRemoval\(setRow, plan\.delta\)/)
    expect(b).toMatch(/await queueSetScoreSync\(db, \{ matchId, setIndex: plan\.setIndex \}\)/)
  })
})

describe('Undo reaches the server (sent events too)', () => {
  const body = () => between('const handleUndo = useCallback(', 'const cancelUndo = useCallback(')

  it('removes the events through discardEvents, not raw deletes that only drop a queued job', () => {
    const b = body()
    expect(b).toMatch(/await discardEvents\(eventsToDelete\)/)
    expect(b).not.toMatch(/db\.events\.delete\(/)
  })

  it('a decision change undo gives the point back to its first team, in the cloud too', () => {
    const b = body()
    expect(b).toMatch(/planDecisionChangeReversal\(lastEvent, allEvents\)/)
    expect(b).toMatch(/eventUpsertJob\(reversalMatch\.seed_key, pointRow\)/)
  })

  it('the set score is queued (not only when the backend answers), a set end reopens the set in the cloud', () => {
    const b = body()
    expect(b).toMatch(/await queueSetScoreSync\(db, \{ matchId, setIndex: lastEvent\.setIndex \?\? data\.set\.index \}\)/)
    expect(b).toMatch(/await discardEvents\(nextSetEvents\)/)
    expect(b).toMatch(/syncJobsForSets\(unsent, \[nextSet\.id\]\)/)
    expect(b).toMatch(/setReopenJob\(undoMatch\.seed_key, reopened\)/)
  })
})

describe('Replay rally reaches the server and the tablets', () => {
  const body = () => between('const handleReplayRally = useCallback(', 'const cancelReplayRally = useCallback(')

  it('takes the point back with planPointRemoval and discardEvents, no raw deletes', () => {
    const b = body()
    expect(b).toMatch(/planPointRemoval\(allEvents, lastEvent\)/)
    expect(b).toMatch(/await discardEvents\(/)
    expect(b).not.toMatch(/db\.events\.delete\(/)
    expect(b).toMatch(/await applyPointRemovalScore\(plan\)/)
  })

  it('logs the replay through logEvent (its own sync job) and syncs the tablets', () => {
    const b = body()
    expect(b).toMatch(/await logEvent\('replay'/)
    expect(b).not.toMatch(/db\.events\.add\(/)
    // after the action's commit (runOrDefer), once
    expect(b).toMatch(/afterRefereeSync\(\)/)
    expect(b).toMatch(/afterLiveState\('replay'/)
  })

  it('closes the dialog before it writes', () => {
    const b = body()
    const close = b.indexOf('setReplayRallyConfirm(null)\n\n    try')
    expect(close).toBeGreaterThan(-1)
    expect(close).toBeLessThan(b.indexOf('await db.events.where'))
  })
})

describe('decision change reaches the server and the tablets', () => {
  const body = () => between('const handleDecisionChange = useCallback(', 'const handleTimeout = useCallback(')

  it('the swapped point is written to the cloud again, the decision is logged with its sync job', () => {
    const b = body()
    expect(b).toMatch(/eventUpsertJob\(match\.seed_key, \{ \.\.\.lastEvent, payload: swappedPayload \}\)/)
    expect(b).toMatch(/await logEvent\('decision_change'/)
    expect(b).toMatch(/pointEventId: lastEvent\.id/)
    expect(b).toMatch(/await queueSetScoreSync\(db, /)
    expect(b).not.toMatch(/db\.events\.delete\(/)
  })

  it('the tablets get the swapped point', () => {
    expect(body()).toMatch(/afterRefereeSync\(\)/)
  })
})

describe('the event editor deletes in the app\'s own dialog, and in the cloud too', () => {
  it('every delete asks with askConfirm (a native confirm() reads as "yes" in the desktop app)', () => {
    expect(sb).not.toMatch(/if \(confirm\(t\(/)
    for (const key of ['deletePointEvent', 'deleteTimeoutEvent', 'deleteSanctionEvent', 'deleteSubstitutionEvent', 'deleteEventGeneric']) {
      expect(sb).toMatch(new RegExp(`await askConfirm\\(\\{ title: t\\('scoreboard\\.confirm\\.${key}'`))
    }
  })

  it('the deletes go through discardEvents (raw deletes left the event on the server)', () => {
    const b = between('const deleteEventByHand = useCallback(', '// NEW SNAPSHOT-BASED UNDO SYSTEM')
    expect(b).toMatch(/await discardEvents\(rows\)/)
    expect(b).toMatch(/scoreDeltaOfRemoval\(allEvents, rows\.map\(e => e\.id\), event\.setIndex\)/)
    expect(b).toMatch(/teamSanctionFlags\(remaining, match\?\.sanctions\)/)
    expect(b).toMatch(/syncToReferee\(\)/)
    const editor = sb.slice(sb.indexOf("t('scoreboard.confirm.deletePointEvent')") - 400)
    expect(editor.slice(0, 20000)).not.toMatch(/await db\.events\.delete\(/)
  })
})

describe('manual edits reach the cloud through the sync queue (also offline)', () => {
  it('no direct cloud writes of set rows (they used a bare id the backend refuses) or of the match row', () => {
    expect(sb).not.toMatch(/apiFrom\('sets'\)\.update/)
    expect(sb).not.toMatch(/\.update\(\{ manual_changes: updatedChanges \}\)/)
    expect(sb).not.toMatch(/\.update\(\{ status: newStatus \}\)/)
    expect(sb).toMatch(/queueManualCloudUpdate\('match', \{ manual_changes: updatedChanges \}\)/)
    expect(sb).toMatch(/queueManualCloudUpdate\('set', \{ finished: e\.target\.checked \}, set\.id\)/)
  })
})
