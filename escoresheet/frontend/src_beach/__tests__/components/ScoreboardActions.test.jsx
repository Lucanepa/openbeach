// The real scoring screen (Scoreboard_beach) over the app's real Dexie
// database (fake IndexedDB), driven with taps as the scorer does: every scorer
// action is one transaction (useScorerActions_beach), a double tap writes once,
// and corrections reach the sync queue (the decision change, its undo, Undo of
// a point). Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
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
  // the screen renders as in the app: an intermediate state may show up
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

// After a confirm, taps are swallowed for GHOST_CLICK_MS (the trailing tap of
// a double tap); the next deliberate tap waits for it
const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 100))
const SEED = 'match_1_test'
const button = (text) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const tapTwice = (el) => { fireEvent.click(el); fireEvent.click(el) }
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const score = async () => { const s = await db.sets.toArray(); return [s[0].team1Points, s[0].team2Points] }
const jobs = async () => db.sync_queue.toArray()
const ofType = async (type) => (await events()).filter(e => e.type === type)

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: SEED,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

describe('Scoreboard_beach: scorer actions against the real database', () => {
  it('points, a decision change, its undo and a delay penalty: once per (double) tap, synced', async () => {
    const matchId = await setUpMatch()
    render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

    // Start the set (start time dialog), which starts the first rally
    await waitFor(() => expect(button('Start set')).toBeTruthy(), { timeout: 5000 })
    fireEvent.click(button('Start set'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy())
    fireEvent.click(button('Confirm'))
    await waitFor(() => expect(button('Point A')).toBeTruthy())

    // Three points for team 1, each a double tap on "Point A"
    for (let i = 1; i <= 3; i++) {
      tapTwice(button('Point A'))
      await waitFor(async () => expect((await ofType('point')).length).toBe(i))
      if (i < 3) {
        await waitFor(() => expect(button('Start rally')).toBeTruthy())
        fireEvent.click(button('Start rally'))
        await waitFor(() => expect(button('Point A')).toBeTruthy())
      }
    }
    await settle()
    expect((await ofType('point')).length).toBe(3)
    expect(await score()).toEqual([3, 0])
    expect((await jobs()).filter(j => j.resource === 'event' && j.payload.type === 'point')).toHaveLength(3)

    // Decision change: the last point goes to team 2 (double tap on Confirm)
    await waitFor(() => expect(button('Decision change')).toBeTruthy())
    fireEvent.click(button('Decision change'))
    await waitFor(() => expect(button('Confirm')).toBeTruthy())
    tapTwice(button('Confirm'))
    await waitFor(async () => expect(await score()).toEqual([2, 1]))
    await settle()
    expect(await ofType('decision_change')).toHaveLength(1)
    const lastPoint = (await ofType('point')).at(-1)
    expect(lastPoint.payload).toMatchObject({ team: 'team2', swappedFrom: 'team1' })
    // the swapped point is written to the cloud again, the score queued
    let q = await jobs()
    expect(q.filter(j => j.action === 'insert' && j.payload.external_id === `${SEED}:e:${lastPoint.id}`).at(-1).payload.payload.team).toBe('team2')
    expect(q.filter(j => j.resource === 'set').at(-1).payload).toMatchObject({ team1_points: 2, team2_points: 1 })
    // the server's copy of the point is edited, labelled as the decision change
    expect(q.filter(j => j.action === 'edit' && j.payload.external_id === `${SEED}:e:${lastPoint.id}`).at(-1).payload).toMatchObject({ reason: 'decision_change', after: { payload: { team: 'team2' } } })

    // Undo the decision change: the point goes back to team 1, in the cloud too
    fireEvent.click(button('Undo'))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    tapTwice([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
    await waitFor(async () => expect(await score()).toEqual([3, 0]))
    await settle()
    expect(await ofType('decision_change')).toHaveLength(0)
    expect((await ofType('point')).map(p => p.payload.team)).toEqual(['team1', 'team1', 'team1'])
    q = await jobs()
    // the decision_change event is voided on the server (event history), as an undo
    const dcVoids = q.filter(j => j.action === 'void' && j.payload.type === 'decision_change')
    expect(dcVoids).toHaveLength(1)
    expect(dcVoids[0].payload.reason).toBe('undo')
    expect(q.some(j => j.action === 'delete')).toBe(false)
    // the point's team given back is an edit of the server's row, as an undo too
    expect(q.filter(j => j.action === 'edit' && j.payload.external_id === `${SEED}:e:${lastPoint.id}`).at(-1).payload).toMatchObject({ reason: 'undo', after: { payload: { team: 'team1' } } })
    expect(q.filter(j => j.action === 'insert' && j.payload.external_id === `${SEED}:e:${lastPoint.id}`).at(-1).payload.payload.team).toBe('team1')

    // The rally_start of that rally ("Start rally", logEvent) is synced like a
    // point; say its insert already reached the server
    const rally3 = (await ofType('rally_start')).filter(e => e.seq < lastPoint.seq).at(-1)
    const rallyInsert = (await jobs()).find(j => j.action === 'insert' && j.payload.external_id === `${SEED}:e:${rally3.id}`)
    expect(rallyInsert).toBeTruthy()
    await db.sync_queue.update(rallyInsert.id, { status: 'sent' })

    // Undo the third point: the point and its rally_start leave the server too
    fireEvent.click(button('Undo'))
    await waitFor(() => expect(document.querySelector('[data-testid="undo-confirm"]')).toBeTruthy())
    tapTwice([...document.querySelectorAll('[data-testid="undo-confirm"] button')].at(-1))
    await waitFor(async () => expect(await score()).toEqual([2, 0]))
    await settle()
    expect((await ofType('point')).length).toBe(2)
    expect(await db.events.get(rally3.id)).toBeUndefined()
    q = await jobs()
    const undoVoids = q.filter(j => j.action === 'void' && j.payload.reason === 'undo').map(j => j.payload.external_id)
    expect(undoVoids).toContain(`${SEED}:e:${lastPoint.id}`)
    // the sent rally_start is voided on the server too (it was deleted there before the event history)
    expect(undoVoids).toContain(`${SEED}:e:${rally3.id}`)
    // the point's own insert, never sent, is gone from the queue
    expect(q.filter(j => j.action === 'insert' && j.payload.external_id === `${SEED}:e:${lastPoint.id}`)).toHaveLength(0)

    // Delay warning, then a delay penalty: one sanction each, one penalty point
    const sanctionConfirm = () => [...document.querySelectorAll('[data-testid="sanction-confirm"] button')].at(-1)
    fireEvent.click(button('Delay warning'))
    await waitFor(() => expect(sanctionConfirm()).toBeTruthy())
    tapTwice(sanctionConfirm())
    await waitFor(async () => expect((await ofType('sanction')).length).toBe(1))
    await settle()
    expect((await ofType('sanction')).length).toBe(1)
    await waitFor(() => expect(button('Delay penalty')).toBeTruthy())
    fireEvent.click(button('Delay penalty'))
    await waitFor(() => expect(sanctionConfirm()).toBeTruthy())
    tapTwice(sanctionConfirm())
    await waitFor(async () => expect((await ofType('sanction')).length).toBe(2))
    await settle()
    expect((await ofType('sanction')).length).toBe(2)
    expect(await score()).toEqual([2, 1])

    // Every further delay in the match is another delay penalty (FIVB beach
    // rule 16.2.3): a second and a third, each its own tap, give a point each
    for (const n of [3, 4]) {
      await waitFor(() => expect(button('Delay penalty')).toBeTruthy())
      fireEvent.click(button('Delay penalty'))
      await waitFor(() => expect(sanctionConfirm()).toBeTruthy())
      fireEvent.click(sanctionConfirm())
      await waitFor(async () => expect((await ofType('sanction')).length).toBe(n))
      await settle()
    }
    expect(await score()).toEqual([2, 3])

    // Two more points for team 1: at 4:3 (7 points) the change of courts
    // dialog opens with the score (deferUi), and confirming it logs the
    // court_switch with its sync job
    for (let i = 0; i < 2; i++) {
      await waitFor(() => expect(button('Start rally')).toBeTruthy())
      fireEvent.click(button('Start rally'))
      await waitFor(() => expect(button('Point A')).toBeTruthy())
      tapTwice(button('Point A'))
      await waitFor(async () => expect((await score())[0]).toBe(3 + i))
    }
    await waitFor(() => expect(button('Switch courts')).toBeTruthy())
    expect(await score()).toEqual([4, 3])
    await settle()
    tapTwice(button('Switch courts'))
    await waitFor(async () => expect(await ofType('court_switch')).toHaveLength(1))
    await settle()
    expect(await ofType('court_switch')).toHaveLength(1)
    const courtSwitch = (await ofType('court_switch'))[0]
    expect((await jobs()).some(j => j.payload.external_id === `${SEED}:e:${courtSwitch.id}`)).toBe(true)
  }, 30000)
})
