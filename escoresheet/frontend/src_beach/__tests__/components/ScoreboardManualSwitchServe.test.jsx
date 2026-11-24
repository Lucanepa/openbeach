// Manual changes > Current set > "Switch serve". It checked `set index === 5`
// (left over from indoor): beach's deciding set is 3, so in set 3 it changed
// the match's firstServe instead of the set's own toss (set3FirstServe) and
// appeared to do nothing. It also wrote coinTossServeA without
// coinTossServeB (the coin toss screen then showed both teams serving, or
// neither), and its cloud job had no status, so the sync queue never sent it
// (found by a check, 2026-10-09).
// On the real scoring screen over the app's Dexie database (fake IndexedDB).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'

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
beforeEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

async function addTeams() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta', shortName: 'ALB' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta', shortName: 'GAD' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  return { t1, t2 }
}

// Menu > Manual changes > Current set: the teams' sides and serve
async function openCurrentSet() {
  const menu = await waitFor(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
    expect(b).toBeTruthy()
    return b
  }, { timeout: 8000 })
  fireEvent.click(menu)
  fireEvent.click(await screen.findByText('Manual changes'))
  await waitFor(() => expect(button('Current set')).toBeTruthy(), { timeout: 5000 })
  fireEvent.click(button('Current set'))
  await waitFor(() => expect(button('Switch serve')).toBeTruthy(), { timeout: 5000 })
  await settle()
}

// Who serves first, as the panel draws it: the team box with the ball
const servingBox = () => [...document.querySelectorAll('div')]
  .filter(d => d.children.length > 0 && /TEAM [12]/.test(d.textContent) && d.querySelector('svg') && d.textContent.length < 40)
  .map(d => d.textContent)

describe('Scoreboard_beach: Manual changes > Switch serve', () => {
  it('set 3: switches the set\'s own first server (set3FirstServe), not the match\'s firstServe', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 2400000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
      team1FirstServe: 1, team2FirstServe: 1, set3CoinTossWinner: 'team1', set3LeftTeam: 'A', set3FirstServe: 'A'
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: start })
    await db.sets.add({ matchId, index: 3, team1Points: 1, team2Points: 0, finished: false, startTime: start })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 3, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 3, type: 'rally_start', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 3, type: 'point', payload: { team: 'team1' }, seq: 4, ts: start }
    ])
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await openCurrentSet()
    // A (team 1) serves first in set 3
    expect(servingBox().some(t => t.includes('ALB'))).toBe(true)

    fireEvent.click(button('Switch serve'))
    await waitFor(async () => expect((await db.matches.get(matchId)).set3FirstServe).toBe('B'), { timeout: 5000 })
    const match = await db.matches.get(matchId)
    // the match's first serve (sets 1 and 2) and its coin toss are untouched
    expect(match).toMatchObject({ firstServe: 'team1', coinTossServeA: true, coinTossServeB: false })
    // and the panel shows B (team 2) serving first in set 3
    await waitFor(() => expect(servingBox().some(t => t.includes('GAD'))).toBe(true))
    cleanup()
  }, 60000)

  it('set 1: switches firstServe with both A/B serve flags, and the cloud coin toss is queued to send', async () => {
    const { t1, t2 } = await addTeams()
    const start = new Date(Date.now() - 600000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'beach_switch_serve',
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', coinTossServeA: true, coinTossServeB: false,
      team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false })
    await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start })
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await openCurrentSet()

    fireEvent.click(button('Switch serve'))
    await waitFor(async () => expect((await db.matches.get(matchId)).firstServe).toBe('team2'), { timeout: 5000 })
    expect(await db.matches.get(matchId)).toMatchObject({ coinTossServeA: false, coinTossServeB: true })

    const job = (await db.sync_queue.toArray()).find(j => j.payload?.coin_toss)
    expect(job).toBeTruthy()
    expect(job.status).toBe('queued')
    expect(job.payload.coin_toss).toMatchObject({ team_a: 'team1', team_b: 'team2', serve_a: false, first_serve: 'team2' })
    cleanup()
  }, 60000)
})
