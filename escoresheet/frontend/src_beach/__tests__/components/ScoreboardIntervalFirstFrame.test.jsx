// Laptop run of 2026-10-08 (OB-18): at the end of set 1 the interval
// countdown showed "21" for one frame, then "1:00". The interval was first
// detected from the set's end time, which is rounded down to the minute (39 s
// before the confirm, then 60 - 39 = 21 s), and the confirm then restarted it
// at the full minute. Same cause as OV-7b: the interval counts from the
// set_end event (fix/interval-clock-reset). The real set end, on the real
// scoring screen over the app's Dexie database (fake IndexedDB), the clock
// stopped 39 s past the minute.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
  vi.useRealTimers()
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
// the interval countdown under the court (36 px digits)
const countdownText = () => [...document.querySelectorAll('.tabular-nums')]
  .filter(e => e.style.fontSize === '36px' && /^\d+(:\d\d)?$/.test(e.textContent.trim()))
  .map(e => e.textContent.trim())

describe('Scoreboard_beach: the interval after the set end', () => {
  it('shows the full minute from its first frame', async () => {
    // the clock stands 39 s past a minute (the set end time is rounded down to it)
    const now = new Date()
    now.setSeconds(39, 0)
    vi.useFakeTimers({ toFake: ['Date'], now })

    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(now.getTime() - 1200000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    // 20:16, not a multiple of 7: no change of courts is pending at the start
    // (a reload asks for one: origin/main 2e758dc)
    await db.sets.add({ matchId, index: 1, team1Points: 20, team2Points: 16, finished: false, startTime: start })
    let seq = 1
    const events = [
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: seq++, ts: start }
    ]
    for (let k = 0; k < 36; k++) {
      events.push({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: start })
      events.push({ matchId, setIndex: 1, type: 'point', payload: { team: k < 20 ? 'team1' : 'team2' }, seq: seq++, ts: start })
    }
    await db.events.bulkAdd(events)

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(button('Start rally')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Start rally'))
    const pointA = () => [...document.querySelectorAll('button.rally-point-button')][0]
    await waitFor(() => expect(pointA()).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(pointA())
    await waitFor(() => expect(button('Confirm')).toBeTruthy(), { timeout: 5000 })

    // every countdown text the screen shows
    const seen = []
    const observer = new MutationObserver(() => {
      for (const text of countdownText()) if (seen.at(-1) !== text) seen.push(text)
    })
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true })
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(countdownText()).toContain('1:00'), { timeout: 10000 })
    await new Promise(r => setTimeout(r, 500))
    observer.disconnect()
    vi.useRealTimers()

    expect((await db.sets.where({ matchId, index: 1 }).first()).finished).toBe(true)
    // the clock stands still here: only the full minute, never "21" first
    expect(seen).toEqual(['1:00'])
    cleanup()
  }, 30000)
})
