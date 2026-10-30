// A reload, a crash or a dead battery on Match End (the match finished, the
// captains signing, not approved yet) reopened OpenBeach on the home screen.
// Nothing there said the match was not approved, and the next tap, New match
// > Official match > Delete and start new, threw it away with the captains'
// signatures; the server kept it ended and unapproved, for good (stress test
// 2026-10-25, 3/3 reopens). A reload goes back to Match End now; an opening
// (the app started, a crash, a kill) lands on Home, whose Continue card says
// which match is there and opens its Match End in one tap (the owner's start
// rules, 2026-10-27), and replacing it says it is not approved.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep, track } from '../helpers/appMount'
import { reloadInto } from '../helpers/selfCheckFixtures'
import { UiHost } from '../../ui/volleyui/UiHost.jsx'

beforeAll(offline)
afterAll(online)
afterEach(async () => {
  cleanup()
  sessionStorage.clear()
  await Promise.all(db.tables.map(t => t.clear()))
})

// An official match won 2:1, ended, both captains signed
async function finishedMatch({ approved = false } = {}) {
  const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
  const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
  await db.players.bulkAdd([1, 2].flatMap(n => [
    { teamId: team1, number: n, firstName: 'A', lastName: `One${n}`, isCaptain: n === 1 },
    { teamId: team2, number: n, firstName: 'B', lastName: `Two${n}`, isCaptain: n === 1 }
  ]))
  const start = new Date(Date.now() - 3600000).toISOString()
  const matchId = await db.matches.add({
    team1Id: team1, team2Id: team2, status: 'ended', test: false, gameN: 4711,
    createdAt: start, matchInfoConfirmedAt: start,
    coinTossConfirmed: true, coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
    firstServe: 'team1', team1CaptainSignature: 'x', team2CaptainSignature: 'x', approved
  })
  await db.sets.bulkAdd([[21, 15], [18, 21], [15, 12]].map(([team1Points, team2Points], i) => (
    { matchId, index: i + 1, team1Points, team2Points, finished: true, startTime: start, endTime: start }
  )))
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
  return matchId
}

const see = () => ({
  home: !!button('New match'),
  scoreboard: !!document.querySelector('[data-testid="scoring-layout"]') || /Loading\.\.\./.test(document.body.textContent),
  matchEnd: /Match complete/.test(document.body.textContent)
})

describe('App: a finished match not approved, as the app opens', () => {
  it('a reload on Match End goes back to Match End, with no scoreboard first', async () => {
    const matchId = await finishedMatch()
    reloadInto(matchId, 'matchEnd')
    const { states, stop } = track(see)
    mountApp()
    await waitFor(() => expect(states.at(-1)?.matchEnd).toBe(true), { timeout: 15000 })
    await sleep(500)
    stop()
    expect(states.at(-1)).toEqual({ home: false, scoreboard: false, matchEnd: true })
    // (the home screen only while the database is read, as for a live match)
    expect(states.filter(s => s.scoreboard)).toEqual([])
    const match = await db.matches.get(matchId)
    expect([match.team1CaptainSignature, match.team2CaptainSignature]).toEqual(['x', 'x'])
  }, 30000)

  it('an opening lands on Home with the Continue card; Continue opens Match End, with no scoreboard first', async () => {
    const matchId = await finishedMatch()
    mountApp()
    const card = () => document.querySelector('[data-testid="continue-card"]')
    await waitFor(() => expect(card()?.textContent).toContain('Müller / Weber – Schmidt / Fischer'), { timeout: 8000 })
    expect(card().textContent).toContain('Set 3 · 15:12 · sets 2:1')
    await sleep(800)
    expect(see()).toEqual({ home: true, scoreboard: false, matchEnd: false })
    const { states, stop } = track(see)
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(states.at(-1)?.matchEnd).toBe(true), { timeout: 8000 })
    stop()
    expect(states.filter(s => s.scoreboard)).toEqual([])
    expect(JSON.parse(sessionStorage.getItem('ob.openMatch'))).toEqual({ id: matchId, view: 'matchEnd' })
  }, 30000)

  it('an approved one stays on the home screen', async () => {
    await finishedMatch({ approved: true })
    mountApp()
    await waitFor(() => expect(button('New match')).toBeTruthy(), { timeout: 8000 })
    await sleep(1000)
    expect(see()).toEqual({ home: true, scoreboard: false, matchEnd: false })
  }, 30000)

  it('from the home screen, New match says it deletes a match not approved', async () => {
    // the app's dialogs (main_beach mounts it beside the app)
    render(<UiHost />)
    mountApp()
    await waitFor(() => expect(button('New match')).toBeTruthy(), { timeout: 8000 })
    await finishedMatch()
    await waitFor(() => expect(button('Continue match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('New match'))
    await waitFor(() => expect(button('Official match')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Official match'))
    // offline here: the app's "No cloud connection" notice comes first
    await sleep(300)
    if (button('Continue')) fireEvent.click(button('Continue'))
    await waitFor(() => expect(document.body.textContent).toContain('Delete the finished match?'), { timeout: 5000 })
    expect(document.body.textContent).toContain('not approved')
    expect(button('Delete anyway and start new')).toBeTruthy()
    fireEvent.click(button('Cancel'))
    await sleep(300)
    expect(await db.matches.count()).toBe(1)
  }, 30000)
})
