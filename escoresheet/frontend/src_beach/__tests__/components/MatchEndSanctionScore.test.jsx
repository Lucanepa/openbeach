// The score of a sanction on Match End is the score before it in the event
// order, as the PDF writes it (its event loop's running score). Match End
// counted the points logged no later than the sanction's time stamp, so a
// delay penalty's own point, logged in the same millisecond right after it,
// was counted: "7:12" on Match End, "7:11" on the PDF (OpenVolley 96f812ed).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
vi.mock('../../utils_beach/comprehensiveLogger_beach', () => ({ exportLogsAsNDJSON: async () => '' }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), isBackendAvailable: () => false, getCloudApiUrl: () => null }))

let MatchEnd
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  MatchEnd = (await import('../../components_beach/MatchEnd_beach')).default
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

beforeEach(async () => {
  cleanup()
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

const at = (s) => new Date(Date.UTC(2026, 9, 8, 14, 0, s)).toISOString()

describe('Match End: a sanction\'s score', () => {
  it('is the score before it in the event order, not counting the penalty\'s own point', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    // team A is team 2
    const matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: true, coinTossTeamA: 'team2', coinTossTeamB: 'team1' })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: at(0), endTime: at(50) },
      { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true, startTime: at(51), endTime: at(59) }
    ])
    // set 1: A (team 2) 7, B (team 1) 11, then A's delay penalty and B's point
    // from it, logged in the same millisecond
    const events = [{ matchId, setIndex: 1, seq: 1, type: 'set_start', ts: at(0), payload: {} }]
    let seq = 2
    for (let i = 0; i < 7; i++) events.push({ matchId, setIndex: 1, seq: seq++, type: 'point', ts: at(1 + i), payload: { team: 'team2' } })
    for (let i = 0; i < 11; i++) events.push({ matchId, setIndex: 1, seq: seq++, type: 'point', ts: at(10 + i), payload: { team: 'team1' } })
    events.push({ matchId, setIndex: 1, seq: seq++, type: 'sanction', ts: at(30), payload: { team: 'team2', type: 'delay_penalty' } })
    events.push({ matchId, setIndex: 1, seq: seq++, type: 'point', ts: at(30), payload: { team: 'team1' } })
    await db.events.bulkAdd(events)

    render(<MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />)
    // the sanctioned team's score first: A 7, B 11
    expect(await screen.findByText('7:11')).toBeTruthy()
    expect(screen.queryByText('7:12')).toBeNull()
  })
})
