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

  it('drops their unsent sync jobs and queues a cloud delete for a synced match', () => {
    const b = body()
    expect(b).toMatch(/db\.events\.bulkDelete\(ids\)/)
    expect(b).toMatch(/syncJobsForEvents\(unsent, ids\)/)
    expect(b).toMatch(/eventDeleteJob\(match\.seed_key, id, now\)/)
    expect(b).toMatch(/!match\.test && match\.seed_key/)
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
