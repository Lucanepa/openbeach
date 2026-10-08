// The "Match complete" results card: the match starts at set 1's FIRST RALLY
// and set durations count from each set's first rally, as on the PDF and as
// in OpenVolley (owner 2026-10-08: "both print time of first rally"). It
// printed the confirmed set 1 start (the scheduled time kept in the dialog)
// and fell back to match.scheduledAt.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
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

const iso = (h, m, s = 0) => new Date(Date.UTC(2026, 9, 8, h, m, s)).toISOString()
const clock = (v) => {
  const d = new Date(v)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

async function seed() {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
  // scheduled 14:30, kept in the dialog; the first rally was at 16:05
  const matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: true, coinTossTeamA: 'team2', scheduledAt: iso(14, 30) })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: iso(14, 30), endTime: iso(16, 24) },
    { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true, startTime: iso(16, 27), endTime: iso(16, 45) }
  ])
  await db.events.bulkAdd([
    { matchId, setIndex: 1, seq: 1, type: 'set_start', ts: iso(14, 30), payload: { setIndex: 1, startTime: iso(14, 30) } },
    { matchId, setIndex: 1, seq: 2, type: 'rally_start', ts: iso(16, 5, 41), payload: { servingTeam: 'team2' } },
    { matchId, setIndex: 1, seq: 3, type: 'point', ts: iso(16, 6, 10), payload: { team: 'team1' } },
    { matchId, setIndex: 2, seq: 4, type: 'set_start', ts: iso(16, 27), payload: { setIndex: 2, startTime: iso(16, 27) } },
    { matchId, setIndex: 2, seq: 5, type: 'rally_start', ts: iso(16, 28, 2), payload: { servingTeam: 'team1' } },
    { matchId, setIndex: 2, seq: 6, type: 'point', ts: iso(16, 28, 40), payload: { team: 'team1' } }
  ])
  return matchId
}

describe('Match complete: times from the first rally', () => {
  it('Start is set 1\'s first rally; set and match durations count from the first rallies', async () => {
    const matchId = await seed()
    render(<MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />)
    const start = await screen.findByText(clock(iso(16, 5)))
    expect(start.tagName).toBe('STRONG')
    expect(screen.queryByText(clock(iso(14, 30)))).toBeNull()
    // set 1 16:05-16:24, set 2 16:28-16:45; match 16:05-16:45
    expect(screen.getByText("19'")).toBeTruthy()
    expect(screen.getByText("17'")).toBeTruthy()
    expect(screen.getByText('0:40')).toBeTruthy()
  })
})
