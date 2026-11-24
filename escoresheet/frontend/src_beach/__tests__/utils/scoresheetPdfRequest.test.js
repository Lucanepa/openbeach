// The match-end approval waits for the scoresheet window's PDF. OpenBeach
// 2026-10-08 (video 08:13 / 08:36): closing that window while it made the
// PDF left the scorer waiting with nothing to press. The wait must end at
// once on a closed window, a lost heartbeat or Cancel, and say why.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitForScoresheetPdf, openedWindowClosed, PDF_FAIL } from '../../utils_beach/scoresheetPdfRequest_beach'
import {
  MSG_PDF_BLOB, MSG_PDF_ERROR, MSG_PDF_PROGRESS,
  reportPdfProgress, watchPdfWindowClose, deliverPdfToOpener
} from '../../utils_beach/appWindowGuest_beach'

const post = (data) => window.dispatchEvent(new MessageEvent('message', { data, origin: window.location.origin }))

describe('waitForScoresheetPdf', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('resolves with the PDF the scoresheet sends', async () => {
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false } }))
    post({ type: MSG_PDF_PROGRESS, page: 1, pages: 3 })
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'a.pdf' })
    const r = await p
    expect(r.filename).toBe('a.pdf')
    expect(r.blob.type).toBe('application/pdf')
  })

  it('fails at once (no 30 s wait) when the window is closed', async () => {
    const w = { closed: false }
    const p = waitForScoresheetPdf(() => ({ ok: true, window: w }))
    const caught = p.catch(e => e)
    w.closed = true
    await vi.advanceTimersByTimeAsync(600)
    const e = await caught
    expect(e.reason).toBe(PDF_FAIL.CLOSED)
  })

  it('fails at once when the page says it was closed (pagehide)', async () => {
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false } }))
    const caught = p.catch(e => e)
    post({ type: MSG_PDF_ERROR, reason: 'closed' })
    expect((await caught).reason).toBe(PDF_FAIL.CLOSED)
  })

  it('fails when the heartbeat stops, and closes the window', async () => {
    const close = vi.fn()
    const progress = vi.fn()
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false }, close }), { stallMs: 8000, onProgress: progress })
    const caught = p.catch(e => e)
    await vi.advanceTimersByTimeAsync(5000)
    post({ type: MSG_PDF_PROGRESS, page: 1, pages: 3 }) // still alive: the stall clock restarts
    await vi.advanceTimersByTimeAsync(7000)
    expect(close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1500)
    expect((await caught).reason).toBe(PDF_FAIL.STALLED)
    expect(close).toHaveBeenCalled()
    expect(progress).toHaveBeenCalledWith({ page: 1, pages: 3 })
  })

  it('Cancel (AbortSignal) ends the wait and closes the window', async () => {
    const ac = new AbortController()
    const close = vi.fn()
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false }, close }), { signal: ac.signal })
    const caught = p.catch(e => e)
    ac.abort()
    expect((await caught).reason).toBe(PDF_FAIL.CANCELLED)
    expect(close).toHaveBeenCalled()
  })

  it('a blocked window fails as blocked', async () => {
    const e = await waitForScoresheetPdf(() => ({ ok: false, window: null })).catch(x => x)
    expect(e.reason).toBe(PDF_FAIL.BLOCKED)
  })

  it('a render error from the page fails as failed', async () => {
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false } }))
    const caught = p.catch(e => e)
    post({ type: MSG_PDF_ERROR, reason: 'failed', message: 'boom' })
    const e = await caught
    expect(e.reason).toBe(PDF_FAIL.FAILED)
    expect(e.message).toBe('boom')
  })

  it('an in-app view (Android) counts as closed through isClosed()', () => {
    expect(openedWindowClosed({ window: { closed: false }, isClosed: () => true })).toBe(true)
    expect(openedWindowClosed({ window: { closed: true } })).toBe(true)
    expect(openedWindowClosed({ window: null })).toBe(false)
  })
})

describe('the scoresheet window side', () => {
  function fakeWin() {
    const listeners = {}
    const opener = { closed: false, postMessage: vi.fn() }
    return {
      opener,
      parent: null,
      location: { origin: 'http://x' },
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f) },
      removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(g => g !== f) },
      fire: (t) => (listeners[t] || []).forEach(f => f()),
      close: vi.fn()
    }
  }

  it('reports progress to the opener', () => {
    const w = fakeWin()
    expect(reportPdfProgress({ page: 2, pages: 3 }, w)).toBe(true)
    expect(w.opener.postMessage).toHaveBeenCalledWith({ type: MSG_PDF_PROGRESS, page: 2, pages: 3 }, 'http://x')
  })

  it('closing the window while busy tells the opener once, and not when idle', () => {
    const w = fakeWin()
    let busy = false
    const stop = watchPdfWindowClose(() => busy, w)
    w.fire('pagehide')
    expect(w.opener.postMessage).not.toHaveBeenCalled()
    busy = true
    w.fire('beforeunload')
    w.fire('pagehide')
    expect(w.opener.postMessage).toHaveBeenCalledTimes(1)
    expect(w.opener.postMessage.mock.calls[0][0]).toMatchObject({ type: MSG_PDF_ERROR, reason: 'closed' })
    stop()
  })

  it('a render error carries reason failed', () => {
    vi.useFakeTimers()
    const w = fakeWin()
    deliverPdfToOpener({ error: 'x' }, w)
    expect(w.opener.postMessage.mock.calls[0][0]).toMatchObject({ type: MSG_PDF_ERROR, reason: 'failed', message: 'x' })
    vi.useRealTimers()
  })
})

// A window of an earlier attempt (Cancel, then "Confirm and approve" again;
// or Retry after a stall) can still answer while the new one works: its
// late pagehide said "closed" and ended the NEW wait, whose window was left
// open. Each wait now has a request id (pdfReq in the window's URL), the page
// echoes it, and answers for another request are ignored.
describe('answers from an earlier attempt\'s window', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('open() gets the request id; another request\'s answers are ignored', async () => {
    let req = null
    const close = vi.fn()
    const progress = vi.fn()
    const p = waitForScoresheetPdf((id) => { req = id; return { ok: true, window: { closed: false }, close } }, { onProgress: progress })
    expect(typeof req).toBe('string')
    expect(req.length).toBeGreaterThan(0)
    let settled = false
    p.then(() => { settled = true }, () => { settled = true })
    post({ type: MSG_PDF_PROGRESS, page: 1, pages: 2, req: 'old-attempt' })
    post({ type: MSG_PDF_ERROR, reason: 'closed', req: 'old-attempt' })
    post({ type: MSG_PDF_ERROR, reason: 'failed', req: 'old-attempt' })
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'old.pdf', req: 'old-attempt' })
    await vi.advanceTimersByTimeAsync(10)
    expect(settled).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(progress).not.toHaveBeenCalled()
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'mine.pdf', req })
    expect((await p).filename).toBe('mine.pdf')
  })

  it('an answer without a request id still counts (a page of an older build)', async () => {
    const p = waitForScoresheetPdf(() => ({ ok: true, window: { closed: false } }))
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'b.pdf' })
    expect((await p).filename).toBe('b.pdf')
  })

  it('the scoresheet window echoes the pdfReq of its URL in every answer', () => {
    const opener = { closed: false, postMessage: vi.fn() }
    const listeners = {}
    const w = {
      opener,
      parent: null,
      location: { origin: 'http://x', search: '?action=getBlob&pdfReq=r42' },
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f) },
      removeEventListener: () => {},
      close: vi.fn()
    }
    reportPdfProgress({ page: 1, pages: 2 }, w)
    watchPdfWindowClose(() => true, w)
    listeners.pagehide.forEach(f => f())
    deliverPdfToOpener({ arrayBuffer: new ArrayBuffer(4), filename: 'a.pdf' }, w)
    deliverPdfToOpener({ error: 'boom' }, w)
    const sent = opener.postMessage.mock.calls.map(c => c[0])
    expect(sent).toHaveLength(4)
    for (const m of sent) expect(m.req).toBe('r42')
  })
})

// OpenVolley, league match 2026-11-17, Android tablet (Galaxy Tab A7 Lite):
// "The scoresheet window stopped answering", then Approve without PDF
// (OpenVolley #243). The in-app view is an iframe of the app: ONE main
// thread for both. The sheet's capture held it longer than the stall limit;
// once free, the expired stall timer ran before the page's next heartbeat
// and threw the PDF away (emulator, CPU 20x slower: one 48 s block, failed
// after 58 s). OpenBeach waits the same way, with a shorter stall limit.
// A blocked thread runs nothing, then every due timer once (an interval
// too, not once per missed tick): `block()` below; `run()` is a free thread.
describe('a thread shared with the in-app view (Android)', () => {
  function manualClock () {
    let t = 0
    let seq = 0
    const timers = new Map()
    const add = (fn, ms, repeat) => { const id = ++seq; timers.set(id, { fn, ms: Math.max(1, ms | 0), at: t + Math.max(1, ms | 0), repeat }); return id }
    const fire = async (id, x) => {
      if (x.repeat) x.at = t + x.ms
      else timers.delete(id)
      x.fn()
      await Promise.resolve()
    }
    return {
      now: () => t,
      install () {
        vi.stubGlobal('setTimeout', (fn, ms) => add(fn, ms, false))
        vi.stubGlobal('setInterval', (fn, ms) => add(fn, ms, true))
        vi.stubGlobal('clearTimeout', (id) => timers.delete(id))
        vi.stubGlobal('clearInterval', (id) => timers.delete(id))
      },
      // the thread is free for ms: every timer at its time
      async run (ms) {
        const end = t + ms
        for (;;) {
          const next = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
          if (!next) break
          t = next[1].at
          await fire(...next)
        }
        t = end
      },
      // the thread is blocked for ms (the page captures its sheet): nothing
      // runs, then each due timer once
      async block (ms) {
        t += ms
        const due = [...timers.entries()].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)
        for (const [id, x] of due) if (timers.has(id)) await fire(id, x)
      }
    }
  }

  let clock
  beforeEach(() => { clock = manualClock(); clock.install() })
  afterEach(() => { vi.unstubAllGlobals() })

  const opened = (close = vi.fn()) => () => ({ ok: true, mode: 'in-app', window: { closed: false }, isClosed: () => false, close })

  it('a 48 s capture that holds the shared thread is not taken for a stalled window', async () => {
    const close = vi.fn()
    let e = null
    const p = waitForScoresheetPdf(opened(close), { now: clock.now })
    p.catch(x => { e = x })
    post({ type: MSG_PDF_PROGRESS })
    await clock.run(1000)
    post({ type: MSG_PDF_PROGRESS, page: 1, pages: 2 })
    await clock.block(48000)
    // free again: the page's next heartbeat and its PDF come after this window's timers
    expect(e).toBe(null)
    expect(close).not.toHaveBeenCalled()
    post({ type: MSG_PDF_PROGRESS, page: 2, pages: 2 })
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'slow.pdf' })
    expect((await p).filename).toBe('slow.pdf')
  })

  it('blocked time does not count toward the hard timeout either', async () => {
    // stall limit out of the way: this is about the 90 s limit alone
    const p = waitForScoresheetPdf(opened(), { now: clock.now, stallMs: 200000 })
    post({ type: MSG_PDF_PROGRESS })
    await clock.block(70000)
    for (let i = 0; i < 5; i++) { post({ type: MSG_PDF_PROGRESS, page: 1, pages: 2 }); await clock.run(1000) }
    await clock.block(40000) // 115 s since the start
    post({ type: MSG_PDF_BLOB, arrayBuffer: new ArrayBuffer(4), filename: 'slower.pdf' })
    expect((await p).filename).toBe('slower.pdf')
  })

  it('a page that stays silent while this thread is free still stalls', async () => {
    const close = vi.fn()
    const caught = waitForScoresheetPdf(opened(close), { now: clock.now }).catch(x => x)
    post({ type: MSG_PDF_PROGRESS, page: 1, pages: 2 })
    await clock.block(30000) // counts as one tick
    await clock.run(9000)
    expect(close).not.toHaveBeenCalled()
    await clock.run(1000)
    expect((await caught).reason).toBe(PDF_FAIL.STALLED)
    expect(close).toHaveBeenCalled()
  })

  it('a page that keeps answering but never finishes still times out', async () => {
    const caught = waitForScoresheetPdf(opened(), { now: clock.now }).catch(x => x)
    let e = null
    caught.then(x => { e = x })
    for (let s = 0; s < 95 && !e; s++) { post({ type: MSG_PDF_PROGRESS, page: 1, pages: 2 }); await clock.run(1000) }
    expect(e?.reason).toBe(PDF_FAIL.TIMEOUT)
  })
})
