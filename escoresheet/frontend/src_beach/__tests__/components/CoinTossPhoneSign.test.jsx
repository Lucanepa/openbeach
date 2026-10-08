// CoinToss_beach and Sign on phone (OpenVolley d451686d): the captain's and
// the coach's pads offer the phone, with the slot of their team, the relay's
// key of the match, its game PIN and the beach context; a phone signature is
// saved at once with its "signed on phone" record, a drawn one resets it, and
// a new captain clears the record with the image. SignaturePad is mocked: its
// phone / draw buttons call onSave as it does.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, configure } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
const pad = vi.hoisted(() => ({ phone: undefined }))
vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title, phone }) => {
    if (!open) return null
    pad.phone = phone
    return (
      <div role="dialog" aria-label={`pad ${title}`}>
        <button type="button" onClick={() => { onSave('data:image/png;base64,PHONE', { source: 'phone', transport: 'lan' }); onClose?.() }}>phone</button>
        <button type="button" onClick={() => { onSave('data:image/png;base64,SIG', { source: 'device' }); onClose?.() }}>draw</button>
      </div>
    )
  }
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
}, 30000) // the first import of the screen is slow on a loaded machine
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
async function seed(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber', color: '#ef4444' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi', color: '#3b82f6' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber' },
    { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true },
    { teamId: team2Id, number: 2, firstName: 'Gaia', lastName: 'Bianchi' }
  ])
  matchId = await db.matches.add({ team1Id, team2Id, status: 'scheduled', seed_key: 'seed-1', gamePin: '482913', gameNumber: 7, ...extra })
}

beforeEach(async () => {
  pad.phone = undefined
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

async function openOrderAndSignature(side = 0) {
  render(<CoinToss matchId={matchId} onConfirm={() => {}} onBack={() => {}} />)
  const buttons = await screen.findAllByRole('button', { name: /Order & signature/ })
  await act(async () => { fireEvent.click(buttons[side]) })
  await screen.findByText(/Order & signature – team/)
}
const click = (el) => act(async () => { fireEvent.click(el) })
const row = () => db.matches.get(matchId)

// Each test draws the whole coin toss screen and waits on its writes: 2.5 to
// 3.5 s with the machine loaded, 5.4 s in a full-suite run, past the default
// 5 s (2026-10-08). Nothing here waits on a timer, so the waits get time too.
configure({ asyncUtilTimeout: 10000 })
describe('CoinToss_beach: Sign on phone', { timeout: 30000 }, () => {
  it('the captain\'s pad offers the phone with its team\'s slot, the relay key, the game PIN and the context', async () => {
    await seed()
    await openOrderAndSignature(0)
    await click(await screen.findByRole('button', { name: /Sign \(captain #1\)/ }))
    expect(pad.phone).toMatchObject({
      slot: 'captain-home',
      matchKey: 'seed-1',
      gamePin: '482913',
      context: { home: 'Müller / Weber', away: 'Rossi / Bianchi', matchNo: '7', teamSide: 'home', name: '#1 Anna Müller' }
    })
  })

  it('a phone signature is saved at once with its record; a drawn one resets it', async () => {
    await seed()
    await openOrderAndSignature(0)
    await click(await screen.findByRole('button', { name: /Sign \(captain #1\)/ }))
    await click(screen.getByRole('button', { name: 'phone' }))
    await waitFor(async () => expect((await row()).team1CaptainSignature).toBe('data:image/png;base64,PHONE'))
    expect((await row()).signatureSources.team1CaptainSignature).toMatchObject({ via: 'phone', transport: 'lan' })
    await waitFor(async () => expect((await db.sync_queue.toArray()).some(j => j.payload?.signatures?.team1_captain === 'data:image/png;base64,PHONE')).toBe(true))

    // a new captain clears the image and its record
    const captainButtons = screen.getAllByRole('button', { name: /^Captain/ })
    await click(captainButtons[1])
    await waitFor(async () => expect((await row()).team1CaptainSignature).toBeNull())
    expect((await row()).signatureSources.team1CaptainSignature).toBeNull()

    // signed again, here
    await click(await screen.findByRole('button', { name: /Sign \(captain #2\)/ }))
    await click(screen.getByRole('button', { name: 'draw' }))
    await waitFor(async () => expect((await row()).team1CaptainSignature).toBe('data:image/png;base64,SIG'))
    expect((await row()).signatureSources.team1CaptainSignature).toBeNull()
  })

  it('the coach\'s pad too (the other team)', async () => {
    await seed({ hasCoach: true })
    await openOrderAndSignature(1)
    await click(await screen.findByRole('button', { name: 'Sign (coach)' }))
    expect(pad.phone).toMatchObject({ slot: 'coach-away', context: { teamSide: 'away' } })
    await click(screen.getByRole('button', { name: 'phone' }))
    await waitFor(async () => expect((await row()).team2CoachSignature).toBe('data:image/png;base64,PHONE'))
    expect((await row()).signatureSources.team2CoachSignature).toMatchObject({ via: 'phone' })
  })
})
