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
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
vi.mock('../../utils_beach/comprehensiveLogger_beach', () => ({ exportLogsAsNDJSON: async () => '' }))
const backend = vi.hoisted(() => ({ on: false }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), isBackendAvailable: () => backend.on, getCloudApiUrl: () => null }))
// Direct storage uploads: recorded, never answered (a connection that passes
// no data), or refused at once with uploads.fail (no network)
const uploads = vi.hoisted(() => ({ paths: [], bodies: {}, fail: false }))
vi.mock('../../lib_beach/apiClient_beach', async (orig) => ({
  ...(await orig()),
  apiStorage: {
    from: () => ({
      upload: (path, body) => {
        uploads.paths.push(path)
        uploads.bodies[path] = body
        return uploads.fail ? Promise.resolve({ data: null, error: { message: 'Failed to fetch', status: 0 } }) : new Promise(() => {})
      }
    })
  }
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
  uploads.fail = false
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
    expect(uploads.paths.filter(p => !p.startsWith('backups/'))).toEqual([])
  })

  // Stress test 2026-10-25 (ob-restore-at-match-end-drops-signatures-approval):
  // no cloud backup was taken after the signatures or the approval, so a
  // restore at Match end (the tablet died) came back unsigned, not approved
  it('an official match: the approval leaves a cloud backup with the signatures and the approval', async () => {
    backend.on = true
    useMemoryLocalStorage()
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 }))
    await seed({
      test: false, seed_key: 'match_1759740000000_obbak', gameN: 703, gameNumber: '703',
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s', ref1Signature: 'data:r1'
    })
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfError', reason: 'failed', message: 'boom' })
    await click(await screen.findByRole('button', { name: 'Approve without PDF' }))
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    await waitFor(() => expect(uploads.paths.some(p => p.startsWith('backups/backup_g703/'))).toBe(true))
    const path = uploads.paths.find(p => p.startsWith('backups/backup_g703/'))
    const backup = JSON.parse(uploads.bodies[path])
    expect(backup.match).toMatchObject({ approved: true, team1PostGameCaptainSignature: 'data:c1', ref1Signature: 'data:r1', scorerSignature: 'data:s' })
  })

  // Offline at Match end: the backups after the signatures and the approval
  // failed and nothing took them again, so a restore on another device came
  // back unsigned and not approved while the server row had it all once the
  // queue drained (re-verification 2026-10-26)
  it('an official match: a Match end backup that failed offline is taken again once the cloud answers', async () => {
    backend.on = true
    useMemoryLocalStorage()
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 }))
    await seed({
      test: false, seed_key: 'match_1759740000000_obretry', gameN: 705, gameNumber: '705',
      team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2', scorerSignature: 'data:s', ref1Signature: 'data:r1'
    })
    uploads.fail = true
    renderMatchEnd()
    await approve()
    await waitFor(() => expect(opened).toHaveLength(1))
    await postFromSheet({ type: 'pdfError', reason: 'failed', message: 'boom' })
    await click(await screen.findByRole('button', { name: 'Approve without PDF' }))
    expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
    const backups = () => uploads.paths.filter(p => p.startsWith('backups/backup_g705/'))
    await waitFor(() => expect(backups()).toHaveLength(1))
    await new Promise(r => setTimeout(r, 50))

    // Back online: the queue sends the approval, and the backup goes again
    uploads.fail = false
    await act(async () => { window.dispatchEvent(new CustomEvent('sync-queue-drained', { detail: { sent: 3, pending: false } })) })
    await waitFor(() => expect(backups()).toHaveLength(2))
    expect(JSON.parse(uploads.bodies[backups()[1]]).match).toMatchObject({ approved: true, ref1Signature: 'data:r1', scorerSignature: 'data:s' })
    // once: the next answer of the cloud takes no other
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await new Promise(r => setTimeout(r, 100))
    expect(backups()).toHaveLength(2)
  })

  // Remarks saved after the signatures (not approved yet) are on the server
  // only from the approval on: no backup was taken, so a restore at Match end
  // came back without them (re-verification 2026-10-26)
  it('an official match: remarks saved at Match end leave a cloud backup with them', async () => {
    backend.on = true
    useMemoryLocalStorage()
    localStorage.setItem('api_auth_token', JSON.stringify({ access_token: 'tok', expires_at: Math.floor(Date.now() / 1000) + 3600 }))
    await seed({ test: false, seed_key: 'match_1759740000000_obrem', gameN: 704, gameNumber: '704', scorerSignature: 'data:s', ref1Signature: 'data:r1' })
    renderMatchEnd()
    await click(await screen.findByRole('button', { name: 'Edit remarks' }))
    await act(async () => { fireEvent.change(screen.getByRole('textbox', { name: 'Remarks' }), { target: { value: 'Team B protested at 18:15' } }) })
    await click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(uploads.paths.some(p => p.startsWith('backups/backup_g704/'))).toBe(true))
    const backup = JSON.parse(uploads.bodies[uploads.paths.find(p => p.startsWith('backups/backup_g704/'))])
    expect(backup.match).toMatchObject({ remarks: 'Team B protested at 18:15', scorerSignature: 'data:s' })
  })

  // The ZIP's MatchData JSON had the teams inside the match and no version,
  // and Restore match refused it: it is the one file a scorer keeps of an
  // approved match (Close match removes it from the device)
  it('the ZIP\'s match data is a backup file Restore match takes as it is', async () => {
    const { default: JSZip } = await import('jszip')
    const { matchBackupFromFile } = await import('../../utils_beach/backupManager_beach')
    const zipFile = vi.spyOn(JSZip.prototype, 'file')
    try {
      await seed({ seed_key: 'match_1759740000000_obzip' })
      renderMatchEnd()
      await approve()
      await waitFor(() => expect(opened).toHaveLength(1))
      await postFromSheet({ type: 'pdfBlob', arrayBuffer: new ArrayBuffer(8), filename: 'x.pdf' })
      expect(await screen.findByRole('button', { name: 'Close match' })).toBeInTheDocument()
      await waitFor(() => expect(zipFile.mock.calls.some(([name]) => /^MatchData_.*\.json$/.test(name))).toBe(true))
      const call = zipFile.mock.calls.find(([name]) => /^MatchData_.*\.json$/.test(name))
      expect(call[0]).toMatch(/^MatchData_M.*_vs_S/)
      const data = JSON.parse(call[1])
      expect(data).toMatchObject({ version: 1, match: { id: matchId, seed_key: 'match_1759740000000_obzip', status: 'ended' }, team1: { name: 'Müller / Weber' }, team2: { name: 'Schmidt / Fischer' } })
      expect('team1' in data.match || 'team2' in data.match).toBe(false)
      expect(data.sets.map(x => x.index)).toEqual([1, 2])
      expect(typeof data.lastUpdated).toBe('string')
      expect(data.exportedAt).toBe(data.lastUpdated)
      expect(matchBackupFromFile(data)).toBe(data) // nothing to convert
    } finally {
      zipFile.mockRestore()
    }
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
