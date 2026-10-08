import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// The setup file replaces window.indexedDB with a stub; the real db_beach
// instance captures Dexie.dependencies when it is constructed, so they are
// swapped for fake-indexeddb before the module is imported.
let savedDeps
let db
beforeAll(async () => {
  savedDeps = { indexedDB: Dexie.dependencies.indexedDB, IDBKeyRange: Dexie.dependencies.IDBKeyRange }
  Dexie.dependencies.indexedDB = new IDBFactory()
  Dexie.dependencies.IDBKeyRange = IDBKeyRange
  ;({ db } = await import('../../db_beach/db_beach'))
  await db.open()
})
afterAll(() => {
  db?.close()
  Object.assign(Dexie.dependencies, savedDeps)
})

const entry = (id, target) => ({ id, ts: 1, gameNumber: 7, category: 'ui', sessionId: 's', type: 'input', target })

describe('interaction log secrets already stored', () => {
  it('are deleted when the logger starts; other entries stay', async () => {
    await db.interaction_logs.bulkAdd([
      entry('a', { type: 'password', name: null }),
      entry('b', { type: 'text', ariaLabel: 'Approval PIN' }),
      entry('c', { type: 'text', name: 'teamName' })
    ])
    const { initComprehensiveLogger } = await import('../../utils_beach/comprehensiveLogger_beach')
    initComprehensiveLogger(7, 'm1')
    await vi.waitFor(async () => {
      expect((await db.interaction_logs.toCollection().primaryKeys()).sort()).toEqual(['c'])
    })
  })
})

describe('interaction log export', () => {
  it('scrubs PINs from clicked text and link queries stored before the fix', async () => {
    await db.interaction_logs.bulkAdd([
      entry('d', { tagName: 'div', textContent: 'Game PIN 771 234', ariaLabel: 'Copy 771234', href: null }),
      entry('e', { tagName: 'a', textContent: 'Referee', href: 'https://beach.openvolley.app/referee?match=x&pin=482913' })
    ])
    const { getAllLogs, exportLogsAsNDJSON } = await import('../../utils_beach/comprehensiveLogger_beach')
    const logs = await getAllLogs(7)
    expect(logs.map(e => e.id)).toEqual(expect.arrayContaining(['c', 'd', 'e']))
    const text = await exportLogsAsNDJSON(7)
    expect(text).not.toContain('771 234')
    expect(text).not.toContain('771234')
    expect(text).not.toContain('482913')
    expect(text).toContain('https://beach.openvolley.app/referee')
  })
})
