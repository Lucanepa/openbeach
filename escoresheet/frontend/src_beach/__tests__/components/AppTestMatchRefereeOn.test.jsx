// Laptop finding OB-11b: a test match started with the referee connection
// off (the row had no refereeConnectionEnabled, Match Setup then wrote false),
// and the relay's validatePin only lets a referee in when it is true, so the
// referee tablet could not join a test match until the scorer turned the
// referee on in Connect tablets. A test match starts with it on now, as in
// OpenVolley; the scorer can still turn it off. Official matches stay off.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { waitFor, fireEvent, cleanup } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { toWireMatch } from '../../utils_beach/relayPublisher_beach'
import { offline, online, mountApp, button, sleep } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)
afterEach(async () => {
  cleanup()
  await db.matches.clear()
})

const menuTestMatch = () => [...document.querySelectorAll('button:not([data-match-info-menu])')]
  .find(b => b.textContent.trim() === 'Test match' && !b.disabled)

async function startTestMatch(ready) {
  mountApp()
  await waitFor(() => expect(button(ready)).toBeTruthy(), { timeout: 8000 })
  fireEvent.click(button('New match'))
  await waitFor(() => expect(menuTestMatch()).toBeTruthy())
  fireEvent.click(menuTestMatch())
  await waitFor(() => expect(/Match setup/i.test(document.body.textContent) && !button('Restore match')).toBe(true), { timeout: 8000 })
  // Match Setup's own start-up writes (PINs, connection defaults) are done
  await sleep(500)
  const rows = (await db.matches.toArray()).filter(m => m.test === true)
  expect(rows).toHaveLength(1)
  return rows[0]
}

describe('App: a test match starts with the referee connection on', () => {
  it('a new test match: the row, and the match the relay gets', async () => {
    const row = await startTestMatch('New match')
    expect(row.refereeConnectionEnabled).toBe(true)
    expect(row.refereePin).toMatch(/^\d{6}$/)
    expect(toWireMatch(row).refereeConnectionEnabled).toBe(true)
  }, 30000)

  it('a new test match over one whose referee was turned off', async () => {
    const team1 = await db.teams.add({ name: 'Old / One', shortName: 'OLD' })
    const team2 = await db.teams.add({ name: 'Old / Two', shortName: 'OLT' })
    await db.matches.add({
      team1Id: team1, team2Id: team2, status: 'scheduled', test: true,
      refereeConnectionEnabled: false, createdAt: new Date().toISOString()
    })
    const row = await startTestMatch('Continue match')
    expect(row.refereeConnectionEnabled).toBe(true)
  }, 30000)
})
