// "Sanctions and results" of a finished match (the scoring screen's Match
// menu) has a Sign button per captain. It opened <SignaturePad>, a component
// the scoring screen never imported: a ReferenceError while drawing, the
// whole scorer app on its error screen. The pad (stubbed: jsdom has no
// canvas) now opens and its signature is saved to the match row, with its
// source and the cloud job, as MatchEnd saves one (saveMatchSignature).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup, screen } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'

vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title }) => (open ? (
    <div role="dialog" aria-label={title}>
      <button type="button" onClick={() => { onSave('data:image/png;base64,NEW', { source: 'device' }); onClose?.() }}>Draw</button>
    </div>
  ) : null)
}))

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

const at = (h, m, s = 0) => new Date(2026, 9, 8, h, m, s).toISOString()

describe('Scoreboard_beach: a captain signs in Sanctions and results', () => {
  it('Sign opens the pad and the signature is saved to the match', async () => {
    const t1 = await db.teams.add({ name: 'Alpha / Beta' })
    const t2 = await db.teams.add({ name: 'Gamma / Delta' })
    await db.players.bulkAdd([
      { teamId: t1, number: 1, name: 'Alpha', isCaptain: true }, { teamId: t1, number: 2, name: 'Beta' },
      { teamId: t2, number: 1, name: 'Gamma', isCaptain: true }, { teamId: t2, number: 2, name: 'Delta' }
    ])
    const matchId = await db.matches.add({
      team1Id: t1, team2Id: t2, status: 'final', test: false, seed_key: 'm-post-sign',
      firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
    })
    await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: at(16, 0), endTime: at(16, 20) })
    await db.sets.add({ matchId, index: 2, team1Points: 21, team2Points: 17, finished: true, startTime: at(16, 23), endTime: at(16, 45) })
    await db.sets.add({ matchId, index: 3, team1Points: 0, team2Points: 0, finished: false })
    await db.events.bulkAdd([
      { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: at(15, 50) },
      { matchId, setIndex: 1, type: 'rally_start', payload: { servingTeam: 'team1' }, seq: 2, ts: at(16, 0, 30) },
      { matchId, setIndex: 1, type: 'point', payload: { team: 'team1' }, seq: 3, ts: at(16, 1) }
    ])
    const jobsBefore = await db.sync_queue.count()

    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
    const menu = await waitFor(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('title') === 'Menu' || x.getAttribute('aria-label') === 'Menu')
      expect(b).toBeTruthy()
      return b
    }, { timeout: 8000 })
    fireEvent.click(menu)
    fireEvent.click(await screen.findByText('Show sanctions and results', {}))

    const sign = await waitFor(() => {
      const buttons = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Sign')
      expect(buttons).toHaveLength(2)
      return buttons[0]
    })
    fireEvent.click(sign)
    const pad = await screen.findByRole('dialog', { name: /Captain Signature - Alpha/ })
    fireEvent.click(pad.querySelector('button'))

    await waitFor(async () => {
      const match = await db.matches.get(matchId)
      expect(match.team1PostGameCaptainSignature).toBe('data:image/png;base64,NEW')
      // drawn here, not on a phone: its source recorded as none
      expect(match.signatureSources).toHaveProperty('team1PostGameCaptainSignature', null)
    })
    // queued for the cloud with the match's signatures
    const jobs = (await db.sync_queue.toArray()).slice(jobsBefore)
    expect(jobs.some(j => j.resource === 'match' && j.payload?.id === 'm-post-sign' && j.payload?.signatures)).toBe(true)
    // the signed captain's slot shows the image instead of Sign
    await waitFor(() => expect([...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Sign')).toHaveLength(1))
  }, 30000)
})
