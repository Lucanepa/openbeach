import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import i18n from '../../i18n_beach'
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
afterAll(async () => {
  cleanup()
  await i18n.changeLanguage('en')
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

// The scoring screen's LAST ACTION (and the undo dialog: the same text) was
// English in every language: getActionDescription built it from English
// literals (and t() keys that were missing from all five locales). Found
// with the set 3 coin toss winner in the French screen (2026-10-09).
describe('Scoreboard_beach: LAST ACTION in the app language', () => {
  for (const [lng, text] of [
    ['fr', 'Vainqueur du tirage au sort du 3e set'],
    ['it', 'Vincitore del sorteggio del 3° set'],
    ['de', 'Gewinner der Auslosung 3. Satz'],
    ['de-CH', 'Gwünner vo de Usloosig 3. Satz']
  ]) {
    it(`${lng}: the set 3 coin toss winner`, async () => {
      cleanup()
      await Promise.all(db.tables.map(tb => tb.clear()))
      await i18n.changeLanguage(lng)
      const t1 = await db.teams.add({ name: 'Alpha / Beta' })
      const t2 = await db.teams.add({ name: 'Gamma / Delta' })
      await db.players.bulkAdd([
        { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
        { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
      ])
      const start = new Date(Date.now() - 2400000).toISOString()
      const end2 = new Date(Date.now() - 5000).toISOString()
      const matchId = await db.matches.add({
        team1Id: t1, team2Id: t2, status: 'live', test: true,
        firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
      })
      await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: start, endTime: start })
      await db.sets.add({ matchId, index: 2, team1Points: 18, team2Points: 21, finished: true, startTime: start, endTime: end2 })
      await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
      await db.events.bulkAdd([
        { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: start },
        { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: 2, ts: start },
        { matchId, setIndex: 1, type: 'set_end', payload: {}, seq: 3, ts: start },
        { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 4, ts: start },
        { matchId, setIndex: 2, type: 'set_end', payload: {}, seq: 5, ts: end2 }
      ])

      render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
      const toss = () => document.querySelector('[data-testid="set3-toss-A"]')
      await waitFor(() => expect(toss()).toBeTruthy(), { timeout: 8000 })
      fireEvent.click(toss())
      const lastAction = () => document.querySelector('[data-testid="last-action"]')?.textContent || ''
      await waitFor(() => expect(lastAction()).toContain(text), { timeout: 5000 })
      expect(lastAction()).not.toMatch(/coin toss/i)
      cleanup()
    }, 30000)
  }
})
