// Stress test 2026-10-25 (ob-delete-match-wipes-other-matches-queue): match 1
// ended offline, was approved and closed (Close match deletes its local
// copy, so the sync queue holds the only copy of its unsent end). Deleting
// match 2 (Home > Delete match) or replacing it (New match > Official match >
// "Delete and start new") cleared the WHOLE sync queue: back online, the
// cloud kept match 1 live at 21:3 with no approval. Only the deleted match's
// jobs go now.
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
import { db } from '../../db_beach/db_beach'
import { UiHost } from '../../ui/volleyui/UiHost.jsx'
import { offline, online, mountApp, button } from '../helpers/appMount'

beforeAll(offline)
afterAll(online)

const CLOSED = 'match_1792931000000_closed1'
const OPEN = 'match_1792932000000_open2'

// The unsent end of match 1 (no local match row any more)
const closedMatchJobs = [
  { resource: 'event', action: 'insert', payload: { external_id: `${CLOSED}:e:51`, match_id: CLOSED, type: 'point', seq: 51 } },
  { resource: 'set', action: 'update', payload: { external_id: `${CLOSED}:s:2`, finished: true, team1_points: 21, team2_points: 3 } },
  { resource: 'match', action: 'update', payload: { id: CLOSED, status: 'approved' } },
  { resource: 'match', action: 'update', payload: { id: CLOSED, status: 'final' } }
]

async function seed() {
  const start = new Date(Date.now() - 3600000).toISOString()
  const team1 = await db.teams.add({ name: 'Müller / Weber', shortName: 'MÜL' })
  const team2 = await db.teams.add({ name: 'Schmidt / Fischer', shortName: 'SCH' })
  const matchId = await db.matches.add({
    team1Id: team1, team2Id: team2, status: 'scheduled', test: false, seed_key: OPEN, gamePin: '424242', gameN: 7,
    createdAt: start, matchInfoConfirmedAt: start
  })
  const queued = (j) => ({ ...j, ts: start, status: 'queued' })
  await db.sync_queue.bulkAdd(closedMatchJobs.map(queued))
  await db.sync_queue.add(queued({ resource: 'match', action: 'insert', payload: { external_id: OPEN, game_n: 7 } }))
  return matchId
}

const remaining = async () => (await db.sync_queue.toArray()).filter(j => j.status === 'queued')

describe('App: deleting or replacing the match on the device', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('Delete match removes only that match\'s jobs, never another match\'s unsent end', async () => {
    const matchId = await seed()
    const view = mountApp()
    await waitFor(() => expect(button('Delete match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Delete match'))
    await waitFor(() => expect(document.querySelector('#ob-delete-pin')).toBeTruthy(), { timeout: 8000 })
    fireEvent.change(document.querySelector('#ob-delete-pin'), { target: { value: '424242' } })
    fireEvent.click(document.querySelector('[data-testid="delete-match-confirm"]'))
    await waitFor(async () => expect(await db.matches.get(matchId)).toBeUndefined(), { timeout: 8000 })
    await waitFor(async () => expect((await remaining()).some(j => j.action === 'delete')).toBe(true), { timeout: 8000 })

    const left = await remaining()
    // match 1's end is all there; of match 2 only its cloud delete
    expect(left.filter(j => j.action !== 'delete').map(j => j.payload)).toEqual(closedMatchJobs.map(j => j.payload))
    expect(left.filter(j => j.action === 'delete').map(j => j.payload)).toEqual([{ id: OPEN }])
    view.unmount()
  }, 30000)

  it('"Delete and start new" removes only the replaced match\'s jobs', async () => {
    const matchId = await seed()
    const view = mountApp()
    // the "Delete the current match?" confirm (main_beach.jsx mounts it too)
    const host = render(<div className="ov-kit ov-kit-host"><UiHost /></div>)
    // the home screen has loaded the match (it asks before replacing it)
    await waitFor(() => expect(button('Delete match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('New match'))
    await waitFor(() => expect(button('Official match')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Official match'))
    await waitFor(() => expect(button('Delete and start new')).toBeTruthy(), { timeout: 8000 })
    fireEvent.click(button('Delete and start new'))
    await waitFor(async () => expect(await db.matches.get(matchId)).toBeUndefined(), { timeout: 8000 })

    const left = await remaining()
    expect(left.map(j => j.payload)).toEqual(closedMatchJobs.map(j => j.payload))
    host.unmount()
    view.unmount()
  }, 30000)
})
