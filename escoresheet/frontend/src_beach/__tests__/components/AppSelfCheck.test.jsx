// The device's self-check when the app opens, on Continue and back from the
// background (ported from OpenVolley's AppSelfCheck and AppOpenAndResume
// tests, 3.0.6; the owner's rules of 2026-10-27). OpenBeach only heard that
// the server had closed a match when a write of its copy was refused, and
// that another device scored it through a refused write or the relay nudge:
// a copy that wrote nothing looked live for days (OpenVolley 2026-10-27,
// match 406970). The server is asked now, never in the way: offline or
// signed out nothing waits, and nothing is removed without the user.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep } from '../helpers/appMount'
import { UiHost } from '../../ui/volleyui/UiHost.jsx'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
import {
  SEED, MIN, ago, seedMatch, signIn, answerServer, rowsReads, callsTo, closedRow, openRow, offlineDevice, backgroundClock, reloadInto
} from '../helpers/selfCheckFixtures'

beforeAll(offline)
afterAll(online)
beforeEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(table => table.clear()))
  // a storage that keeps the session (the setup's localStorage keeps nothing)
  useMemoryLocalStorage()
  sessionStorage.clear()
  globalThis.fetch.mockImplementation(() => Promise.reject(new TypeError('offline (test)')))
})

const continueCard = () => document.querySelector('[data-testid="continue-card"]')
const notice = () => document.querySelector('[data-testid="self-check-notice"]')
const states = (root = document) => [...root.querySelectorAll('[data-testid="match-state"]')].map(e => e.textContent)
const closedModal = () => document.querySelector('[data-testid="closed-copy-modal"]')
const movedModal = () => document.querySelector('[data-testid="scorer-moved-modal"]')
const homeShown = () => !!button('Restore match')
const scoreboardShown = () => !!document.querySelector('[data-testid="scoring-layout"]')
const inside = (root, text) => [...(root?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === text && !b.disabled)
const OTHER = 'match_1792518600000_other'

describe('the check when the app opens', () => {
  it('the owner\'s case: a live copy the server has closed stays on Home, marked; Continue opens it read-only', async () => {
    const id = await seedMatch({ at: ago(20 * MIN) })
    await db.sync_queue.add({ resource: 'event', action: 'insert', payload: { external_id: `${SEED}:e:9`, match_id: SEED }, ts: ago(MIN), status: 'queued' })
    signIn()
    answerServer(() => [closedRow])
    mountApp()
    await waitFor(() => expect(notice()?.textContent).toContain('Match 4711 is closed on the server'))
    expect(rowsReads()).toHaveLength(1)
    await waitFor(() => expect(states(continueCard())).toContain('Closed on the server'))
    // marked as a refused write marks it: the block, its writes set aside
    expect(await db.matches.get(id)).toMatchObject({ status: 'live', cloudBlock: { code: 'OV_MATCH_CLOSED' } })
    expect((await db.sync_queue.toArray()).map(j => [j.status, j.superseded_by])).toEqual([['superseded', 'server-closed']])
    expect(homeShown()).toBe(true)
    expect(scoreboardShown()).toBe(false)

    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(closedModal()).toBeTruthy())
    expect(scoreboardShown()).toBe(false)
    // offline for the official version: it says so, the copy stays
    globalThis.fetch.mockImplementation(() => Promise.reject(new TypeError('offline (test)')))
    const onLine = offlineDevice()
    try {
      fireEvent.click(inside(closedModal(), 'Load the official version'))
      await waitFor(() => expect(document.querySelector('[data-testid="closed-copy-error"]')?.textContent).toContain('needs a connection'))
    } finally {
      onLine.mockRestore()
    }
    fireEvent.click(inside(closedModal(), 'Close'))
    await waitFor(() => expect(closedModal()).toBeNull())
    expect(await db.matches.count()).toBe(1)
  })

  it('Remove from this device on a closed copy: local only, no server delete, the losses named first', async () => {
    const id = await seedMatch({ at: ago(20 * MIN), cloudBlock: { code: 'OV_MATCH_CLOSED', claim: null, at: 1 } })
    await db.sync_queue.add({ resource: 'event', action: 'insert', payload: { external_id: `${SEED}:e:9`, match_id: SEED }, ts: ago(MIN), status: 'superseded', superseded_by: 'server-closed' })
    render(<UiHost />)
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      fireEvent.click(button('Continue match'))
      await waitFor(() => expect(closedModal()).toBeTruthy())
      fireEvent.click(inside(closedModal(), 'Remove from this device'))
      await waitFor(() => expect(document.body.textContent).toContain('Only the copy on this device is deleted. The official version stays on the server.'))
      expect(document.querySelector('[data-testid="delete-loss-warning"]')?.textContent).toContain('1 change not sent')
      fireEvent.change(document.querySelector('#ob-delete-pin'), { target: { value: '482915' } })
      fireEvent.click(document.querySelector('[data-testid="delete-match-confirm"]'))
      await waitFor(async () => expect(await db.matches.get(id)).toBeUndefined())
      // no delete job for the server: it keeps its closed record
      expect((await db.sync_queue.toArray()).filter(j => j.action === 'delete')).toEqual([])
      await waitFor(() => expect(closedModal()).toBeNull())
    } finally {
      onLine.mockRestore()
    }
  })

  it('open on the server and scored here: "Scoring here", one read of the rows, no notice', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    signIn()
    answerServer(() => [openRow], { scorer: { mine: true } })
    mountApp()
    await waitFor(() => expect(states(continueCard() || document)).toContain('Scoring here'))
    expect(rowsReads()).toHaveLength(1)
    expect(callsTo('/api/match/scorer').map(b => b?.claim)).toEqual([false])
    expect(notice()).toBeNull()
    await sleep(300)
    expect(homeShown()).toBe(true)
  })

  it('another device scores it now: marked; Continue shows the moved notice, Close goes Home', async () => {
    const id = await seedMatch({ at: ago(20 * MIN) })
    signIn()
    answerServer(() => [openRow], { scorer: { mine: false, scorer: { platform: 'android', at: ago(10 * MIN) } } })
    mountApp()
    await waitFor(() => expect(states(continueCard() || document)).toContain('On another device'))
    expect((await db.matches.get(id)).cloudBlock).toMatchObject({ code: 'OV_SCORER_MOVED' })
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(movedModal()).toBeTruthy())
    fireEvent.click(inside(movedModal(), 'Close'))
    await waitFor(() => expect(homeShown()).toBe(true))
  })

  it('offline, signed out, or a read that fails: nothing waits, nothing is marked, "Not checked"', async () => {
    const id = await seedMatch({ at: ago(20 * MIN) })
    // signed out
    answerServer(() => [closedRow])
    let view = mountApp()
    await waitFor(() => expect(states(continueCard() || document)).toContain('Not checked'))
    await sleep(300)
    expect(rowsReads()).toHaveLength(0)
    view.unmount()
    // offline
    signIn()
    const onLine = offlineDevice()
    try {
      view = mountApp()
      await waitFor(() => expect(states(continueCard() || document)).toContain('Not checked'))
      await sleep(300)
      expect(rowsReads()).toHaveLength(0)
      view.unmount()
    } finally {
      onLine.mockRestore()
    }
    // the read fails
    answerServer(() => ({ status: 503, body: { error: { message: 'Database unavailable', code: 'OV_DB_UNAVAILABLE' } } }))
    mountApp()
    await waitFor(() => expect(rowsReads().length).toBeGreaterThan(0))
    await sleep(300)
    expect(states(continueCard())).toContain('Not checked')
    expect((await db.matches.get(id)).cloudBlock ?? null).toBeNull()
  })

  it('Continue asks again: a copy closed since the start opens read-only, never on the scoring screen', async () => {
    const id = await seedMatch({ at: ago(20 * MIN) })
    signIn()
    answerServer((keys, n) => (n === 1 ? [openRow] : [closedRow]), { scorer: { mine: true } })
    mountApp()
    await waitFor(() => expect(states(continueCard() || document)).toContain('Scoring here'))
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(closedModal()).toBeTruthy())
    expect(rowsReads()).toHaveLength(2)
    expect(scoreboardShown()).toBe(false)
    expect((await db.matches.get(id)).cloudBlock).toMatchObject({ code: 'OV_MATCH_CLOSED' })
  })

  it('a server that does not answer: Continue opens the match after a few seconds at most', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    signIn()
    answerServer(() => new Promise(() => {}))
    mountApp()
    await waitFor(() => expect(continueCard()).toBeTruthy())
    const t0 = Date.now()
    fireEvent.click(button('Continue match'))
    await waitFor(() => expect(scoreboardShown()).toBe(true), { timeout: 8000 })
    expect(Date.now() - t0).toBeLessThan(6000)
  })

  it('a test match is never asked about', async () => {
    await seedMatch({ at: ago(20 * MIN), test: true, seed_key: 'test_match_beach_1', matchInfoConfirmedAt: null })
    signIn()
    answerServer(() => [closedRow])
    mountApp()
    await waitFor(() => expect(continueCard()).toBeTruthy())
    await sleep(500)
    expect(rowsReads()).toHaveLength(0)
    expect(states(continueCard())).toEqual([])
  })

  it('a match approved here is left to its Close match: not asked, no state; Continue opens its Match End', async () => {
    const id = await seedMatch({ at: ago(20 * MIN), status: 'ended', approved: true })
    await db.sets.where('matchId').equals(id).modify(s => { if (s.index === 3) Object.assign(s, { team1Points: 15, team2Points: 10, finished: true }) })
    signIn()
    answerServer(() => [closedRow])
    mountApp()
    await waitFor(() => expect(continueCard()).toBeTruthy())
    await sleep(500)
    expect(rowsReads()).toHaveLength(0)
    expect(states(continueCard())).toEqual([])
    expect(await db.matches.get(id)).toMatchObject({ status: 'ended', approved: true })
  })

  it('back after 16 minutes in the background: Home, and the server is asked again', async () => {
    const id = await seedMatch({ at: ago(5 * MIN) })
    reloadInto(id)
    signIn()
    answerServer(() => [openRow], { scorer: { mine: true } })
    const bg = backgroundClock()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      await waitFor(() => expect(rowsReads()).toHaveLength(1))
      bg.hide()
      bg.advance(16 * MIN)
      bg.show()
      await waitFor(() => expect(homeShown()).toBe(true))
      await waitFor(() => expect(rowsReads()).toHaveLength(2))
    } finally {
      bg.restore()
    }
  })
})

describe('copies of one match', () => {
  async function secondCopy({ events = 0 } = {}) {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    const created = ago(2 * 60 * MIN)
    const copy = await db.matches.add({ team1Id, team2Id, status: 'live', test: false, createdAt: created, matchInfoConfirmedAt: created, seed_key: SEED, gameN: 4711, gamePin: '482915' })
    for (let i = 0; i < events; i++) await db.events.add({ matchId: copy, setIndex: 1, type: 'point', seq: 100 + i, ts: ago(MIN), payload: {} })
    return copy
  }

  it('flagged, nothing removed by the check; Clean up removes, after one question, the copy that holds nothing of its own', async () => {
    const kept = await seedMatch({ at: ago(20 * MIN) })
    const empty = await secondCopy()
    render(<UiHost />)
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(notice()?.textContent).toContain('Match 4711 has 1 extra copy on this device that holds nothing of its own.'))
      expect(await db.matches.count()).toBe(2)
      fireEvent.click(inside(notice(), 'Clean up'))
      await waitFor(() => expect(document.body.textContent).toContain('Remove the extra copy of match 4711 from this device?'))
      const dialog = [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].find(d => d.textContent.includes('Remove the extra copy'))
      fireEvent.click(inside(dialog, 'Clean up'))
      await waitFor(async () => expect(await db.matches.get(empty)).toBeUndefined())
      expect(await db.matches.get(kept)).toBeTruthy()
      await waitFor(() => expect(notice()?.textContent).toContain('Removed a second copy of match 4711'))
    } finally {
      onLine.mockRestore()
    }
  })

  it('two copies that each hold something: both kept, the one less far on has Remove', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    await secondCopy({ events: 1 })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(notice()?.textContent).toContain('Match 4711 is on this device twice'))
      expect(inside(notice(), 'Remove')).toBeTruthy()
      expect(inside(notice(), 'Clean up')).toBeFalsy()
      expect(await db.matches.count()).toBe(2)
    } finally {
      onLine.mockRestore()
    }
  })

  it('another match on the device is not a copy', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    await seedMatch({ at: ago(30 * MIN), seed_key: OTHER, gameN: 4712 })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      await sleep(500)
      expect(notice()).toBeNull()
    } finally {
      onLine.mockRestore()
    }
  })
})
