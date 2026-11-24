// Two timers of the scoring screen can fire after the page is gone: the
// sync queue's write notice (a 0 ms timer per sync job) and the end of the
// ghost-click guard (useConfirmAction). Under the full suite's load a test
// file's environment was torn down with one still pending, and its uncaught
// "window is not defined" failed the whole run (2026-10-08, after
// ScoreboardSetStartRemarkRedoManual; before that CoinTossLayout,
// ScoreboardMedical, MatchSetupInfoForm, useConfirmAction). Without a
// window they now do nothing.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const hooks = vi.hoisted(() => ({ creating: null }))
vi.mock('../../db_beach/db_beach', () => ({
  db: { sync_queue: { hook: (name, fn) => { if (name === 'creating') hooks.creating = fn } } }
}))

import '../../hooks_beach/useSyncQueue_beach'
import { useConfirmAction, GHOST_CLICK_MS, resetGhostClickGuard } from '../../hooks_beach/useConfirmAction_beach'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetGhostClickGuard()
})

describe('timers that fire after the page is gone', () => {
  it('the sync queue write notice: sent while there is a page, nothing without one', () => {
    vi.useFakeTimers()
    const seen = vi.fn()
    window.addEventListener('sync-queue-write', seen)
    hooks.creating()
    vi.advanceTimersByTime(0)
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener('sync-queue-write', seen)

    hooks.creating()
    vi.stubGlobal('window', undefined)
    expect(() => vi.advanceTimersByTime(0)).not.toThrow()
  })

  it('the end of the ghost-click guard without a page', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useConfirmAction())
    await act(async () => { await result.current(async () => {}) })
    vi.stubGlobal('window', undefined)
    expect(() => vi.advanceTimersByTime(GHOST_CLICK_MS)).not.toThrow()
  })
})
