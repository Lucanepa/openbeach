// The one-time device clean-up of dates of birth (owner 19.11.2026): the
// cached profile and saved teams lose their dob; every match that is over
// loses the dates in its people (licences stay); a match in progress is
// left alone. Against the real app database (db_beach on fake-indexeddb).
import '../helpers/fakeIndexedDb'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../../db_beach/db_beach'
import {
  runDobCleanupOnce, cleanDeviceBirthdates, DOB_CLEANUP_FLAG, matchPatch, scrubManualChange, isMatchInProgress
} from '../../db_beach/dobCleanup_beach'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

let store
async function seed() {
  // An ended match: one player with a date, one with a licence; officials both ways
  const doneT1 = await db.teams.add({ name: 'Muster / Beispiel' })
  const doneT2 = await db.teams.add({ name: 'Probst / Vorlage' })
  const done = await db.matches.add({
    team1Id: doneT1, team2Id: doneT2, status: 'ended',
    officials: [
      { role: '1st referee', firstName: 'Hans', lastName: 'Schiedsmann', dob: '14.03.1980' },
      { role: 'scorer', firstName: 'Tom', lastName: 'Tafel', dob: '300401' },
      { role: 'line judge 1', name: 'Lina Linie' }
    ],
    manualChanges: [
      { category: 'player', field: 'dob', before: '14.03.2008', after: '15.03.2008', description: 'Player #1 dob: 14.03.2008 → 15.03.2008' },
      { category: 'player', field: 'number', before: 1, after: 3, description: 'Player #1 number: 1 → 3' },
      { category: 'official', field: 'ref1.dob', before: '', after: '100200', description: 'ref1 dob: (empty) → 100200' }
    ]
  })
  await db.players.bulkAdd([
    { teamId: doneT1, number: 1, firstName: 'Max', lastName: 'Muster', dob: '14/03/2008' },
    { teamId: doneT1, number: 2, firstName: 'Ben', lastName: 'Beispiel', dob: '100102' },
    { teamId: doneT2, number: 1, firstName: 'Paul', lastName: 'Probst', dob: '2007-05-06' },
    { teamId: doneT2, number: 2, firstName: 'Vera', lastName: 'Vorlage', dob: null }
  ])
  // A match in progress: nothing of it changes
  const liveT1 = await db.teams.add({ name: 'Live / Eins' })
  const liveT2 = await db.teams.add({ name: 'Live / Zwei' })
  const live = await db.matches.add({
    team1Id: liveT1, team2Id: liveT2, status: 'live',
    officials: [{ role: '1st referee', firstName: 'Rita', lastName: 'Rufer', dob: '01.02.1979' }]
  })
  await db.players.bulkAdd([
    { teamId: liveT1, number: 1, firstName: 'Lea', lastName: 'Live', dob: '14.03.2008' },
    { teamId: liveT2, number: 1, firstName: 'Zoe', lastName: 'Zwei', dob: '200001' }
  ])
  await db.saved_teams.put({
    id: 't1', competitionId: 'c1', nameKey: 'muster/beispiel', pairKey: 'beispiel/muster',
    players: [{ number: 1, first_name: 'Max', last_name: 'Muster', dob: '2008-03-14', license_number: '100101' }],
    staff: [{ role: 'Coach', first_name: 'Cora', last_name: 'Coach', dob: null, license_number: null }]
  })
  await db.referees.add({ seedKey: 'test-referee-alpha', lastName: 'Schiedsmann', dob: '1982-04-19' })
  await db.scorers.add({ seedKey: 'test-scorer-alpha', lastName: 'Tafel', dob: '300401' })
  store.set('cachedProfile', JSON.stringify({ user_id: 'u1', first_name: 'Max', dob: '1990-01-15', license_number: '123456' }))
  return { done, live, doneT1, doneT2, liveT1, liveT2 }
}

const playersOf = async (teamId) => (await db.players.where('teamId').equals(teamId).sortBy('number')).map(p => p.dob)

describe('device clean-up of dates of birth', () => {
  beforeEach(async () => {
    store = useMemoryLocalStorage()
    await db.open()
    await Promise.all(db.tables.map(t => t.clear()))
  })

  it('a match that is over loses its dates; licences stay', async () => {
    const ids = await seed()
    const counts = await cleanDeviceBirthdates({ db, storage: window.localStorage })
    expect(await playersOf(ids.doneT1)).toEqual(['', '100102'])
    expect(await playersOf(ids.doneT2)).toEqual(['', null])
    const done = await db.matches.get(ids.done)
    expect(done.officials.map(o => o.dob)).toEqual(['', '300401', undefined])
    expect(done.manualChanges[0]).toMatchObject({ before: '', after: '', description: 'Player #1 dob: – → –' })
    expect(done.manualChanges[1]).toMatchObject({ before: 1, after: 3 })
    expect(done.manualChanges[2]).toMatchObject({ after: '100200' })
    expect(counts).toMatchObject({ matches: 1, players: 2, savedTeams: 1, directory: 1, profile: true })
  })

  it('a match in progress is left alone', async () => {
    const ids = await seed()
    await cleanDeviceBirthdates({ db, storage: window.localStorage })
    expect(await playersOf(ids.liveT1)).toEqual(['14.03.2008'])
    expect(await playersOf(ids.liveT2)).toEqual(['200001'])
    expect((await db.matches.get(ids.live)).officials[0].dob).toBe('01.02.1979')
  })

  it('the saved teams, the profile and the device lists lose their dates', async () => {
    await seed()
    await cleanDeviceBirthdates({ db, storage: window.localStorage })
    const row = await db.saved_teams.get('t1')
    expect(row.players[0]).toEqual({ number: 1, first_name: 'Max', last_name: 'Muster', license_number: '100101' })
    expect('dob' in row.staff[0]).toBe(false)
    expect(JSON.parse(store.get('cachedProfile'))).toEqual({ user_id: 'u1', first_name: 'Max', license_number: '123456' })
    expect((await db.referees.toArray())[0].dob).toBe('')
    expect((await db.scorers.toArray())[0].dob).toBe('300401')
  })

  it('runs once: the flag is set, the second start does nothing', async () => {
    await seed()
    const first = await runDobCleanupOnce({ db, storage: window.localStorage })
    expect(first.players).toBe(2)
    expect(store.get(DOB_CLEANUP_FLAG)).toBeTruthy()
    // a date typed afterwards in an ended match stays (the clean-up does not run again)
    const t = await db.teams.add({ name: 'Neu' })
    await db.matches.add({ team1Id: t, status: 'ended', officials: [] })
    await db.players.add({ teamId: t, number: 1, dob: '01.02.2003' })
    expect(await runDobCleanupOnce({ db, storage: window.localStorage })).toBeNull()
    expect(await playersOf(t)).toEqual(['01.02.2003'])
  })

  it('never throws and never sets the flag when a step fails', async () => {
    const broken = { transaction: () => Promise.reject(new Error('closed')) }
    expect(await runDobCleanupOnce({ db: broken, storage: window.localStorage })).toBeNull()
    expect(store.has(DOB_CLEANUP_FLAG)).toBe(false)
  })
})

describe('clean-up helpers', () => {
  it('in progress: everything but ended, final and approved', () => {
    expect(isMatchInProgress({ status: 'live' })).toBe(true)
    expect(isMatchInProgress({ status: 'setup' })).toBe(true)
    expect(isMatchInProgress({})).toBe(true)
    for (const status of ['ended', 'final', 'approved']) expect(isMatchInProgress({ status })).toBe(false)
  })

  it('officials kept as an object (manual adjustments) are cleaned too', () => {
    const patch = matchPatch({ officials: { ref1: { lastName: 'A', dob: '2000-01-02' }, scorer: { lastName: 'B', dob: '300401' } } })
    expect(patch.officials).toEqual({ ref1: { lastName: 'A', dob: '' }, scorer: { lastName: 'B', dob: '300401' } })
    expect(matchPatch({ officials: [{ dob: '123456' }] })).toBeNull()
  })

  it('only the correction-log entries of a dob change', () => {
    const other = { field: 'firstName', before: 'A', after: 'B', description: 'x 01.02.2003' }
    expect(scrubManualChange(other)).toBe(other)
    expect(scrubManualChange({ field: 'scorer.dob', before: '2003-02-01', after: '', description: 'scorer dob: 2003-02-01 → (empty)' }))
      .toEqual({ field: 'scorer.dob', before: '', after: '', description: 'scorer dob: – → (empty)' })
  })
})
