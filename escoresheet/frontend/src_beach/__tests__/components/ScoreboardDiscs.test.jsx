// Row 27 of the OpenBeach port (OpenVolley 57d0be0e, 822a3cb3): on the
// scoring court (Scoreboard_beach over the real Dexie database) the two discs
// of each team wear its colour with a readable number, outlined on the number
// alone, and a white team's discs get a darker ring so they show on the sand.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { discPaint, TEXT_DARK, TEXT_LIGHT } from '../../utils_beach/teamColours_beach'

const rgb = (hex) => {
  const h = hex.replace('#', '')
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`
}

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
afterAll(() => {
  cleanup()
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  vi.restoreAllMocks()
})

async function setUpMatch(team1Color, team2Color) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta', color: team1Color })
  const t2 = await db.teams.add({ name: 'Gamma / Delta', color: team2Color })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 3, name: 'Gamma' }, { teamId: t2, number: 4, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_discs_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 3
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const disc = (number) => document.querySelector(`.court-player[data-player-number="${number}"]`)

describe('Scoreboard_beach: team-colour discs on the sand', () => {
  it('white team: near-black numbers and a ring; default red: white numbers outlined on the number only', async () => {
    const matchId = await setUpMatch('#ffffff', '#ef4444')
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    await waitFor(() => expect(document.querySelectorAll('.court-player[data-player-number]').length).toBe(4), { timeout: 8000 })

    const white = discPaint('#ffffff')
    for (const n of [1, 2]) {
      const el = disc(n)
      expect(el.style.background).toBe(rgb('#ffffff'))
      expect(el.style.borderColor).toBe(rgb(white.ring))
      const num = el.querySelector('.court-player-number')
      expect(num.style.color).toBe(rgb(TEXT_DARK))
      expect(num.style.textShadow).toBe('')
    }

    const red = discPaint('#ef4444')
    for (const n of [3, 4]) {
      const el = disc(n)
      expect(el.style.background).toBe(rgb('#ef4444'))
      expect(el.style.borderColor).toBe(rgb(red.ring))
      const num = el.querySelector('.court-player-number')
      expect(num.style.color).toBe(rgb(TEXT_LIGHT))
      expect(num.style.textShadow).toContain('rgba(28, 25, 23, 0.85)')
      // the badges (position, captain) are not outlined
      expect(el.style.textShadow).toBe('')
    }
  }, 20000)
})
