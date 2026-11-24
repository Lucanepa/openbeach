// One scoring tab per match, after a reload too (ported from OpenVolley
// 65afd3eb).
//
// The scoreboard marks its tab in localStorage ('scoresheet-active-<match>')
// and answers a new tab's question on a BroadcastChannel. The mark is cleared
// only when the screen unmounts, which a reload, a closed tab or a crash never
// does, so after any reload the tab found a mark left by its old page, claimed
// it after a 200 ms probe and returned before setting up its answers: it
// never answered again, and a later tab opened the same live match as well.
// Both scored; both showed "Set 1 end" and the second Confirm wrote a set_end
// into set 2 at 0:0, on the server too; both showed "Court switch required"
// and the second Switch courts put the teams back on their old sides with a
// second court_switch at the same score (stress test 2026-10-25). The tab now
// holds a Web Lock for its life (the browser frees it on reload, close or
// crash); without Web Locks every tab answers; a set end confirmed elsewhere
// closes the dialog and is not written again, nor is a change of courts.
//
// Two "tabs": two scoring screens of the same match on one page, sharing
// localStorage, the BroadcastChannel and (lock path) one lock manager, over
// the app's real Dexie database (fake IndexedDB).
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
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

class OfflineSocket {
  constructor() { this.readyState = 3 }
  send() {}
  close() {}
  addEventListener() {}
  removeEventListener() {}
}

let saved
const setViewport = (width, height) => {
  window.innerWidth = width
  window.innerHeight = height
}
beforeAll(() => {
  saved = { WebSocket: globalThis.WebSocket, fetch: globalThis.fetch, act: globalThis.IS_REACT_ACT_ENVIRONMENT, width: window.innerWidth, height: window.innerHeight }
  globalThis.WebSocket = OfflineSocket
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('offline (test)')))
  globalThis.IS_REACT_ACT_ENVIRONMENT = false
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
})
beforeEach(async () => {
  cleanup()
  delete navigator.locks
  useMemoryLocalStorage()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterAll(() => {
  cleanup()
  delete navigator.locks
  setViewport(saved.width, saved.height)
  globalThis.WebSocket = saved.WebSocket
  globalThis.fetch = saved.fetch
  globalThis.IS_REACT_ACT_ENVIRONMENT = saved.act
  vi.restoreAllMocks()
})

const wait = (ms) => new Promise(r => setTimeout(r, ms))
const button = (text, root = document) => [...root.querySelectorAll('button')].find(b => b.textContent.trim() === text && !b.disabled)

// The browser's lock manager (navigator.locks), exclusive locks only: what
// the screen uses of it
function fakeLockManager() {
  const held = new Set()
  const waiting = new Map()
  const grantNext = (name) => {
    const queue = waiting.get(name) || []
    const next = queue.shift()
    if (next) next()
  }
  return {
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = {} }
      return new Promise((resolve, reject) => {
        const grant = () => {
          held.add(name)
          Promise.resolve()
            .then(() => callback({ name, mode: 'exclusive' }))
            .then(resolve, reject)
            .finally(() => { held.delete(name); grantNext(name) })
        }
        if (!held.has(name)) { grant(); return }
        if (options.ifAvailable) { Promise.resolve(callback(null)).then(resolve, reject); return }
        const queue = waiting.get(name) || []
        waiting.set(name, queue)
        queue.push(grant)
        options.signal?.addEventListener('abort', () => {
          const at = queue.indexOf(grant)
          if (at >= 0) { queue.splice(at, 1); reject(new DOMException('aborted', 'AbortError')) }
        })
      })
    }
  }
}

// Set 1 at `team1`:`team2`, no rally in play, team 1 (A) on the left
async function setUpMatch({ team1: team1Points = 1, team2: team2Points = 1 } = {}) {
  const t1 = await db.teams.add({ name: 'Alpha / Beta' })
  const t2 = await db.teams.add({ name: 'Gamma / Delta' })
  await db.players.bulkAdd([
    { teamId: t1, number: 1, name: 'Alpha' }, { teamId: t1, number: 2, name: 'Beta' },
    { teamId: t2, number: 1, name: 'Gamma' }, { teamId: t2, number: 2, name: 'Delta' }
  ])
  const matchId = await db.matches.add({
    team1Id: t1, team2Id: t2, status: 'live', test: false, seed_key: 'match_single_tab_test',
    firstServe: 'team1', coinTossTeamA: 'team1', coinTossTeamB: 'team2', team1FirstServe: 1, team2FirstServe: 1
  })
  const t = new Date(Date.now() - 30 * 60 * 1000).toISOString()
  await db.sets.add({ matchId, index: 1, team1Points, team2Points, finished: false, startTime: t })
  let seq = 1
  const events = [
    { matchId, setIndex: 1, type: 'coin_toss', payload: {}, seq: seq++, ts: t },
    { matchId, setIndex: 1, type: 'set_start', payload: {}, seq: seq++, ts: t }
  ]
  // team 2's points first, then team 1's run
  const score = { team1: 0, team2: 0 }
  for (let k = 0; k < team1Points + team2Points; k++) {
    const team = k < team2Points ? 'team2' : 'team1'
    score[team]++
    events.push({ matchId, setIndex: 1, type: 'rally_start', payload: {}, seq: seq++, ts: t })
    events.push({ matchId, setIndex: 1, type: 'point', payload: { team, score: { ...score } }, seq: seq++, ts: t })
  }
  await db.events.bulkAdd(events)
  return matchId
}

const mount = (matchId) => render(<ScaleProvider><AlertProvider><LoggingProvider><Scoreboard matchId={matchId} /></LoggingProvider></AlertProvider></ScaleProvider>)
const blocked = (tab) => /Scoresheet already open/.test(tab.container.textContent)
const scoring = (tab) => !!button('Start rally', tab.container)
const nextSeq = async () => (await db.events.toArray()).reduce((m, e) => Math.max(m, e.seq), 0) + 1

// What a reload, a closed tab or a crash leaves: the mark of a page now gone
const leaveStaleMark = (matchId) => localStorage.setItem(`scoresheet-active-${matchId}`, 'page-before-reload')

describe('Scoreboard_beach: one scoring tab per match', () => {
  it('Web Locks: after a reload a second tab is blocked, and takes over once the first one is closed', async () => {
    setViewport(1280, 800)
    Object.defineProperty(navigator, 'locks', { value: fakeLockManager(), configurable: true })
    const matchId = await setUpMatch()
    leaveStaleMark(matchId)
    const a = mount(matchId)
    await waitFor(() => expect(scoring(a)).toBe(true), { timeout: 10000 })
    await wait(500)
    const b = mount(matchId)
    await waitFor(() => expect(blocked(b)).toBe(true), { timeout: 5000 })
    await wait(500)
    expect(blocked(a)).toBe(false)
    expect(scoring(a)).toBe(true)

    // the first tab closed: the browser frees its lock, the second one scores
    a.unmount()
    await waitFor(() => expect(scoring(b)).toBe(true), { timeout: 10000 })
    expect(blocked(b)).toBe(false)
  }, 60000)

  it('without Web Locks: after a reload a second tab is blocked', async () => {
    setViewport(1280, 800)
    const matchId = await setUpMatch()
    leaveStaleMark(matchId)
    const a = mount(matchId)
    await waitFor(() => expect(scoring(a)).toBe(true), { timeout: 10000 })
    // past the reloaded tab's probe of the old mark
    await wait(500)
    const b = mount(matchId)
    await waitFor(() => expect(blocked(b)).toBe(true), { timeout: 5000 })
    await wait(500)
    expect(blocked(a)).toBe(false)
    expect(scoring(a)).toBe(true)
  }, 60000)

  it('a set end confirmed in another tab closes the Set end dialog and is not written again', async () => {
    setViewport(1280, 800)
    const matchId = await setUpMatch({ team1: 21, team2: 1 })
    mount(matchId)
    const dialog = () => [...document.querySelectorAll('[role="dialog"]')].find(d => /Set 1 end/.test(d.textContent))
    await waitFor(() => expect(dialog()).toBeTruthy(), { timeout: 10000 })
    const confirm = button('Confirm', dialog())
    expect(confirm).toBeTruthy()

    // the other tab confirms it: set 1 finished, its set_end, set 2
    const seq = await nextSeq()
    const set1 = await db.sets.where({ matchId, index: 1 }).first()
    const now = new Date().toISOString()
    await db.transaction('rw', db.sets, db.events, async () => {
      await db.events.add({ matchId, setIndex: 1, type: 'set_end', payload: { team: 'team1', teamLabel: 'A', setIndex: 1, team1Points: 21, team2Points: 1, endTime: now }, seq, ts: now })
      await db.sets.update(set1.id, { finished: true, endTime: now })
      await db.sets.add({ matchId, index: 2, team1Points: 0, team2Points: 0, finished: false })
    })

    // this tab's dialog: gone; still open, its Confirm is what the scorer taps
    await wait(1500)
    if (confirm.isConnected) {
      await wait(GHOST_CLICK_MS)
      fireEvent.click(confirm)
      await wait(1500)
    }
    const setEnds = (await db.events.toArray()).filter(e => e.type === 'set_end')
    expect(setEnds).toHaveLength(1)
    expect(setEnds[0].setIndex).toBe(1)
    expect((await db.sets.where({ matchId }).toArray()).filter(s => s.index === 2)).toHaveLength(1)
    expect(dialog()).toBeFalsy()
  }, 60000)

  it('a change of courts made in another tab is not made again by this tab\'s dialog', async () => {
    setViewport(1280, 800)
    const matchId = await setUpMatch({ team1: 4, team2: 3 })
    mount(matchId)
    const dialog = () => [...document.querySelectorAll('[role="dialog"]')].find(d => /Court switch/i.test(d.textContent))
    await waitFor(() => expect(dialog()).toBeTruthy(), { timeout: 10000 })

    // the other tab switched the courts at 4:3
    const seq = await nextSeq()
    const now = new Date().toISOString()
    await db.transaction('rw', db.matches, db.events, async () => {
      await db.matches.update(matchId, { setLeftTeamOverrides: { 1: 'B' } })
      await db.events.add({ matchId, setIndex: 1, type: 'court_switch', payload: { score: { team1: 4, team2: 3 }, preSwitchOverrides: {}, teamA: 'team1' }, seq, ts: now })
    })
    await wait(500)

    await wait(GHOST_CLICK_MS)
    fireEvent.click(button('Switch courts', dialog()))
    await wait(1500)
    expect((await db.events.toArray()).filter(e => e.type === 'court_switch')).toHaveLength(1)
    expect((await db.matches.get(matchId)).setLeftTeamOverrides).toEqual({ 1: 'B' })
  }, 60000)
})
