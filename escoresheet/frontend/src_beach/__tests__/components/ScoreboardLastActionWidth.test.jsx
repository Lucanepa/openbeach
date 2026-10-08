// Laptop run of 2026-10-08 (OB-4): at 1400 x 853 the LAST ACTION block ran
// past the window's right edge ("LAST AC", text cut). Its lines are one line
// each with an ellipsis, but the 17% column (a flex item, min-width auto)
// grew to the widest line: a long team name pushed it out of the window
// (Chrome on the dev server: column 1152-1550 px in a 1400 px window). The
// column may shrink below its text now, so the lines end in the ellipsis.
// jsdom has no layout: this checks the column's min-width on the real
// scoring screen; the widths were measured in Chrome.
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

describe('Scoreboard_beach: the last action block', () => {
  it('stays in its column with a long team name (the column may shrink below the text)', async () => {
    const t1 = await db.teams.add({ name: 'Kristina Bernasconi-Rothenbühler / Alexandra Zimmermann-Hofstetter' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Bernasconi' }, { teamId: t1, number: 2, name: 'Zimmermann' },
      { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const start = new Date(Date.now() - 300000).toISOString()
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'live', test: true,
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 1, team2Points: 0, finished: false, startTime: start })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
      { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
      { matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: 3, ts: start },
      { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 4, ts: start }
    ])

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(document.querySelector('[data-testid="last-action"]')).toBeTruthy(), { timeout: 8000 })
    const block = document.querySelector('[data-testid="last-action"]')
    expect(block.textContent).toContain('Bernasconi-Rothenbühler')
    const column = block.parentElement
    expect(column.style.flex).toBe('0 0 17%')
    expect(column.style.minWidth).toBe('0px')
    // every line of the block ends in an ellipsis instead of widening it
    for (const line of block.children) {
      expect(line.style.whiteSpace).toBe('nowrap')
      expect(line.style.textOverflow).toBe('ellipsis')
    }
    cleanup()
  }, 30000)
})
