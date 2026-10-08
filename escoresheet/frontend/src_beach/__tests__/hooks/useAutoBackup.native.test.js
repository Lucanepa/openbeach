import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// The desktop app (Tauri): a native backup file of the open match at every
// scoring event, through the shared backup_* commands; never a download.
// Ported from OpenVolley src/hooks/__tests__/useAutoBackup.native.test.js.

// Dexie stand-in with the table hook API the write hook uses
const { fakeDb, state } = vi.hoisted(() => {
  const hookTable = () => {
    const subs = { creating: new Set(), updating: new Set(), deleting: new Set() }
    return {
      subs,
      hook(type, fn) {
        if (fn) subs[type].add(fn)
        return { unsubscribe: (f) => subs[type].delete(f) }
      }
    }
  }
  const fakeDb = { events: hookTable(), sets: hookTable(), matches: hookTable(), players: hookTable() }
  // Runs the hooks of one write and commits its transaction
  fakeDb.write = (table, type, ...args) => {
    const complete = []
    const tx = { on: (e, fn) => { if (e === 'complete') complete.push(fn) } }
    for (const fn of fakeDb[table].subs[type]) fn(...args, tx)
    complete.forEach(fn => fn())
  }
  const state = {
    match: { id: 7, gameN: 321, seed_key: 'seedabc', status: 'live', gamePin: '135791', team1Pin: '246802' },
    sets: [{ index: 1, team1Points: 0, team2Points: 0 }],
    events: []
  }
  return { fakeDb, state }
})

vi.mock('../../db_beach/db_beach', () => ({ db: fakeDb }))
vi.mock('../../utils_beach/backupManager_beach', async (importOriginal) => {
  const real = await importOriginal()
  return {
    ...real,
    exportMatchData: vi.fn(async () => ({ version: 1, lastUpdated: new Date().toISOString(), ...structuredClone(state) })),
    downloadMatchBackup: vi.fn(),
    writeMatchBackup: vi.fn()
  }
})

const writes = []
const invoke = vi.fn(async (cmd, args) => {
  if (cmd === 'backup_info') return { dir: '/data/OpenBeach/backups' }
  if (cmd === 'backup_list') return []
  if (cmd === 'backup_write') writes.push(args)
  return null
})

beforeAll(() => {
  window.__TAURI_INTERNALS__ = { invoke }
  window.showDirectoryPicker = () => {} // WebView2 exposes it: must be ignored in the app
})
afterAll(() => {
  delete window.__TAURI_INTERNALS__
  delete window.showDirectoryPicker
})
beforeEach(() => {
  useMemoryLocalStorage()
})

describe('useAutoBackup in the desktop app', () => {
  it('is on by default and backs up the open match at every scoring event', async () => {
    const { default: useAutoBackup } = await import('../../hooks_beach/useAutoBackup_beach')
    const { downloadMatchBackup } = await import('../../utils_beach/backupManager_beach')
    const { result, unmount } = renderHook(() => useAutoBackup(7))

    expect(result.current.nativeMode).toBe(true)
    expect(result.current.autoBackupEnabled).toBe(true)
    expect(result.current.hasFileSystemAccess).toBe(false)
    expect(result.current.canOpenBackupFolder).toBe(true)

    // the state when the match is opened
    await waitFor(() => expect(writes).toHaveLength(1))
    expect(writes[0]).toMatchObject({ matchDir: 'game321-seedabc', latest: true })
    expect(writes[0].fileName).toMatch(/^\d{8}T\d{6}\.\d{3}Z-00000\.json$/)
    // no PINs in the file
    expect(writes[0].contents).not.toContain('135791')
    expect(writes[0].contents).not.toContain('246802')
    await waitFor(() => expect(result.current.backupFolder).toBe('/data/OpenBeach/backups'))

    // a point: event row added, then the set score updated, in one action
    state.events.push({ type: 'point', seq: 1, payload: { team: 'team1' } })
    state.sets[0].team1Points = 1
    act(() => {
      fakeDb.write('events', 'creating', undefined, { matchId: 7, type: 'point' })
      fakeDb.write('sets', 'updating', { team1Points: 1 }, 1, { matchId: 7 })
    })
    await waitFor(() => expect(writes).toHaveLength(2))
    expect(writes[1].fileName).toMatch(/-00001\.json$/)
    expect(JSON.parse(writes[1].contents)).toMatchObject({ version: 1, sets: [{ team1Points: 1 }], events: [{ seq: 1 }] })

    // a timeout of another match does not back up this one
    act(() => fakeDb.write('events', 'creating', undefined, { matchId: 8, type: 'timeout' }))
    // undo of the point
    state.events.pop()
    state.sets[0].team1Points = 0
    act(() => fakeDb.write('events', 'deleting', 1, { matchId: 7, type: 'point' }))
    await waitFor(() => expect(writes).toHaveLength(3))

    // the Scoreboard's event trigger never downloads in the app
    act(() => result.current.triggerEventBackup('timeout'))
    await new Promise(r => setTimeout(r, 250))
    expect(writes).toHaveLength(3) // unchanged state: coalesced
    expect(downloadMatchBackup).not.toHaveBeenCalled()

    // "Back up" writes a native file even when nothing changed
    let ok
    await act(async () => { ok = await result.current.manualBackup() })
    expect(ok).toBe(true)
    expect(writes).toHaveLength(4)
    expect(downloadMatchBackup).not.toHaveBeenCalled()

    // switched off: no more backups, and the hooks are gone; the browser
    // switch is untouched
    act(() => result.current.toggleAutoBackup(false))
    expect(localStorage.getItem('nativeAutoBackupEnabled')).toBe('false')
    expect(localStorage.getItem('autoBackupEnabled')).toBe(null)
    expect(fakeDb.events.subs.creating.size).toBe(0)
    unmount()
  })

  it('opens the backup folder through the backup_open_dir command', async () => {
    const { default: useAutoBackup } = await import('../../hooks_beach/useAutoBackup_beach')
    const { result } = renderHook(() => useAutoBackup(null))
    await act(async () => { await result.current.openBackupFolder() })
    expect(invoke).toHaveBeenCalledWith('backup_open_dir', undefined)
  })
})
