// MatchEnd_beach approval and its PDF. OpenBeach video 2026-10-08:
// - 08:13 / 08:36: the scoresheet window was closed while it made the PDF and
//   the approval waited with no way out (no Cancel, 30 s);
// - 08:19-08:27: after the approval, the page fell back to "Confirm and
//   approve" (the approval lived only in local state).
// Now: the wait ends at once, the scorer chooses Retry / Approve without PDF
// / Cancel, Cancel leaves the match unapproved, and the approved view comes
// from the match row.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
vi.mock('../../utils_beach/comprehensiveLogger_beach', () => ({ exportLogsAsNDJSON: async () => '' }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), isBackendAvailable: () => false, getCloudApiUrl: () => null }))

// The scoresheet window: each open gets a fresh fake window the test can close
const opened = []
vi.mock('../../utils_beach/openAppWindow_beach', () => ({
  openAppWindow: vi.fn(() => {
    const w = { closed: false, close() { this.closed = true } }
    opened.push(w)
    return { ok: true, mode: 'window', platform: 'tauri', window: w }
  })
}))

let MatchEnd
let UiHost
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  ;({ UiHost } = await import('../../ui/volleyui/UiHost.jsx'))
  MatchEnd = (await import('../../components_beach/MatchEnd_beach')).default
  URL.createObjectURL = URL.createObjectURL || (() => 'blob:x')
  HTMLAnchorElement.prototype.click = () => {}
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
async function seed(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
  matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: true, coinTossTeamA: 'team2', ...extra })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
  ])
}

beforeEach(async () => {
  cleanup()
  opened.length = 0
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})

function renderMatchEnd() {
  return render(
    <>
      <MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />
      <div className="ov-kit"><UiHost /></div>
    </>
  )
}

const click = (el) => act(async () => { fireEvent.click(el) })
const approve = async () => click(await screen.findByRole('button', { name: 'Confirm and approve' }))
const postFromSheet = (data) => act(async () => {
  window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }))
})

describe('MatchEnd_beach: the approval PDF', () => {
  it('a closed scoresheet window stops the wait at once; Cancel leaves the match unapproved and usable', async () => {
    await seed()
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    opened[0].closed = true // the scorer closes the window (X)
    const dialog = await screen.findByTestId('export-pdf-failed', {}, { timeout: 2000 })
    expect(dialog).toHaveTextContent('The scoresheet window was closed before the PDF was ready.')
    await click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByTestId('export-pdf-failed')).toBeNull())
    expect(screen.getByRole('button', { name: 'Confirm and approve' })).toBeEnabled()
    expect((await db.matches.get(matchId)).approved).toBeFalsy()
  })

  it('Retry opens the scoresheet again and its PDF approves the match', async () => {
    await seed()
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfError', reason: 'closed' }) // pagehide in the window
    await click(await screen.findByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(opened).toHaveLength(2))
    await postFromSheet({ type: 'pdfBlob', arrayBuffer: new ArrayBuffer(8), filename: 'x.pdf' })
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeEnabled()
    expect((await db.matches.get(matchId)).approved).toBe(true)
  })

  it('Approve without PDF approves the match', async () => {
    await seed()
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfError', reason: 'failed', message: 'boom' })
    await click(await screen.findByRole('button', { name: 'Approve without PDF' }))
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    expect((await db.matches.get(matchId)).approved).toBe(true)
  })

  it('Cancel while the PDF is made stops at once, nothing approved', async () => {
    await seed()
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await click(await screen.findByTestId('export-cancel'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and approve' })).toBeEnabled())
    expect(opened[0].closed).toBe(true) // the window is not left behind
    expect((await db.matches.get(matchId)).approved).toBeFalsy()
  })

  it('an approved match shows the approved view after a remount', async () => {
    await seed({ approved: true })
    renderMatchEnd()
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and approve' })).toBeNull()
  })

  it('Results: no nonsense durations (set 1 started at the scheduled date, video 07:04)', async () => {
    const team1Id = await db.teams.add({ name: 'Müller / Weber' })
    const team2Id = await db.teams.add({ name: 'Schmidt / Fischer' })
    matchId = await db.matches.add({ team1Id, team2Id, status: 'ended', test: true, coinTossTeamA: 'team2', scheduledAt: '2025-03-12T11:30:00.000Z' })
    await db.sets.bulkAdd([
      { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true, startTime: '2025-03-12T11:30:00.000Z', endTime: '2026-10-08T09:13:00.000Z' },
      { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true, startTime: '2026-10-08T09:16:00.000Z', endTime: '2026-10-08T09:31:00.000Z' }
    ])
    renderMatchEnd()
    expect((await screen.findAllByText("15'")).length).toBeGreaterThan(0)
    expect(screen.queryByText(/^\d{4,}'$/)).toBeNull()
    expect(screen.queryByText(/\d{3,}:\d\d$/)).toBeNull() // the match duration h:mm
  })

  it('Remarks: the MTO / RIT lines, not "No remarks" (video 07:10)', async () => {
    await seed()
    await db.events.bulkAdd([
      { matchId, seq: 1, setIndex: 2, type: 'mto', ts: '2026-10-08T09:20:00.000Z', payload: { team: 'team1', playerNumber: 2, playerName: 'Weber', startTime: '2026-10-08T09:20:00.000Z', team1Points: 4, team2Points: 6 } },
      { matchId, seq: 2, setIndex: 2, type: 'medical_end', ts: '2026-10-08T09:23:00.000Z', payload: { kind: 'mto', startSeq: 1, team: 'team1', playerNumber: 2, endTime: '2026-10-08T09:23:00.000Z', duration: 180, outcome: 'recovered' } }
    ])
    renderMatchEnd()
    expect(await screen.findByText(/"Medical Time Out" \(Blood\).*Duration: 00:03:00, Recovered/)).toBeInTheDocument()
    expect(screen.queryByText('No remarks')).toBeNull()
  })
})
