// Continue match on a beach match that one team has won 2:0 or 2:1 (best of
// 3), ended and not yet approved: continueMatch and continueTestMatch counted a
// finished match as 3 sets won (best of 5, from OpenVolley), so they opened
// the scoreboard ('Loading...'), which then went on to Match End. The filled
// Match End opens now, with no scoreboard first (OpenVolley 6483cac7: a
// restored best-of-3 match opened the scoreboard instead of Match End).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { waitFor, fireEvent, cleanup } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep, track } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)
afterEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(t => t.clear()))
})

async function finishedMatch({ test, scores, approved = false }) {
  const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
  const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
  await db.players.bulkAdd([1, 2].flatMap(n => [
    { teamId: team1, number: n, firstName: 'A', lastName: `One${n}`, isCaptain: n === 1 },
    { teamId: team2, number: n, firstName: 'B', lastName: `Two${n}`, isCaptain: n === 1 }
  ]))
  const start = new Date(Date.now() - 3600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: team1, team2Id: team2, status: 'ended', test, gameN: test ? undefined : 4711,
    createdAt: start, matchInfoConfirmedAt: start,
    coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
    firstServe: 'team1', team1CaptainSignature: 'x', team2CaptainSignature: 'x', approved
  })
  await db.sets.bulkAdd(scores.map(([team1Points, team2Points], i) => (
    { matchId, index: i + 1, team1Points, team2Points, finished: true, startTime: start, endTime: start }
  )))
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
}

// Continue match from the home screen. The app opens a finished match not
// approved on Match End by itself (AppReopenEndedMatch): the match comes once
// the home screen shows, as when the scorer went home from Match End.
async function continueToMatchEnd(setUp) {
  mountApp()
  await waitFor(() => expect(button('New match')).toBeTruthy(), { timeout: 8000 })
  await setUp()
  await waitFor(() => expect(button('Continue match')).toBeTruthy(), { timeout: 8000 })
  const { states, stop } = track(() => ({
    home: !!button('Restore match'),
    // the scoreboard, drawn or still loading its match
    scoreboard: !!document.querySelector('[data-testid="scoring-layout"]') || /Loading\.\.\./.test(document.body.textContent),
    matchEnd: /Match complete/.test(document.body.textContent)
  }))
  fireEvent.click(button('Continue match'))
  await waitFor(() => expect(states.at(-1)?.matchEnd).toBe(true), { timeout: 15000 })
  await sleep(500)
  stop()
  return states
}

describe('App: Continue match on a finished best-of-3 match', () => {
  it('a test match won 2:0 opens Match End, no scoreboard first', async () => {
    const states = await continueToMatchEnd(() => finishedMatch({ test: true, scores: [[21, 15], [21, 18]] }))
    expect(states.at(-1)).toEqual({ home: false, scoreboard: false, matchEnd: true })
    // the home screen, then the filled Match End: no scoreboard, nothing between
    expect(states.filter(s => s.scoreboard)).toEqual([])
    expect(states.filter(s => !s.home && !s.matchEnd)).toEqual([])
  }, 30000)

  it('an official match won 2:1 opens Match End, no scoreboard first', async () => {
    const states = await continueToMatchEnd(() => finishedMatch({ test: false, scores: [[21, 15], [18, 21], [15, 12]] }))
    expect(states.at(-1)).toEqual({ home: false, scoreboard: false, matchEnd: true })
    // the home screen, then the filled Match End: no scoreboard, nothing between
    expect(states.filter(s => s.scoreboard)).toEqual([])
    expect(states.filter(s => !s.home && !s.matchEnd)).toEqual([])
  }, 30000)
})
