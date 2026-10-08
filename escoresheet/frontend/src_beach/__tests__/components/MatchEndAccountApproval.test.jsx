// MatchEnd_beach: approval with an account (OpenVolley 625a2ba8, 0fc2661a,
// e544b33c, b1b15d8f). The scorer, 2nd and 1st referee boxes offer "Approve
// with PIN" (also once signed by hand) or say why not; the official types the
// account email and the PIN; the result goes as beach sets, team 1 first; a
// valid approval completes the slot, a stale one shows amber; Undo asks
// first; the server copy replaces the local one; 409 OV_APPROVAL_UNSUPPORTED
// (a server that does not approve beach results) makes every box say so.
// The server is mocked (approvalsApi), the database is the real Dexie.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: alerts.fn }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: (...a) => logs.push(a) }) }))
const alerts = vi.hoisted(() => ({ fn: null }))
const logs = vi.hoisted(() => [])
const auth = vi.hoisted(() => ({ value: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => auth.value }))
vi.mock('../../utils_beach/backendConfig_beach', async (orig) => ({ ...(await orig()), getCloudApiUrl: (p) => `https://api.test${p}`, isBackendAvailable: () => false }))
vi.mock('../../utils_beach/openAppWindow_beach', () => ({ openAppWindow: () => ({ ok: false }) }))
vi.mock('../../utils_beach/comprehensiveLogger_beach', () => ({ exportLogsAsNDJSON: async () => '', downloadLogs: async () => {} }))
const api = vi.hoisted(() => ({ approve: null, list: null, undo: null }))
vi.mock('../../lib_beach/approvalsApi_beach', async (orig) => ({
  ...(await orig()),
  approvalsApi: {
    approve: (...a) => api.approve(...a),
    list: (...a) => api.list(...a),
    undo: (...a) => api.undo(...a)
  }
}))
vi.mock('../../components_beach/SignaturePad_beach', () => ({
  default: ({ open, onSave, onClose, title }) => (open ? (
    <div role="dialog" aria-label={`pad ${title}`}>
      <button type="button" onClick={() => { onSave('data:image/png;base64,SIG', { source: 'device' }); onClose?.() }}>draw</button>
    </div>
  ) : null)
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
}, 30000) // the first import of the screen is slow on a loaded machine
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

const KEY = 'ov-result-v1|1:21:15,2:18:21,3:15:12'
const record = (slot, over = {}) => ({
  id: `${slot}-id`, short_id: 'AB12CD34', slot, name: 'Ref Anna', approved_at: '2026-07-12T10:42:00.000Z',
  result_key: KEY, result_matches: true, mine: false, ...over
})
const OFFICIALS = [
  { role: '1st referee', firstName: 'Anna', lastName: 'Ref' },
  { role: '2nd referee', firstName: 'Bea', lastName: 'Second' },
  { role: 'scorer', firstName: 'Sam', lastName: 'Scorer' }
]

let matchId
async function seed(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  await db.players.bulkAdd([
    { teamId: team1Id, number: 1, firstName: 'Anna', lastName: 'Müller', isCaptain: true },
    { teamId: team2Id, number: 1, firstName: 'Sara', lastName: 'Rossi', isCaptain: true }
  ])
  matchId = await db.matches.add({
    team1Id, team2Id, status: 'ended', seed_key: 'seed-1', coinTossTeamA: 'team1', officials: OFFICIALS,
    team1PostGameCaptainSignature: 'data:c1', team2PostGameCaptainSignature: 'data:c2',
    ...extra
  })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { matchId, index: 2, team1Points: 18, team2Points: 21, finished: true },
    { matchId, index: 3, team1Points: 15, team2Points: 12, finished: true }
  ])
}

let onLine = true
beforeEach(async () => {
  // a working localStorage (the test setup's is an empty mock): the device id
  const mem = new Map()
  localStorage.getItem.mockImplementation((k) => (mem.has(k) ? mem.get(k) : null))
  localStorage.setItem.mockImplementation((k, v) => { mem.set(k, String(v)) })
  alerts.fn = vi.fn()
  logs.length = 0
  auth.value = { user: { id: 'u1', email: 'scorer@x.ch' }, access: { roles: ['beach:scorer'], isAdmin: false, known: true } }
  api.list = vi.fn(async () => ({ data: { approvals: [] }, error: null, status: 200 }))
  api.approve = vi.fn(async ({ slot }) => ({ data: { approval: record(slot), already: false }, error: null, status: 200 }))
  api.undo = vi.fn(async () => ({ data: {}, error: null, status: 200 }))
  onLine = true
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => onLine })
  try { sessionStorage.clear() } catch { /* none */ }
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.getItem.mockReset()
  localStorage.setItem.mockReset()
})

function renderMatchEnd() {
  render(
    <>
      <MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />
      <div className="ov-kit"><UiHost /></div>
    </>
  )
}
const click = (el) => act(async () => { fireEvent.click(el) })
// The boxes are drawn anew whenever the match row changes (the server's copy
// arriving): let the first read settle, then query the element afresh
async function clickTestId(id) {
  await screen.findByTestId(id)
  await waitFor(() => expect(api.list).toHaveBeenCalled())
  await act(async () => { await new Promise(r => setTimeout(r, 50)) })
  await click(screen.getByTestId(id))
}
const row = () => db.matches.get(matchId)
const reasonOf = (role) => screen.getByTestId(`account-approval-why-${role}`).getAttribute('data-reason')

/** Approve `role` in the dialog with an email and a PIN. */
async function approveIn(role, { email = 'anna.ref@x.ch', pin = '482917' } = {}) {
  await waitFor(() => expect(screen.getByTestId(`account-approval-open-${role}`)).toBeEnabled())
  await click(screen.getByTestId(`account-approval-open-${role}`))
  const dialog = await screen.findByTestId('account-approval-form')
  const [emailInput, pinInput] = dialog.querySelectorAll('input')
  await act(async () => {
    fireEvent.change(emailInput, { target: { value: email } })
    fireEvent.change(pinInput, { target: { value: pin } })
  })
  await click(screen.getByTestId('account-approval-submit'))
}

describe('MatchEnd_beach: approve with an account', () => {
  it('offers "Approve with PIN" on the scorer, 2nd and 1st referee, also once signed by hand; the assistant signs only', async () => {
    await seed({ scorerSignature: 'data:s', officials: [...OFFICIALS, { role: 'assistant scorer', firstName: 'Ada', lastName: 'A' }], asstScorerSignature: 'data:a' })
    renderMatchEnd()
    expect(await screen.findByTestId('account-approval-open-scorer')).toBeInTheDocument()
    expect(screen.getByTestId('account-approval-open-ref2')).toBeInTheDocument()
    expect(screen.getByTestId('account-approval-open-ref1')).toBeInTheDocument()
    expect(reasonOf('asst-scorer')).toBe('signOnly')
    await waitFor(() => expect(api.list).toHaveBeenCalledWith('seed-1'))
  })

  it('approves: email, PIN and the beach result (team 1 first) go to the server; the record completes the slot', async () => {
    await seed({ scorerSignature: 'data:s', ref2Signature: 'data:r2' })
    renderMatchEnd()
    await approveIn('ref1')
    await waitFor(() => expect(api.approve).toHaveBeenCalledTimes(1))
    const body = api.approve.mock.calls[0][0]
    expect(body).toMatchObject({ external_id: 'seed-1', slot: 'referee1', email: 'anna.ref@x.ch', pin: '482917', result: { sets: [[1, 21, 15], [2, 18, 21], [3, 15, 12]] } })
    expect(body.device_id).toMatch(/^[0-9a-f-]{36}$/)
    await waitFor(async () => expect((await row()).accountApprovals?.referee1?.id).toBe('referee1-id'))
    expect(await screen.findByTestId('account-approval-ref1')).toHaveTextContent('Approved electronically')
    expect(screen.getByTestId('account-approval-ref1')).toHaveTextContent('Ref Anna')
    // every slot is complete: "Confirm and approve" opens (no drawn 1st referee signature)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm and approve' })).toBeEnabled())
    // The PIN never reached the logger
    expect(JSON.stringify(logs)).not.toContain('482917')
  })

  it('a server that does not approve beach results (409 OV_APPROVAL_UNSUPPORTED): every box says so, the session remembers it', async () => {
    api.approve = vi.fn(async () => ({ data: null, error: { code: 'OV_APPROVAL_UNSUPPORTED', status: 409, message: 'no beach' }, status: 409 }))
    await seed()
    renderMatchEnd()
    await approveIn('scorer')
    await waitFor(() => expect(reasonOf('scorer')).toBe('beachOff'))
    expect(screen.queryByTestId('account-approval-form')).toBeNull()
    expect(screen.getByTestId('account-approval-why-scorer')).toHaveTextContent('does not approve beach results with a PIN yet')
    expect(sessionStorage.getItem('ob.approvalBeachUnsupported')).toBe('1')
  })

  it('offline: the reason line instead of the button; back on "online"', async () => {
    onLine = false
    await seed()
    renderMatchEnd()
    await waitFor(() => expect(reasonOf('scorer')).toBe('offline'))
    onLine = true
    await act(async () => { window.dispatchEvent(new Event('online')) })
    expect(await screen.findByTestId('account-approval-open-scorer')).toBeInTheDocument()
  })

  it('on mount, the server\'s approvals replace the local copy', async () => {
    api.list = vi.fn(async () => ({ data: { approvals: [record('referee2')] }, error: null, status: 200 }))
    await seed({ accountApprovals: { scorer: record('scorer') } })
    renderMatchEnd()
    await waitFor(async () => expect(Object.keys((await row()).accountApprovals || {})).toEqual(['referee2']))
  })

  it('a stale approval (the result changed) shows amber and does not complete the slot', async () => {
    await seed({ accountApprovals: { scorer: record('scorer', { result_key: 'ov-result-v1|1:21:15' }) } })
    api.list = vi.fn(async () => ({ data: null, error: { status: 0, network: true }, status: 0 }))
    renderMatchEnd()
    expect(await screen.findByTestId('account-approval-stale-scorer')).toHaveTextContent('Result changed')
    expect(screen.getByTestId('account-approval-open-scorer')).toBeInTheDocument()
    // the 2nd referee still waits for the scorer
    expect(screen.getByRole('button', { name: /^2nd referee · Tap to sign/ })).toBeDisabled()
  })

  it('Undo asks first, then calls the server and drops the local record', async () => {
    api.list = vi.fn(async () => ({ data: { approvals: [record('scorer')] }, error: null, status: 200 }))
    await seed({ accountApprovals: { scorer: record('scorer') } })
    renderMatchEnd()
    await clickTestId('account-approval-undo-scorer')
    expect(api.undo).not.toHaveBeenCalled()
    await click(await screen.findByTestId('confirm-accept'))
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith('scorer-id'))
    await waitFor(async () => expect((await row()).accountApprovals).toBeNull())
  })

  it('an indoor-only account cannot send approvals of a beach match (the server checks beach roles)', async () => {
    auth.value = { user: { id: 'u1' }, access: { roles: ['scorer', 'referee'], isAdmin: false } }
    await seed()
    renderMatchEnd()
    await waitFor(() => expect(reasonOf('scorer')).toBe('callerRole'))
    expect(screen.getByTestId('account-approval-why-scorer')).toHaveTextContent('needs the scorer or referee role')
  })

  it('signed out: says so; no seed key: the match is not online', async () => {
    auth.value = { user: null, access: null }
    await seed()
    renderMatchEnd()
    await waitFor(() => expect(reasonOf('ref1')).toBe('signedOut'))
    expect(api.list).not.toHaveBeenCalled()
  })

  it('a local match (no seed key) says it is not online', async () => {
    await seed({ seed_key: null })
    renderMatchEnd()
    await waitFor(() => expect(reasonOf('scorer')).toBe('localMatch'))
  })

  it('drawing a signature over a stale approval drops the stale record', async () => {
    api.list = vi.fn(async () => ({ data: null, error: { status: 0, network: true }, status: 0 }))
    await seed({ accountApprovals: { scorer: record('scorer', { result_key: 'stale' }) } })
    renderMatchEnd()
    await click(await screen.findByTestId('account-approval-stale-scorer'))
    await click(screen.getByRole('button', { name: 'draw' }))
    await waitFor(async () => expect((await row()).scorerSignature).toBe('data:image/png;base64,SIG'))
    await waitFor(async () => expect((await row()).accountApprovals).toBeNull())
  })

  it('"Reopen last set" undoes the approvals on the server too', async () => {
    api.list = vi.fn(async () => ({ data: { approvals: [record('referee1')] }, error: null, status: 200 }))
    await seed({ scorerSignature: 'data:s', accountApprovals: { referee1: record('referee1') } })
    renderMatchEnd()
    await screen.findByTestId('account-approval-ref1')
    await click(screen.getByRole('button', { name: 'Reopen last set' }))
    await click(await screen.findByTestId('confirm-accept'))
    await waitFor(() => expect(api.undo).toHaveBeenCalledWith('referee1-id'))
  })

  it('"Reopen last set" offline drops the local copy too: a replay to the same score does not bring the approval back', async () => {
    // OpenVolley clearedPostMatchSignatures(): accountApprovals: null
    await seed({ scorerSignature: 'data:s', accountApprovals: { referee1: record('referee1') } })
    onLine = false
    renderMatchEnd()
    await screen.findByTestId('account-approval-ref1')
    await click(screen.getByRole('button', { name: 'Reopen last set' }))
    await click(await screen.findByTestId('confirm-accept'))
    await waitFor(async () => expect((await row()).status).toBe('live'))
    expect(api.undo).not.toHaveBeenCalled()
    expect((await row()).accountApprovals ?? null).toBeNull()
  })

  it('"Confirm and approve" re-checks the approvals with the server and sends the summary (names and short IDs only)', async () => {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:x')
    api.list = vi.fn(async () => ({ data: { approvals: [record('referee1')] }, error: null, status: 200 }))
    await seed({ scorerSignature: 'data:s', ref2Signature: 'data:r2', accountApprovals: { referee1: record('referee1') } })
    renderMatchEnd()
    await screen.findByTestId('account-approval-ref1')
    const approve = screen.getByRole('button', { name: 'Confirm and approve' })
    await waitFor(() => expect(approve).toBeEnabled())
    await click(approve)
    // The scoresheet window cannot open here: the scorer approves without the
    // PDF. Its prompt comes after the server re-check and the export's reads:
    // 1.7 to 2.9 s after the tap with the machine loaded (measured
    // 2026-10-08), past the default 1 s of findBy
    await click(await screen.findByRole('button', { name: 'Approve without PDF' }, { timeout: 10000 }))
    let job
    await waitFor(async () => {
      job = (await db.sync_queue.toArray()).find(j => j.payload?.status === 'approved')
      expect(job).toBeTruthy()
    }, { timeout: 5000 })
    expect(api.list.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(job.payload.approval.accounts).toEqual({
      ref1: { short_id: 'AB12CD34', name: 'Ref Anna', approved_at: '2026-07-12T10:42:00.000Z' }, ref2: null, scorer: null
    })
    expect(JSON.stringify(job.payload.approval.accounts)).not.toContain('@')
  }, 30000)

  it('a voided approval stops "Confirm and approve"', async () => {
    let calls = 0
    api.list = vi.fn(async () => (++calls === 1
      ? { data: { approvals: [record('referee1')] }, error: null, status: 200 }
      : { data: { approvals: [] }, error: null, status: 200 }))
    await seed({ scorerSignature: 'data:s', ref2Signature: 'data:r2', accountApprovals: { referee1: record('referee1') } })
    renderMatchEnd()
    await screen.findByTestId('account-approval-ref1')
    await click(screen.getByRole('button', { name: 'Confirm and approve' }))
    await waitFor(() => expect(alerts.fn).toHaveBeenCalledWith(expect.stringContaining('no longer valid'), 'warning'))
    expect((await db.sync_queue.toArray()).some(j => j.payload?.status === 'approved')).toBe(false)
  })
})
