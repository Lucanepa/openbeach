// The confirmation-dialog pattern used by every scorer dialog (Scoreboard_beach):
// snapshot when the dialog opens, close before the first await, and refuse a
// second run while one is in flight. Scoreboard_beach is too large to render
// here, so a small harness reproduces the delay penalty dialog against a store
// that behaves like Dexie's live query: the screen re-renders the moment the
// write commits, while the confirm handler is still awaiting the rest of its
// work (snapshot capture, sync queue).
// Ported from OpenVolley src/hooks/__tests__/useConfirmAction.test.jsx.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react'
import { useConfirmAction, GHOST_CLICK_MS, resetGhostClickGuard } from '../../hooks_beach/useConfirmAction_beach'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// each test starts without the previous test's ghost-click guard
afterEach(() => resetGhostClickGuard())

function liveStore(initial = []) {
  let events = initial
  const listeners = new Set()
  return {
    subscribe: l => { listeners.add(l); return () => listeners.delete(l) },
    get: () => events,
    writes: 0,
    // like logEvent: the event commits (live query fires), then more awaits
    async write(e) {
      this.writes++
      await sleep(1)
      events = [...events, { ...e, setIndex: 1, seq: events.length + 1 }]
      listeners.forEach(l => l())
      await sleep(20)
    }
  }
}

// A delay penalty gives the other team a point. pattern 'fixed': snapshot +
// close first + guard (what Scoreboard_beach does now); 'before': write then
// close, no guard (what it did)
function DelayPenaltyDialog({ store, pattern, log }) {
  const events = useSyncExternalStore(store.subscribe, store.get)
  const points = events.filter(e => e.type === 'point').length
  const [modal, setModal] = useState(null)
  const run = useConfirmAction()

  const open = () => setModal({ team: 'team1', type: 'delay_penalty' })
  const write = async (req) => {
    await store.write({ type: 'sanction', payload: { team: req.team, type: req.type } })
    await store.write({ type: 'point', payload: { team: 'team2', fromPenalty: true } })
  }
  const confirmFixed = () => run(async () => {
    const req = modal
    if (!req) return
    setModal(null)
    await write(req)
  })
  const confirmBefore = async () => {
    if (!modal) return
    await write(modal)
    setModal(null)
  }

  const text = modal ? `Delay penalty for team 1? Score ${points}` : null
  // every committed frame's dialog text
  useLayoutEffect(() => { log.push(text) })

  return (
    <div>
      <button onClick={open}>Delay penalty</button>
      {text && (
        <div role="dialog">
          <p>{text}</p>
          <button onClick={pattern === 'before' ? confirmBefore : confirmFixed}>Confirm</button>
        </div>
      )}
    </div>
  )
}

describe('useConfirmAction', () => {
  it('runs the action once while a run is in flight', async () => {
    const { result } = renderHook(() => useConfirmAction())
    const action = vi.fn(() => sleep(10))
    let first, second
    await act(async () => {
      first = result.current(action)
      second = result.current(action)
      await Promise.all([first, second])
    })
    expect(action).toHaveBeenCalledTimes(1)
    await expect(first).resolves.toBe(true)
    await expect(second).resolves.toBe(false)
  })

  it('is free again after the action finishes or throws', async () => {
    const { result } = renderHook(() => useConfirmAction())
    await act(async () => {
      await expect(result.current(() => Promise.reject(new Error('db')))).rejects.toThrow('db')
    })
    const action = vi.fn()
    await act(async () => { await result.current(action) })
    expect(action).toHaveBeenCalledTimes(1)
  })

  it('swallows the second tap of a double tap, which would land under the closed dialog', async () => {
    const under = vi.fn()
    function Screen() {
      const run = useConfirmAction()
      const [open, setOpen] = useState(true)
      return (
        <div>
          <button onClick={under}>court player</button>
          {open && <button onClick={() => run(async () => { setOpen(false); await sleep(5) })}>Yes</button>}
        </div>
      )
    }
    render(<Screen />)
    await act(async () => {
      fireEvent.click(screen.getByText('Yes'))
      // the dialog is gone; the trailing tap hits what was under it
      fireEvent.click(screen.getByText('court player'))
      await sleep(20)
    })
    expect(screen.queryByText('Yes')).toBeNull()
    expect(under).not.toHaveBeenCalled()
    await act(async () => { await sleep(GHOST_CLICK_MS + 50) })
    fireEvent.click(screen.getByText('court player'))
    expect(under).toHaveBeenCalledTimes(1)
  })

  it('reports a failed write through onError (the dialog is already closed)', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useConfirmAction(onError))
    let ran
    await act(async () => { ran = await result.current(() => Promise.reject(new Error('db'))) })
    expect(ran).toBe(false)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe('db')
    const action = vi.fn()
    await act(async () => { await result.current(action) })
    expect(action).toHaveBeenCalledTimes(1)
  })
})

describe('delay penalty dialog against a live store', () => {
  async function confirm(store, pattern, taps) {
    const log = []
    render(<DelayPenaltyDialog store={store} pattern={pattern} log={log} />)
    fireEvent.click(screen.getByText('Delay penalty'))
    log.length = 0
    const button = screen.getByText('Confirm')
    await act(async () => {
      // the taps land before React re-renders (same closure, same snapshot)
      for (let i = 0; i < taps; i++) fireEvent.click(button)
      await sleep(80)
    })
    return log
  }

  it('a double tap on confirm gives one point', async () => {
    const store = liveStore()
    await confirm(store, 'fixed', 2)
    expect(store.get().filter(e => e.type === 'point')).toHaveLength(1)
    expect(store.get().filter(e => e.type === 'sanction')).toHaveLength(1)
  })

  it('without the guard the same double tap gives two points (control)', async () => {
    const store = liveStore()
    await confirm(store, 'before', 2)
    expect(store.get().filter(e => e.type === 'point')).toHaveLength(2)
  })

  it('the dialog is gone before the written data is drawn', async () => {
    const log = await confirm(liveStore(), 'fixed', 1)
    expect(log.filter(Boolean)).toEqual([])
  })

  it('writing first redraws the open dialog with the new score (control)', async () => {
    const log = await confirm(liveStore(), 'before', 1)
    expect(log).toContain('Delay penalty for team 1? Score 1')
  })
})
