import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The web app keeps the only copy of a match's unsent end in IndexedDB (after
// Close match, the sync queue). Without navigator.storage.persist() the
// browser treats the origin as best-effort and may evict it whole under
// storage pressure (stress test 2026-10-25: persisted() was false in every
// run). db_beach asks for durable storage once when it loads, as OpenVolley's
// db.js does.

const realStorage = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage')

function stubStorage(storage) {
  Object.defineProperty(globalThis.navigator, 'storage', { value: storage, configurable: true })
}

describe('persistent storage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    if (realStorage) Object.defineProperty(globalThis.navigator, 'storage', realStorage)
    else delete globalThis.navigator.storage
    vi.restoreAllMocks()
  })

  it('is requested when the database module loads', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: vi.fn(async () => false), persist })
    await import('../../db_beach/db_beach')
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1))
  })

  it('is not asked again when the origin already has it', async () => {
    const persist = vi.fn(async () => true)
    stubStorage({ persisted: vi.fn(async () => true), persist })
    const { requestPersistentStorage } = await import('../../db_beach/db_beach')
    persist.mockClear()
    await expect(requestPersistentStorage()).resolves.toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('a refusal is logged, never thrown; without the API nothing happens', async () => {
    stubStorage({ persisted: vi.fn(async () => false), persist: vi.fn(async () => false) })
    const { requestPersistentStorage } = await import('../../db_beach/db_beach')
    await expect(requestPersistentStorage()).resolves.toBe(false)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('evictable'))

    stubStorage({ persisted: vi.fn(async () => false), persist: vi.fn(async () => { throw new Error('denied') }) })
    await expect(requestPersistentStorage()).resolves.toBe(null)

    stubStorage(undefined)
    await expect(requestPersistentStorage()).resolves.toBe(null)
  })
})
