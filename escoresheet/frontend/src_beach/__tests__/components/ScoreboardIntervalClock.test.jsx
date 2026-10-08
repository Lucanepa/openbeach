// Laptop run of 2026-10-08 (OV-7): after a set interval was cut short (the
// next set started before the countdown ran out), the next interval reused the
// old interval's start time, so it stood at 0 at once (or showed the old
// interval's time). Each interval runs its own clock from the previous set's end.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

describe('Scoreboard_beach: the set interval clock', () => {
  it('an interval cut short does not shorten the next one', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    // set 1 ended 30 s ago: 30 s of the 1-2 interval are left
    const end1 = new Date(Date.now() - 30000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'B', 2: 'B', 3: 'A' }
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: new Date(Date.now() - 1200000).toISOString(), endTime: end1 })
    const set2 = await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: end1 },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: end1 },
      { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: end1 }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const countdown = (re) => [...document.querySelectorAll('div')].filter(e => e.children.length === 0 && re.test(e.textContent.trim()))
    await waitFor(() => expect(countdown(/^[123]\d$/).length).toBeGreaterThan(0), { timeout: 8000 })

    // set 2 starts before the countdown ran out, is played and won by team 2,
    // then the 2-3 interval begins
    await db.events.add({ matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: new Date().toISOString() })
    // set 2 takes longer than the 1-2 interval had left (the clock moves on 40 s)
    const realNow = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 40000)
    const end2 = new Date(Date.now()).toISOString()
    await db.transaction('rw', db.sets, db.events, async () => {
      await db.sets.update(set2, { team1Points: 12, team2Points: 21, finished: true, startTime: end1, endTime: end2 })
      await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
      await db.events.add({ matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 })
    })

    await waitFor(() => expect(countdown(/^(1:00|\d\d?)$/).length).toBeGreaterThan(0), { timeout: 8000 })
    await sleep(600)
    // the full minute (not what the 1-2 interval had left: 0)
    expect(countdown(/^(1:00|\d\d?)$/).map(e => e.textContent.trim())).toEqual(expect.arrayContaining([expect.stringMatching(/^(1:00|[45]\d)$/)]))
    vi.mocked(Date.now).mockRestore()
    cleanup()
  }, 30000)
})

describe('Scoreboard_beach: the set interval starts at the set end', () => {
  it('counts from the set end event, not from the set end time rounded down to the minute', async () => {
    cleanup()
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    // confirmed 10 s ago; the set row keeps the minute (here 55 s earlier)
    const confirmedAt = new Date(Date.now() - 10000).toISOString()
    const roundedEnd = new Date(Date.now() - 55000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
      setLeftTeamOverrides: { 1: 'B', 2: 'B' }
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: roundedEnd, endTime: roundedEnd })
    await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: roundedEnd },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: roundedEnd },
      { matchId, setIndex: 1, type: 'set_end', payload: { endTime: roundedEnd }, seq: 3, ts: confirmedAt }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const countdown = (re) => [...document.querySelectorAll('div')].filter(e => e.children.length === 0 && re.test(e.textContent.trim())).map(e => e.textContent.trim())
    await waitFor(() => expect(countdown(/^\d\d$/).length).toBeGreaterThan(0), { timeout: 8000 })
    expect(countdown(/^\d\d?$/)).toEqual(expect.arrayContaining([expect.stringMatching(/^(3\d|4\d|50)$/)]))
    cleanup()
  }, 30000)
})
