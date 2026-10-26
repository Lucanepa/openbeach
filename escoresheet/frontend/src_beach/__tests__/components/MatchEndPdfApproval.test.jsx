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
const backend = vi.hoisted(() => ({ on: false }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), isBackendAvailable: () => backend.on, getCloudApiUrl: () => null }))
// Direct storage uploads: recorded, never answered (a connection that passes no data)
const uploads = vi.hoisted(() => ({ paths: [] }))
vi.mock('../../lib_beach/apiClient_beach', async (orig) => ({
  ...(await orig()),
  apiStorage: { from: () => ({ upload: (path) => { uploads.paths.push(path); return new Promise(() => {}) } }) }
}))

// The scoresheet window: each open gets a fresh fake window the test can close
const opened = []
vi.mock('../../utils_beach/openAppWindow_beach', () => ({
  openAppWindow: vi.fn((url) => {
    const w = { url, closed: false, close() { this.closed = true } }
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
  backend.on = false
  uploads.paths = []
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

  it('an official match: the remarks as approved are queued in their own job just before the approval (backend db/017)', async () => {
    await seed({
      test: false, seed_key: 'match_1759740000000_obappr', remarks: 'Actual start time: 10:05',
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s', ref1Signature: 'data:r1'
    })
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfError', reason: 'failed', message: 'boom' })
    await click(await screen.findByRole('button', { name: 'Approve without PDF' }))
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    const jobs = (await db.sync_queue.toArray()).filter(j => j.resource === 'match' && j.action === 'update')
    const approval = jobs.findIndex(j => j.payload?.status === 'approved')
    const remarks = jobs.findIndex(j => j.payload && 'remarks' in j.payload)
    expect(approval).toBeGreaterThan(-1)
    expect(remarks).toBe(approval - 1)
    expect(jobs[remarks].payload).toEqual({ id: 'match_1759740000000_obappr', remarks: 'Actual start time: 10:05' })
    expect('remarks' in jobs[approval].payload).toBe(false)
  })

  // Stress test 2026-10-25 (ob-scoresheet-upload-fire-once): approved while
  // the venue Wi-Fi or the backend was down, the PDF and the final JSON were
  // uploaded once, failed, and never reached the cloud (the manager's
  // Scoresheets list: pdf false); a stalled upload also held the approval
  it('an official match: the approval queues the PDF and the final JSON with their files, nothing is uploaded directly', async () => {
    backend.on = true
    await seed({
      test: false, seed_key: 'match_1759740000000_obpdf', gameNumber: 702,
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s', ref1Signature: 'data:r1'
    })
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfBlob', arrayBuffer: new ArrayBuffer(8), filename: 'x.pdf' })
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    await waitFor(async () => expect((await db.sync_queue.toArray()).filter(j => j.resource === 'scoresheet')).toHaveLength(2))
    const files = (await db.sync_queue.toArray()).filter(j => j.resource === 'scoresheet')
    expect(files.map(j => [j.action, j.status, j.payload.contentType])).toEqual([
      ['upload', 'queued', 'application/pdf'],
      ['upload', 'queued', 'application/json']
    ])
    expect(files[0].payload.path).toMatch(/^beach\/\d{4}-\d{2}-\d{2}\/game702_match_1759740000000_obpdf\.pdf$/)
    expect(files[1].payload.path).toMatch(/^beach\/\d{4}-\d{2}-\d{2}\/game702_match_1759740000000_obpdf_final\.json$/)
    expect(files.map(j => j.payload.match_external_id)).toEqual(['match_1759740000000_obpdf', 'match_1759740000000_obpdf'])
    expect(files[0].payload.file).toBeTruthy()
    expect(files[1].payload.file).toBeTruthy()
    expect((await db.matches.get(matchId)).approved).toBe(true)
    // nothing went up directly (the queue sends them)
    expect(uploads.paths).toEqual([])
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

  // Cancel closes the window, but one busy capturing runs its pagehide only
  // when the capture is done: its late "closed" ended the NEXT approval's
  // wait (false failure while the new window kept working).
  it('a late "closed" from the window of an earlier attempt does not end the next one', async () => {
    await seed()
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    const reqOf = (w) => new URL(w.url, 'http://x').searchParams.get('pdfReq')
    const firstReq = reqOf(opened[0])
    expect(firstReq).toBeTruthy()
    await click(await screen.findByTestId('export-cancel'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and approve' })).toBeEnabled())
    await approve()
    await waitFor(() => expect(opened).toHaveLength(2))
    const secondReq = reqOf(opened[1])
    expect(secondReq).toBeTruthy()
    expect(secondReq).not.toBe(firstReq)
    // the first window's pagehide arrives only now (it was busy capturing)
    await postFromSheet({ type: 'pdfError', reason: 'closed', req: firstReq })
    await act(() => new Promise(r => setTimeout(r, 50)))
    expect(screen.queryByTestId('export-pdf-failed')).toBeNull()
    expect(opened[1].closed).toBe(false)
    await postFromSheet({ type: 'pdfBlob', arrayBuffer: new ArrayBuffer(8), filename: 'x.pdf', req: secondReq })
    expect(await screen.findByRole('button', { name: 'Close match' }, { timeout: 3000 })).toBeEnabled()
    expect((await db.matches.get(matchId)).approved).toBe(true)
  })

  it('an approved match shows the approved view after a remount', async () => {
    await seed({ approved: true })
    renderMatchEnd()
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm and approve' })).toBeNull()
  })

  it('the scoresheet stays at hand once the match is approved (closed), as before it', async () => {
    await seed({ approved: true })
    renderMatchEnd()
    await screen.findByRole('button', { name: 'Close match' })
    await click(screen.getByRole('button', { name: /Scoresheet/ }))
    await click(await screen.findByRole('menuitem', { name: /Preview/ }))
    expect(opened.at(-1).url).toContain('/scoresheet_beach.html')
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
