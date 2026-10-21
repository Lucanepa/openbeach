// MatchEnd_beach "Reopen match" on a match the server has closed: it reopened
// locally only, and the server kept refusing the match's changes as closed.
// Now the server is asked: an admin reopens it there (with a reason,
// audit-logged), a scorer is told only an admin can (2026-10-21).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../contexts_beach/LoggingContext_beach', () => ({ useComponentLogging: () => ({ logHandler: () => {} }) }))
const auth = vi.hoisted(() => ({ isAdmin: false }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => ({ user: { id: 'u1' }, access: { isAdmin: auth.isAdmin } }) }))
const server = vi.hoisted(() => ({ row: null, reopen: vi.fn() }))
vi.mock('../../lib_beach/apiClient_beach', async (importOriginal) => {
  const real = await importOriginal()
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: server.row, error: null }) }
  return {
    ...real,
    apiFrom: (table) => (table === 'matches' ? chain : real.apiFrom(table)),
    apiAdminReopenMatch: (...args) => server.reopen(...args)
  }
})

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
})
afterAll(() => {
  Object.assign(Dexie.dependencies, savedDeps)
})

let matchId
async function seed(extra = {}) {
  const team1Id = await db.teams.add({ name: 'Müller / Weber' })
  const team2Id = await db.teams.add({ name: 'Rossi / Bianchi' })
  matchId = await db.matches.add({ team1Id, team2Id, status: 'final', approved: true, seed_key: 'seed-1', gameN: 4711, coinTossTeamA: 'team1', ...extra })
  await db.sets.bulkAdd([
    { matchId, index: 1, team1Points: 21, team2Points: 15, finished: true },
    { matchId, index: 2, team1Points: 21, team2Points: 18, finished: true }
  ])
}

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  server.row = { id: 'uuid-1', status: 'final', closed_at: '2026-10-21T10:00:00Z' }
  server.reopen = vi.fn(async () => ({ data: { match: { id: 'uuid-1', status: 'ended' } }, error: null, status: 200 }))
  auth.isAdmin = false
})

function renderMatchEnd() {
  render(
    <>
      <MatchEnd matchId={matchId} onGoHome={() => {}} onReopenLastSet={() => {}} onManualAdjustments={() => {}} />
      <div className="ov-kit"><UiHost /></div>
    </>
  )
}
const clickEl = (el) => act(async () => { fireEvent.click(el) })

describe('MatchEnd_beach: Reopen match on a match the server has closed', () => {
  it('a scorer: "only an admin can reopen", the match stays closed here', async () => {
    await seed()
    renderMatchEnd()
    await clickEl(await screen.findByRole('button', { name: 'Reopen match' }))
    expect(await screen.findByTestId('reopen-admin-only')).toHaveTextContent('4711')
    expect(server.reopen).not.toHaveBeenCalled()
    expect((await db.matches.get(matchId)).status).toBe('final')
  })

  it('an admin: reopened on the server with the reason, then here (approvals voided)', async () => {
    auth.isAdmin = true
    await seed({ accountApprovals: { scorer: { userId: 'u1' } } })
    renderMatchEnd()
    await clickEl(await screen.findByRole('button', { name: 'Reopen match' }))
    const confirm = await screen.findByTestId('admin-reopen-confirm')
    expect(confirm).toBeDisabled()
    await act(async () => { fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Wrong result entered' } }) })
    await clickEl(confirm)
    expect(server.reopen).toHaveBeenCalledWith('uuid-1', { reason: 'Wrong result entered' })
    await waitFor(async () => expect((await db.matches.get(matchId))).toMatchObject({ status: 'ended', approved: false, accountApprovals: null, closed_at: null }))
  })

  it('open on the server already: reopened here without asking anyone', async () => {
    server.row = { id: 'uuid-1', status: 'ended', closed_at: null }
    await seed()
    renderMatchEnd()
    await clickEl(await screen.findByRole('button', { name: 'Reopen match' }))
    await waitFor(async () => expect((await db.matches.get(matchId)).status).toBe('ended'))
    expect(server.reopen).not.toHaveBeenCalled()
  })
})
