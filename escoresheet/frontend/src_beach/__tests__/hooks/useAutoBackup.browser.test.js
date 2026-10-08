import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'

// A browser (phone / tablet / Safari / Firefox): no File System Access, so a
// backup is a file download. Downloads must come only from a real change of
// the match, never from opening or loading it (a 0:0 file), and a point
// scored while a backup is saved must not be lost.
// Ported from OpenVolley src/hooks/__tests__/useAutoBackup.browser.test.js.

// Dexie stand-in with the table hook API the write hook uses
const { fakeDb } = vi.hoisted(() => {
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
  return { fakeDb }
})

vi.mock('../../db_beach/db_beach', () => ({ db: fakeDb }))
vi.mock('../../utils_beach/backupManager_beach', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, downloadMatchBackup: vi.fn(async () => 'backup.json'), writeMatchBackup: vi.fn() }
})

import useAutoBackup from '../../hooks_beach/useAutoBackup_beach'
import { downloadMatchBackup } from '../../utils_beach/backupManager_beach'

const point = (matchId = 7) => act(() => fakeDb.write('events', 'creating', undefined, { matchId, type: 'point' }))
const minutes = (n) => act(() => { vi.advanceTimersByTime(n * 60 * 1000) })

beforeEach(() => {
  vi.useFakeTimers()
  useMemoryLocalStorage()
  localStorage.setItem('autoBackupEnabled', 'true') // switched on in this browser
  localStorage.setItem('backupFrequencyMinutes', '5')
  downloadMatchBackup.mockReset()
  downloadMatchBackup.mockImplementation(async () => 'backup.json')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('useAutoBackup in a browser', () => {
  it('never downloads just because a match was opened', async () => {
    const { result, unmount } = renderHook(() => useAutoBackup(7))
    expect(result.current.hasFileSystemAccess).toBe(false)
    expect(result.current.autoBackupEnabled).toBe(true)
    minutes(30)
    expect(downloadMatchBackup).not.toHaveBeenCalled()
    // the start of a set (0:0) and a timeout are no download either
    act(() => result.current.triggerEventBackup('set_start'))
    act(() => result.current.triggerEventBackup('timeout'))
    expect(downloadMatchBackup).not.toHaveBeenCalled()
    unmount()
  })

  it('downloads every N minutes only after the match changed, and at set / match end', async () => {
    const { result, unmount } = renderHook(() => useAutoBackup(7))
    point()
    minutes(4)
    expect(downloadMatchBackup).not.toHaveBeenCalled() // 5 minutes after opening
    minutes(1)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)
    expect(downloadMatchBackup).toHaveBeenCalledWith(7)
    await act(async () => {}) // the download settles
    minutes(15) // nothing new since: no second file
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)
    // a "rally started" is not a change worth a file
    act(() => fakeDb.write('events', 'creating', undefined, { matchId: 7, type: 'rally_start' }))
    minutes(10)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)
    // a write of another match neither
    point(8)
    minutes(10)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)

    act(() => result.current.triggerEventBackup('set_end'))
    expect(downloadMatchBackup).toHaveBeenCalledTimes(2)
    act(() => result.current.triggerEventBackup('match_end'))
    expect(downloadMatchBackup).toHaveBeenCalledTimes(3)
    unmount()
  })

  it('a point scored while the backup is being saved is downloaded next time', async () => {
    let finish
    downloadMatchBackup.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
    const { unmount } = renderHook(() => useAutoBackup(7))
    point()
    minutes(5)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)
    // the match is being read and saved: the last point of the set lands now
    point()
    await act(async () => { finish('backup.json') })
    minutes(5)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(2)
    unmount()
  })

  it('a failed download is retried at the next tick', async () => {
    downloadMatchBackup.mockRejectedValueOnce(new Error('blocked'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { unmount } = renderHook(() => useAutoBackup(7))
    point()
    minutes(5)
    await act(async () => {})
    expect(downloadMatchBackup).toHaveBeenCalledTimes(1)
    minutes(1)
    expect(downloadMatchBackup).toHaveBeenCalledTimes(2)
    err.mockRestore()
    unmount()
  })

  it('switched off, the write hook is not installed', () => {
    localStorage.setItem('autoBackupEnabled', 'false')
    const { unmount } = renderHook(() => useAutoBackup(7))
    expect(fakeDb.events.subs.creating.size).toBe(0)
    point()
    minutes(30)
    expect(downloadMatchBackup).not.toHaveBeenCalled()
    unmount()
  })
})
