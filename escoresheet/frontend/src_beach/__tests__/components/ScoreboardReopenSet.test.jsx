// Manual changes > Reopen set, after the set was ended on this screen.
//
// The handler only marked the set not finished and deleted the later sets
// and their events row by row. The set kept its set_end, its index stayed in
// the screen's record of confirmed set ends, so the set could not be ended
// again until a reload (no Set end dialog at 21:0; the next one's Confirm
// closed it and wrote nothing, the score went on to 22:0, 23:0), and nothing
// reached the cloud: set 1 stayed finished there with the old set 2, and the
// set 2 played again got a second row (stress test 2026-10-25). Now: one
// action, the set_end and the later sets' events go (the event history voids
// them on the server), the later sets go here and in the cloud, the set is
// open in the cloud again, and its end can be confirmed.
//
// On the real scoring screen over the app's real Dexie database (fake
// IndexedDB), driven with taps.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import '../helpers/fakeIndexedDb'
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react'
import '../../i18n_beach'
import { AlertProvider } from '../../contexts_beach/AlertContext_beach'
import { ScaleProvider } from '../../contexts_beach/ScaleContext_beach'
import { LoggingProvider } from '../../contexts_beach/LoggingContext_beach'
import { db } from '../../db_beach/db_beach'
import Scoreboard from '../../components_beach/Scoreboard_beach'
import { GHOST_CLICK_MS } from '../../hooks_beach/useConfirmAction_beach'
import { setExtId } from '../../utils_beach/syncIds_beach'
import { approvalsApi } from '../../lib_beach/approvalsApi_beach'
import { POST_MATCH_SIGNATURE_KEYS } from '../../utils_beach/signatures_beach'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT, width: window.innerWidth, height: window.innerHeight }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  window.innerWidth = 1280
  window.innerHeight = 800
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
beforeEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  cleanup()
  window.innerWidth = saved.width
  window.innerHeight = saved.height
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const SEED = 'match_reopen_set_test'
const settle = () => new Promise(r => setTimeout(r, GHOST_CLICK_MS + 150))
const button = (text, root = document) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)
const ofType = async (type) => (await db.events.toArray()).filter(e => e.type === type)
const setEndDialog = () => [...document.querySelectorAll('[role="dialog"]')].find(d => /Set 1 end/.test(d.textContent))

// Official match, set 1 at 21:0 not ended yet (its Set end dialog opens)
async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: SEED,
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1,
    // the changes of courts of set 1 made (every 7 points)
    setLeftTeamOverrides: { 1: 'A' }
  })
  const t = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  await db.sets.add({ matchId, index: 1, team1Points: 21, team2Points: 0, finished: false, startTime: t })
  let seq = 1
  const events = [
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: t },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: seq++, ts: t }
  ]
  for (let k = 1; k <= 21; k++) {
    events.push({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: t })
    events.push({ matchId, setIndex: 1, type: 'point', payload: { team: 'team1', score: { team1: k, team2: 0 } }, seq: seq++, ts: t })
    if (k % 7 === 0 && k < 21) events.push({ matchId, setIndex: 1, type: 'court_switch', payload: { score: { team1: k, team2: 0 }, preSwitchOverrides: {}, teamA: 'team1' }, seq: seq++, ts: t })
  }
  await db.events.bulkAdd(events)
  return matchId
}

// The same match left 'ended' (the status the set end, a forfeit and Match
// End write) with every closing signature made (one on a phone) and two
// account approvals, and the scoreboard open on it: set 1 ended, set 2 open
// at 5:0 (Match End's Manual adjustments untick a set's Finished, or a
// restore of a cloud row in that state; with every set finished the
// scoreboard has no set to show)
async function setUpEndedMatch() {
  const matchId = await setUpMatch()
  const t = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const set1 = (await db.sets.where({ matchId }).toArray()).find(s => s.index === 1)
  await db.sets.update(set1.id, { finished: true, endTime: t })
  await db.sets.add({ matchId, index: 2, team1Points: 5, team2Points: 0, finished: false, startTime: t })
  let seq = 500
  const events = [
    { matchId, setIndex: 1, type: 'set_end', payload: { team1Points: 21, team2Points: 0 }, seq: seq++, ts: t },
    { matchId, setIndex: 2, type: 'set_start', payload: {}, seq: seq++, ts: t }
  ]
  for (let k = 1; k <= 5; k++) {
    events.push({ matchId, setIndex: 2, type: 'rally_start', payload: {}, seq: seq++, ts: t })
    events.push({ matchId, setIndex: 2, type: 'point', payload: { team: 'team1', score: { team1: k, team2: 0 } }, seq: seq++, ts: t })
  }
  await db.events.bulkAdd(events)
  const record = (slot) => ({ id: `${slot}-approval`, slot, name: `Official ${slot}`, short_id: 'AB12CD34', approved_at: t })
  await db.matches.update(matchId, {
    status: 'ended',
    ...Object.fromEntries(Object.keys(POST_MATCH_SIGNATURE_KEYS).map(field => [field, `data:image/png;base64,${field}`])),
    signatureSources: { ref1Signature: { via: 'phone', at: t } },
    accountApprovals: { scorer: record('scorer'), referee1: record('referee1') }
  })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function confirmSetEnd() {
  await waitFor(() => expect(setEndDialog()).toBeTruthy(), { timeout: 10000 })
  await settle()
  fireEvent.click(button('Confirm', setEndDialog()))
  await waitFor(async () => expect((await db.sets.where({ matchId: (await db.matches.toCollection().first()).id }).toArray()).find(s => s.index === 1)?.finished).toBe(true), { timeout: 10000 })
  await settle()
}

async function reopenSet1() {
  await waitFor(() => expect(document.querySelector('button[title="Menu"]')).toBeTruthy(), { timeout: 10000 })
  fireEvent.click(document.querySelector('button[title="Menu"]'))
  await waitFor(() => expect([...document.querySelectorAll('button, [role="menuitem"]')].some(el => el.textContent.trim() === 'Manual changes')).toBe(true))
  fireEvent.click([...document.querySelectorAll('button, [role="menuitem"]')].find(el => el.textContent.trim() === 'Manual changes'))
  // the "Score & sets" section, collapsed
  const section = () => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Score & sets')
  await waitFor(() => expect(section()).toBeTruthy())
  if (!button('Reopen set 1 (21 - 0)')) fireEvent.click(section())
  await waitFor(() => expect(button('Reopen set 1 (21 - 0)')).toBeTruthy())
  fireEvent.click(button('Reopen set 1 (21 - 0)'))
  await waitFor(() => expect(button('Yes, reopen set')).toBeTruthy())
  fireEvent.click(button('Yes, reopen set'))
  await waitFor(async () => expect((await db.sets.toArray()).find(s => s.index === 1)?.finished).toBe(false), { timeout: 10000 })
  await settle()
}

describe('Scoreboard_beach: Manual changes > Reopen set', () => {
  it('a set ended on this screen and reopened ends again, once, and the cloud follows', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await confirmSetEnd()
    const set2 = (await db.sets.where({ matchId }).toArray()).find(s => s.index === 2)
    expect(set2).toBeTruthy()
    // set 2 under way: an event of its own
    await db.events.add({ matchId, setIndex: 2, type: 'set_start', payload: {}, seq: 1000, ts: new Date().toISOString() })

    await reopenSet1()
    // set 1 open, without its set_end; set 2 and its events gone
    const sets = await db.sets.where({ matchId }).toArray()
    expect(sets.map(s => [s.index, !!s.finished])).toEqual([[1, false]])
    expect(await ofType('set_end')).toHaveLength(0)
    expect((await db.events.toArray()).filter(e => e.setIndex === 2)).toHaveLength(0)
    // the cloud: set 1 open again, set 2 removed
    const jobs = await db.sync_queue.toArray()
    expect(jobs.some(j => j.resource === 'set' && j.action === 'update' && j.payload.external_id === setExtId(SEED, sets[0].id) && j.payload.finished === false)).toBe(true)
    expect(jobs.some(j => j.resource === 'set' && j.action === 'delete' && j.payload.external_id === setExtId(SEED, set2.id))).toBe(true)
    expect(jobs.some(j => j.resource === 'set' && j.action === 'insert' && j.payload.external_id === setExtId(SEED, set2.id) && j.status === 'queued')).toBe(false)

    // 21:0 is a set end: its dialog, and its Confirm ends the set once
    await confirmSetEnd()
    const after = await db.sets.where({ matchId }).toArray()
    expect(after.find(s => s.index === 1).finished).toBe(true)
    expect(after.filter(s => s.index === 2)).toHaveLength(1)
    const setEnds = await ofType('set_end')
    expect(setEnds).toHaveLength(1)
    expect(setEnds[0].setIndex).toBe(1)
  }, 60000)

  // Only a 'final' match went back to live, a status beach writes at Close
  // match only: a finished match not approved is 'ended'. It stayed 'ended'
  // here and in the cloud with its signatures and approvals, which then
  // certified the new result unsigned; a reload opened Match End with set 1
  // unfinished.
  it('a match left ended, reopened, is live again, its closing signatures and approvals gone, here and in the cloud', async () => {
    const undo = vi.spyOn(approvalsApi, 'undo').mockResolvedValue({ data: null, error: null, status: 200 })
    const matchId = await setUpEndedMatch()
    const set2 = (await db.sets.where({ matchId }).toArray()).find(s => s.index === 2)
    mount(matchId)

    await reopenSet1()
    const match = await db.matches.get(matchId)
    expect(match.status).toBe('live')
    expect(match.approved).toBe(false)
    expect(match.approvedAt ?? null).toBeNull()
    for (const field of Object.keys(POST_MATCH_SIGNATURE_KEYS)) expect(match[field] ?? null).toBeNull()
    expect(match.signatureSources?.ref1Signature ?? null).toBeNull()
    expect(match.accountApprovals ?? null).toBeNull()
    expect((await db.sets.where({ matchId }).toArray()).map(s => [s.index, !!s.finished])).toEqual([[1, false]])

    // The cloud: live, every closing signature cleared; set 2 removed
    const jobs = await db.sync_queue.toArray()
    const live = jobs.find(j => j.resource === 'match' && j.action === 'update' && j.payload.status === 'live')
    expect(live?.payload.id).toBe(SEED)
    for (const key of Object.values(POST_MATCH_SIGNATURE_KEYS)) expect(live.payload.signatures[key]).toBeNull()
    expect(jobs.some(j => j.resource === 'set' && j.action === 'delete' && j.payload.external_id === setExtId(SEED, set2.id))).toBe(true)
    // The account approvals undone on the server at once (online)
    await waitFor(() => expect(undo.mock.calls.map(c => c[0]).sort()).toEqual(['referee1-approval', 'scorer-approval']))

    // Set 1 ends again, and set 2 opens to be played again
    await confirmSetEnd()
    await waitFor(async () => expect((await db.sets.where({ matchId }).toArray()).map(s => [s.index, !!s.finished])).toEqual([[1, true], [2, false]]), { timeout: 10000 })
  }, 60000)
})
