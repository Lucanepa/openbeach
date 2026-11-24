// Opening, reloading and coming back to the app (the owner's start and
// resume rules, 2026-10-27, ported from OpenVolley's AppOpenAndResume test,
// 3.0.6). OpenBeach reopened at start, by itself, the first 'live' match on
// the device (the lowest id, closed on the server or not), an ended match on
// Match End and a match with a roster waiting on Match Setup. 2026-10-29:
// OpenVolley's desktop app froze on exactly such a stale copy, reopened at
// start, when the start-up update reloaded on its scoring screen.
// 1. Opening the app always lands on Home, with a Continue card for the match
//    in progress. A crash or a kill counts as an opening.
// 2. A reload goes back into the match: a sessionStorage marker, which a
//    reload keeps and an app kill or a new tab does not; a tab the browser
//    discarded (document.wasDiscarded) too.
// 3. 15 minutes or more in the background (hidden, never visible and idle)
//    goes to Home. It only changes the screen.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { waitFor, fireEvent, cleanup } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { offline, online, mountApp, button, sleep } from '../helpers/appMount'
import { SEED, MIN, HOUR, ago, OPEN_MATCH_KEY, reloadInto, seedMatch, offlineDevice, backgroundClock } from '../helpers/selfCheckFixtures'

beforeAll(offline)
afterAll(online)
beforeEach(async () => {
  cleanup()
  await Promise.all(db.tables.map(table => table.clear()))
  sessionStorage.clear()
})

const continueCard = () => document.querySelector('[data-testid="continue-card"]')
const homeShown = () => !!button('Restore match')
const scoreboardShown = () => !homeShown() && !!document.querySelector('[data-testid="scoring-layout"]')
const matchSetupShown = () => !homeShown() && [...document.querySelectorAll('h2')].some(h => h.textContent.trim() === 'Match setup')
const marker = () => JSON.parse(sessionStorage.getItem(OPEN_MATCH_KEY) || 'null')
// Two more official matches on the device
const SECOND = 'match_1792518600000_second'
const OLDER = 'match_1792518600000_older'

describe('Opening the app lands on Home', () => {
  it('a fresh start with a live match scored 20 minutes ago, offline: Home with the Continue card, one tap back', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()?.textContent).toContain('Müller / Weber – Schmidt / Fischer'))
      const text = continueCard().textContent
      expect(text).toContain('Set 3 · 12:10 · sets 1:1')
      expect(text).toContain('Last saved')
      await sleep(800)
      expect(homeShown()).toBe(true)
      expect(scoreboardShown()).toBe(false)
      expect(marker()).toBeNull()

      fireEvent.click(button('Continue match'))
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      // the match screen is marked for a reload
      expect(marker()).toMatchObject({ view: 'scoreboard' })
    } finally {
      onLine.mockRestore()
    }
  })

  it('two live matches: neither opens, not even the lowest id (the old start-up rule)', async () => {
    await seedMatch({ at: ago(3 * HOUR) })
    await seedMatch({ at: ago(10 * MIN), seed_key: SECOND, gameN: 4712 })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      await sleep(800)
      expect(homeShown()).toBe(true)
      expect(scoreboardShown()).toBe(false)
    } finally {
      onLine.mockRestore()
    }
  })

  it('a live copy the server has closed is never opened at start', async () => {
    await seedMatch({ at: ago(20 * MIN), cloudBlock: { code: 'OV_MATCH_CLOSED', claim: null, at: Date.now() } })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(homeShown()).toBe(true))
      await sleep(800)
      expect(homeShown()).toBe(true)
      expect(scoreboardShown()).toBe(false)
    } finally {
      onLine.mockRestore()
    }
  })

  it('a match with a roster waiting stays on Home (its Match Setup opened by itself)', async () => {
    const created = ago(HOUR)
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    await db.matches.add({ team1Id, team2Id, status: 'scheduled', test: false, createdAt: created, matchInfoConfirmedAt: created, seed_key: SEED, gameN: 4711, pendingTeam2Roster: { players: [{ number: 1, lastName: 'Fischer' }] } })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      await sleep(800)
      expect(homeShown()).toBe(true)
      expect(matchSetupShown()).toBe(false)
    } finally {
      onLine.mockRestore()
    }
  })
})

describe('A reload goes back into the match', () => {
  it('the marker names a live match on the device: its scoring screen', async () => {
    const id = await seedMatch({ at: ago(20 * MIN) })
    reloadInto(id)
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      expect(marker()).toMatchObject({ id })
    } finally {
      onLine.mockRestore()
    }
  })

  it('a reload in Match Setup goes back to Match Setup', async () => {
    const created = ago(HOUR)
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    const id = await db.matches.add({ team1Id, team2Id, status: 'scheduled', test: false, createdAt: created, matchInfoConfirmedAt: created, seed_key: SEED, gameN: 4711 })
    reloadInto(id, 'matchSetup')
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(matchSetupShown()).toBe(true))
      expect(marker()).toEqual({ id, view: 'matchSetup' })
    } finally {
      onLine.mockRestore()
    }
  })

  it('a marker naming a match no longer on the device: Home, the marker cleared', async () => {
    await seedMatch({ at: ago(20 * MIN) })
    reloadInto(9999)
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      await sleep(500)
      expect(homeShown()).toBe(true)
      expect(marker()).toBeNull()
    } finally {
      onLine.mockRestore()
    }
  })

  it('a tab the browser discarded (document.wasDiscarded) reopens the live match last scored', async () => {
    await seedMatch({ at: ago(3 * HOUR), seed_key: OLDER, gameN: 4710 })
    const newer = await seedMatch({ at: ago(20 * MIN) })
    Object.defineProperty(document, 'wasDiscarded', { value: true, configurable: true })
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      expect(marker()).toMatchObject({ id: newer })
    } finally {
      onLine.mockRestore()
      delete document.wasDiscarded
    }
  })

  it('Home from the scoring screen clears the marker: a reload then stays on Home', async () => {
    const id = await seedMatch({ at: ago(5 * MIN) })
    reloadInto(id)
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      // the header's menu: Home
      fireEvent.click(document.querySelector('[aria-label="Menu"]') || button('Menu'))
      await waitFor(() => expect(button('Home')).toBeTruthy())
      fireEvent.click(button('Home'))
      await waitFor(() => expect(homeShown()).toBe(true))
      await waitFor(() => expect(marker()).toBeNull())
    } finally {
      onLine.mockRestore()
    }
  })
})

describe('15 minutes in the background goes to Home', () => {
  async function inTheMatch() {
    const id = await seedMatch({ at: ago(5 * MIN) })
    reloadInto(id)
    return id
  }

  it('back after 16 minutes hidden: Home with the Continue card; nothing closed, locked, set aside or deleted', async () => {
    const id = await inTheMatch()
    await db.sync_queue.add({ resource: 'event', action: 'insert', payload: { external_id: `${SEED}:e:9`, match_id: SEED }, ts: ago(MIN), status: 'queued' })
    const onLine = offlineDevice()
    const bg = backgroundClock()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      const before = { match: await db.matches.get(id), events: await db.events.where('matchId').equals(id).count(), jobs: await db.sync_queue.toArray() }
      bg.hide()
      bg.advance(16 * MIN)
      bg.show()
      await waitFor(() => expect(homeShown()).toBe(true))
      await waitFor(() => expect(continueCard()).toBeTruthy())
      expect(scoreboardShown()).toBe(false)
      const after = await db.matches.get(id)
      expect(after.status).toBe(before.match.status)
      expect(after.cloudBlock ?? null).toBeNull()
      expect(await db.events.where('matchId').equals(id).count()).toBe(before.events)
      expect((await db.sync_queue.toArray()).map(j => j.status)).toEqual(before.jobs.map(j => j.status))
      // a reload now stays on Home
      expect(marker()).toBeNull()
      // and Continue brings the match back in one tap
      fireEvent.click(button('Continue match'))
      await waitFor(() => expect(scoreboardShown()).toBe(true))
    } finally {
      bg.restore()
      onLine.mockRestore()
    }
  })

  it('5 minutes hidden, or 20 minutes visible and idle: the scoring screen stays', async () => {
    await inTheMatch()
    const onLine = offlineDevice()
    const bg = backgroundClock()
    try {
      mountApp()
      await waitFor(() => expect(scoreboardShown()).toBe(true))
      bg.hide()
      bg.advance(5 * MIN)
      bg.show()
      await sleep(500)
      expect(scoreboardShown()).toBe(true)
      bg.advance(20 * MIN)
      document.dispatchEvent(new Event('visibilitychange'))
      await sleep(500)
      expect(scoreboardShown()).toBe(true)
    } finally {
      bg.restore()
      onLine.mockRestore()
    }
  })

  it('a page reloaded after 16 minutes hidden (discarded in the background) comes back on Home', async () => {
    await inTheMatch()
    sessionStorage.setItem('ob.hiddenAt', String(Date.now() - 16 * MIN))
    const onLine = offlineDevice()
    try {
      mountApp()
      await waitFor(() => expect(continueCard()).toBeTruthy())
      await sleep(500)
      expect(homeShown()).toBe(true)
      expect(scoreboardShown()).toBe(false)
      expect(sessionStorage.getItem('ob.hiddenAt')).toBeNull()
    } finally {
      onLine.mockRestore()
    }
  })
})
