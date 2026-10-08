// A BMP after a decision change (the owner, 2026-10-08: after a decision
// change gives the point to the other team, may the team that now loses the
// point request a BMP on it? "yes"), on the real scoring screen over the
// app's real Dexie database (fake IndexedDB), driven with taps. The decision
// change greyed the BMP buttons ('moved on'). Still once per rally; the
// decision change "replay the rally" leaves no completed rally, no BMP.
// Network is off: no relay socket, no fetch.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
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
const events = async () => (await db.events.toArray()).sort((a, b) => a.seq - b.seq)
const ofType = async (type) => (await events()).filter(e => e.type === type)
// the scoring screen's team BMP buttons ("BMP" + the BMPs left)
const bmpButtons = () => [...document.querySelectorAll('button')].filter(b => /^BMP\d$/.test(b.textContent.trim()))

async function setUpMatch() {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_bmp_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  await db.sets.add({ matchId, index: 1, team1Points: 0, team2Points: 0, finished: false, startTime: new Date().toISOString() })
  await db.events.add({ matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: 1, ts: new Date().toISOString() })
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)

async function startSet() {
  await waitFor(() => expect(button('Start set')).toBeTruthy())
  fireEvent.click(button('Start set'))
  await waitFor(() => expect(button('Confirm')).toBeTruthy())
  fireEvent.click(button('Confirm'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}

// Team A wins the rally in play (the first one is started by startSet)
async function pointA() {
  const before = (await ofType('point')).length
  fireEvent.click(button('Point A'))
  await waitFor(async () => expect((await ofType('point')).length).toBe(before + 1))
}
async function startRally() {
  await waitFor(() => expect(button('Start rally')).toBeTruthy())
  fireEvent.click(button('Start rally'))
  await waitFor(() => expect(button('Point A')).toBeTruthy())
}
async function unsuccessfulBmp(open) {
  const before = (await ofType('challenge_outcome')).length
  fireEvent.click(open)
  await waitFor(() => expect(button('Unsuccessful')).toBeTruthy())
  fireEvent.click(button('Unsuccessful'))
  await waitFor(() => expect(button('Confirm Unsuccessful')).toBeTruthy())
  fireEvent.click(button('Confirm Unsuccessful'))
  await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(before + 1))
  await settle()
}

const allGrey = () => bmpButtons().length === 2 && bmpButtons().every(b => b.disabled)
const allOn = () => bmpButtons().length === 2 && bmpButtons().every(b => !b.disabled)
const optionTile = (text) => [...document.querySelectorAll('span')].find(s => s.textContent.trim() === text)?.parentElement

// The scoring screen's "Decision change": the dialog pre-selects "Assign to
// other team"; `option` picks the other one first
async function decisionChange(option) {
  const before = (await ofType('decision_change')).length + (await ofType('replay')).length
  await waitFor(() => expect(button('Decision change')).toBeTruthy())
  fireEvent.click(button('Decision change'))
  await waitFor(() => expect(optionTile('Assign to other team')).toBeTruthy())
  if (option) fireEvent.click(optionTile(option))
  await settle()
  fireEvent.click(button('Confirm'))
  await waitFor(async () => expect((await ofType('decision_change')).length + (await ofType('replay')).length).toBe(before + 1))
  await waitFor(() => expect(optionTile('Assign to other team')).toBeFalsy())
  await settle()
}
const score = async () => { const [s] = await db.sets.toArray(); return [s.team1Points, s.team2Points] }

describe('Scoreboard_beach: a BMP after a decision change', () => {
  it('the point given to the other team: a BMP on that rally, once; greyed with the next rally; after a reload too', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await pointA()
    await waitFor(() => expect(allOn()).toBe(true))
    // the referee changes the decision: the point goes to team B
    await decisionChange()
    expect(await score()).toEqual([0, 1])
    // team A, which now loses the point, may ask for a BMP on that rally
    await waitFor(() => expect(allOn()).toBe(true))
    // and after a reload (read from the events)
    cleanup(); mount(matchId)
    await waitFor(() => expect(bmpButtons().length).toBe(2))
    await settle()
    expect(allOn()).toBe(true)
    // team A (left) asks: unsuccessful. Once per rally: greyed
    await unsuccessfulBmp(bmpButtons()[0])
    await waitFor(() => expect(allGrey()).toBe(true))
    expect(bmpButtons()[0].title).toContain('once per rally')
    // the next rally: greyed while in play, open again once it is completed
    await startRally()
    expect(allGrey()).toBe(true)
    await pointA()
    await waitFor(() => expect(allOn()).toBe(true))
    cleanup()
  }, 60000)

  it('once the next rally starts after the decision change: greyed', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await pointA()
    await decisionChange()
    await waitFor(() => expect(allOn()).toBe(true))
    await startRally()
    expect(allGrey()).toBe(true)
    cleanup()
  }, 60000)

  it('a decision change after a successful BMP on that rally: no second BMP', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await pointA()
    await waitFor(() => expect(allOn()).toBe(true))
    // team B successful BMP: the point goes to B
    fireEvent.click(bmpButtons()[1])
    await waitFor(() => expect(button('Successful')).toBeTruthy())
    fireEvent.click(button('Successful'))
    await waitFor(() => expect(button('Confirm Successful')).toBeTruthy())
    fireEvent.click(button('Confirm Successful'))
    await waitFor(async () => expect(await ofType('challenge_outcome')).toHaveLength(1))
    await settle()
    expect(await score()).toEqual([0, 1])
    await waitFor(() => expect(allGrey()).toBe(true))
    // the referee changes the decision again: back to A. That rally had its BMP
    await decisionChange()
    expect(await score()).toEqual([1, 0])
    await settle()
    expect(allGrey()).toBe(true)
    cleanup()
  }, 60000)

  it('the decision change "replay the rally": no completed rally, no BMP', async () => {
    const matchId = await setUpMatch()
    mount(matchId)
    await startSet()
    await pointA()
    await waitFor(() => expect(allOn()).toBe(true))
    await decisionChange('Replay the rally')
    expect(await score()).toEqual([0, 0])
    expect(allGrey()).toBe(true)
    cleanup()
  }, 60000)
})
