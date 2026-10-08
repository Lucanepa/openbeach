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
