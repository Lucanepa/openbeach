// CoinToss_beach: a captain's (or coach's) signature is saved to the match
// the moment its pad is confirmed, and queued for the cloud, not kept in
// React state until "Confirm coin toss result": a reload lost it (OpenVolley
// 703cfa9c, owner 2026-10-07: "save the signatures as soon as they're made").
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
// The pad: a "Draw" button stands for a drawn signature
vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title }) => (open ? (
    <div role="dialog" aria-label={`pad ${title}`}>
      <button type="button" onClick={() => { onSave('data:image/png;base64,SIGNED'); onClose?.() }}>Draw</button>
      <button type="button" onClick={() => onClose?.()}>Cancel pad</button>
    </div>
  ) : null)
}))

let CoinToss
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  CoinToss = (await import('../../components_beach/CoinToss_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
async function seed({ test = false, hasCoach = false } = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber', color: '#ef4444' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi', color: '#3b82f6' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
    { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
    { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
  ])
  matchId = await db.matches.add({ team1Id, team2Id, status: 'scheduled', seed_key: 'seed-1', test, hasCoach })
}

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

async function openOrderAndSignature(side = 0) {
  render(<CoinToss matchId={matchId} onConfirm={() => {}} onBack={() => {}} />)
  const buttons = await screen.findAllByRole('button', { name: /Order & signature/ })
  await act(async () => { fireEvent.click(buttons[side]) })
  await screen.findByText(/Order & signature – team/)
}

const clickEl = (el) => act(async () => { fireEvent.click(el) })
const signatureJobs = async () => (await db.sync_queue.toArray()).filter(j => j.payload?.signatures)
// saveMatchSignature writes the field, then queues the job: wait for the job
const waitForSignatureJobs = async (n) => {
  let jobs
  await waitFor(async () => { jobs = await signatureJobs(); expect(jobs).toHaveLength(n) })
  return jobs
}

describe('CoinToss_beach signatures are saved at once', () => {
  it('the captain signature is on the match row and queued before the coin toss is confirmed', async () => {
    await seed()
    await openOrderAndSignature(0)
    await clickEl(await screen.findByRole('button', { name: /Sign \(captain #1\)/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })

    await waitFor(async () => expect((await db.matches.get(matchId)).team1CaptainSignature).toBe('data:image/png;base64,SIGNED'))
    const jobs = await waitForSignatureJobs(1)
    expect(jobs[0]).toMatchObject({ resource: 'match', action: 'update', status: 'queued' })
    expect(jobs[0].payload.id).toBe('seed-1')
    expect(jobs[0].payload.signatures).toMatchObject({ team1_captain: 'data:image/png;base64,SIGNED', team2_captain: '' })
    // the coin toss itself is not confirmed yet
    expect((await db.matches.get(matchId)).coinTossConfirmed).toBeFalsy()
  })

  it('a reload shows the saved signature', async () => {
    await seed()
    await openOrderAndSignature(0)
    await clickEl(await screen.findByRole('button', { name: /Sign \(captain #1\)/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).team1CaptainSignature).toBeTruthy())

    cleanup()
    await openOrderAndSignature(0)
    expect(await screen.findByRole('button', { name: /Signed by #1/ })).toBeInTheDocument()
  })

  it('the coach signature is saved at once too', async () => {
    await seed({ hasCoach: true })
    await openOrderAndSignature(1)
    await clickEl(await screen.findByRole('button', { name: 'Sign (coach)' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).team2CoachSignature).toBe('data:image/png;base64,SIGNED'))
    expect((await waitForSignatureJobs(1))[0].payload.signatures.team2_coach).toBe('data:image/png;base64,SIGNED')
  })

  it('a new captain clears the signature on the match row too', async () => {
    await seed()
    await openOrderAndSignature(0)
    await clickEl(await screen.findByRole('button', { name: /Sign \(captain #1\)/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).team1CaptainSignature).toBeTruthy())

    // tapping the captain again changes nothing; the other player clears it
    const captainButtons = screen.getAllByRole('button', { name: /^Captain/ })
    await act(async () => { fireEvent.click(captainButtons[0]) })
    expect((await db.matches.get(matchId)).team1CaptainSignature).toBeTruthy()
    await act(async () => { fireEvent.click(captainButtons[1]) })
    await waitFor(async () => expect((await db.matches.get(matchId)).team1CaptainSignature).toBeNull())
  })

  it('a test match saves the signature but never queues it', async () => {
    await seed({ test: true })
    await openOrderAndSignature(0)
    // (a browser pre-fills placeholder signatures for test matches; jsdom has no canvas)
    await clickEl(await screen.findByRole('button', { name: /Sign \(captain #1\)|Signed by #1/ }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Draw' })) })
    await waitFor(async () => expect((await db.matches.get(matchId)).team1CaptainSignature).toBe('data:image/png;base64,SIGNED'))
    expect(await signatureJobs()).toHaveLength(0)
  })
})
