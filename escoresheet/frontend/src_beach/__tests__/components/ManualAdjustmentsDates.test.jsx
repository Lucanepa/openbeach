// ManualAdjustments_beach: the dates and the scheduled time are kit fields
// (typed DD.MM.YYYY / HH:MM with the kit popovers), never a native
// type="date" input (the WebKitGTK date popup in the Linux desktop app could
// not be closed). The scheduled time is shown in local time: the UTC slice
// shown before made it jump by the UTC offset on every edit.
process.env.TZ = 'Europe/Zurich'

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))

let ManualAdjustments
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  ManualAdjustments = (await import('../../components_beach/ManualAdjustments_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', dob: '1990-02-14' },
    { teamId: team1Id, number: 2, firstName: 'Lea', lastName: 'Weber', dob: '' }
  ])
  matchId = await db.matches.add({
    team1Id, team2Id, status: 'ended',
    // 18:30 in Zürich (summer time, UTC+2)
    scheduledAt: '2026-07-10T16:30:00.000Z',
    officials: [{ role: '1st referee', firstName: 'Rita', lastName: 'Ref', country: 'SUI', dob: '1980-05-01' }]
  })
})

async function openTab(name) {
  render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
  const tab = await screen.findByRole('radio', { name }).catch(() => screen.findByRole('button', { name }))
  await act(async () => { fireEvent.click(tab) })
}

describe('ManualAdjustments_beach dates', () => {
  it('match info: the scheduled date and time show the local time, not the UTC slice', async () => {
    await openTab('Match info')
    const date = await screen.findByLabelText('Scheduled date')
    const time = screen.getByLabelText('Scheduled time (24 h)')
    expect(date).toHaveAttribute('type', 'text')
    expect(date).toHaveValue('10.07.2026')
    expect(time).toHaveValue('18:30')
  })

  it('a typed time is kept as typed (it no longer jumps by the UTC offset)', async () => {
    await openTab('Match info')
    const time = await screen.findByLabelText('Scheduled time (24 h)')
    await act(async () => { fireEvent.change(time, { target: { value: '1900' } }) })
    fireEvent.blur(time)
    expect(screen.getByLabelText('Scheduled time (24 h)')).toHaveValue('19:00')
    expect(screen.getByLabelText('Scheduled date')).toHaveValue('10.07.2026')
  })

  it('a typed date keeps the time of day', async () => {
    await openTab('Match info')
    const date = await screen.findByLabelText('Scheduled date')
    await act(async () => { fireEvent.change(date, { target: { value: '11.07.2026' } }) })
    expect(screen.getByLabelText('Scheduled date')).toHaveValue('11.07.2026')
    expect(screen.getByLabelText('Scheduled time (24 h)')).toHaveValue('18:30')
  })

  it('retyping the date (half-typed on the way) keeps the time of day', async () => {
    // A typed field reports '' while the date is incomplete; the time of day
    // must survive that and come back when the date is complete again.
    await openTab('Match info')
    const date = await screen.findByLabelText('Scheduled date')
    await act(async () => { fireEvent.change(date, { target: { value: '10.07.202' } }) })
    await act(async () => { fireEvent.change(date, { target: { value: '10.07.2027' } }) })
    expect(screen.getByLabelText('Scheduled date')).toHaveValue('10.07.2027')
    expect(screen.getByLabelText('Scheduled time (24 h)')).toHaveValue('18:30')
  })

  it('officials: a kit date field (DD.MM.YYYY with the calendar), no native picker', async () => {
    await openTab('Match info')
    const dob = await screen.findByLabelText('1st referee Date of birth')
    expect(dob).toHaveAttribute('type', 'text')
    expect(dob).toHaveValue('01.05.1980')
    expect(document.querySelector('input[type="date"], input[type="time"], input[type="datetime-local"]')).toBeNull()
  })

  it('players: typed dates of birth, no native picker', async () => {
    await openTab('Teams & players')
    const dob = await screen.findByLabelText('#1 Date of birth')
    expect(dob).toHaveValue('14.02.1990')
    expect(document.querySelector('input[type="date"]')).toBeNull()
  })
})

// Scores, time-outs and sanctions are corrected in the Corrections tab (one
// planned, previewed write each), no longer typed in: the old Scores and
// "Timeouts & Sanctions" tabs are gone.
describe('ManualAdjustments_beach corrections', () => {
  it('opens on the Corrections tab; no typed scores, time-outs or sanctions', async () => {
    render(<ManualAdjustments matchId={matchId} onClose={() => {}} onSave={() => {}} />)
    expect(await screen.findByRole('button', { name: 'Add sanction' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add time-out' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Scores' })).toBeNull()
    expect(screen.queryByRole('radio', { name: /Timeouts/ })).toBeNull()
    expect(screen.queryByText('+ Add Timeout')).toBeNull()
  })

  it('players: their sanctions are shown, not added or removed there', async () => {
    const team1Id = (await db.matches.get(matchId)).team1Id
    await db.events.add({ matchId, setIndex: 1, type: 'sanction', seq: 3, payload: { team: 'team1', type: 'penalty', playerType: 'player', playerNumber: 1 } })
    void team1Id
    await openTab('Teams & players')
    expect(await screen.findByText(/Penalty \(Set 1\)/)).toBeTruthy()
    expect(screen.queryByText('+ Sanction')).toBeNull()
  })
})
