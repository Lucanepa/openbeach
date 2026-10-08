// Match setup, on mount, drops sync jobs in error that still carry a column
// of the old match table (they fail on every retry). 6e4dd1b took the list
// of those columns out and left the check reading `legacyColumns`, an
// undefined name: a ReferenceError caught and logged at debug level, so no
// job was ever dropped. Jobs without such a column stay.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { accessFromRoles } from '../../lib_beach/access_beach'

const h = vi.hoisted(() => ({ auth: null }))
vi.mock('../../contexts_beach/AuthContext_beach', () => ({ useAuth: () => h.auth }))
vi.mock('../../contexts_beach/AlertContext_beach', () => ({ useAlert: () => ({ showAlert: vi.fn() }) }))
vi.mock('../../contexts_beach/ScaleContext_beach', () => ({ useScale: () => ({ scaleFactor: 1, vmin: (v) => v * 10 }) }))
vi.mock('../../hooks_beach/useSavedTeams_beach', () => ({
  useSavedTeams: () => ({ teams: [], competitions: [], meta: null, loading: false, lastStatus: null, refresh: async () => {}, reload: async () => {} })
}))
vi.mock('../../utils_beach/backendConfig_beach', async (importOriginal) => ({
  ...(await importOriginal()),
  isBackendAvailable: () => false,
  getApiUrl: () => null
}))

let MatchSetup
let db
let savedDeps
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  await import('../../i18n')
  ;({ db } = await import('../../db_beach/db_beach'))
  MatchSetup = (await import('../../components_beach/MatchSetup_beach')).default
})
afterAll(() => {
  cleanup()
  Object.assign(Dexie.dependencies, savedDeps)
})

beforeEach(async () => {
  await db.open()
  await Promise.all(db.tables.map(t => t.clear()))
  window.localStorage.getItem.mockImplementation(() => null)
  h.auth = { user: null, profile: null, getCachedProfile: () => null, access: { ...accessFromRoles([]), known: false } }
})

describe('MatchSetup_beach: stale sync jobs on mount', () => {
  it('drops a job in error with an old column, keeps the others', async () => {
    const ts = new Date().toISOString()
    const legacy = await db.sync_queue.add({ resource: 'match', action: 'update', payload: { id: 'm1', referee_pin: '123456' }, ts, status: 'error' })
    const current = await db.sync_queue.add({ resource: 'match', action: 'update', payload: { id: 'm1', coin_toss: { first_serve: 'team1' } }, ts, status: 'error' })
    const queued = await db.sync_queue.add({ resource: 'match', action: 'update', payload: { id: 'm1', referee_pin: '123456' }, ts, status: 'queued' })
    const matchId = await db.matches.add({ status: 'setup', seed_key: 'm1', test: false, createdAt: ts })

    render(<MatchSetup matchId={matchId} onStart={() => {}} onReturn={() => {}} onOpenOptions={() => {}} onOpenCoinToss={() => {}} />)
    await screen.findByRole('button', { name: 'Create match' })

    await waitFor(async () => expect(await db.sync_queue.get(legacy)).toBeUndefined())
    // a current payload (the first server inside coin_toss) and a job not in error stay
    expect(await db.sync_queue.get(current)).toBeTruthy()
    expect(await db.sync_queue.get(queued)).toBeTruthy()
  })
})
