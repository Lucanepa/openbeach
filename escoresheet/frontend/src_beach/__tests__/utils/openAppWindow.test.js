import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import {
  APP_VIEW_ATTR,
  MSG_CLOSE,
  MSG_SAVE_PDF,
  currentInAppView,
  detectAppPlatform,
  openAppWindow,
  openedAppWindows,
  pdfBusyInAppWindows,
  resetAppWindowsForTests,
  setPdfBusy
} from '../../utils_beach/openAppWindow_beach'
import {
  MSG_PDF_BLOB,
  MSG_PDF_ERROR,
  closeAppWindow,
  deliverPdfToOpener,
  getOpenerWindow,
  isInAppView,
  savePdfThroughApp
} from '../../utils_beach/appWindowGuest_beach'

// In the Android app (Capacitor) a window.open replaced the scorer's page with
// scoresheet_beach.html, so the match-end approval waited for a PDF that never
// came back. Ported from OpenVolley: an in-app view (a same-origin iframe) over
// the screen, the page talking back with postMessage.

const ORIGIN = 'http://localhost:5174'

function fakeWin({ opened = {}, extra = {} } = {}) {
  return {
    location: { href: `${ORIGIN}/`, origin: ORIGIN, assign: vi.fn() },
    open: vi.fn(() => opened),
    ...extra
  }
}

afterEach(() => {
  currentInAppView()?.close()
  document.body.innerHTML = ''
})

describe('openAppWindow', () => {
  it('tells the desktop app, the Android app and a browser apart', () => {
    expect(detectAppPlatform({ __TAURI_INTERNALS__: {} })).toBe('tauri')
    expect(detectAppPlatform({ Capacitor: { isNativePlatform: () => true } })).toBe('capacitor')
    expect(detectAppPlatform({})).toBe('web')
  })

  it('in a browser: the scoresheet is a popup, a blocked one says so', () => {
    const win = fakeWin()
    expect(openAppWindow('/scoresheet_beach.html', { win })).toMatchObject({ ok: true, mode: 'popup', platform: 'web' })
    expect(win.open).toHaveBeenCalledWith(`${ORIGIN}/scoresheet_beach.html`, '_blank', 'width=1200,height=900')
    expect(openAppWindow('/scoresheet_beach.html', { win: fakeWin({ opened: null }) })).toMatchObject({ ok: false, mode: 'blocked' })
    expect(openAppWindow('javascript:alert(1)', { win })).toMatchObject({ ok: false, mode: 'blocked' })
  })

  it('in the Android app: an in-app view over the screen, never window.open or leaving the page', () => {
    const spy = vi.spyOn(window, 'open')
    const screen = document.createElement('div')
    screen.id = 'match-end'
    document.body.appendChild(screen)
    const r = openAppWindow('/scoresheet_beach.html?action=getBlob', { win: window, platform: 'capacitor', title: 'Scoresheet' })
    expect(spy).not.toHaveBeenCalled()
    expect(r).toMatchObject({ ok: true, mode: 'in-app', platform: 'capacitor' })
    const view = document.querySelector('[data-testid="app-window"]')
    const frame = view.querySelector('iframe')
    expect(frame.hasAttribute(APP_VIEW_ATTR)).toBe(true)
    expect(frame.getAttribute('src')).toBe(`${window.location.origin}/scoresheet_beach.html?action=getBlob`)
    expect(r.window).toBe(frame.contentWindow)
    // the page asks to close (after handing over its PDF): back to the screen, untouched
    window.dispatchEvent(new MessageEvent('message', { data: { type: MSG_CLOSE }, origin: window.location.origin, source: r.window }))
    expect(document.querySelector('[data-testid="app-window"]')).toBeNull()
    expect(document.getElementById('match-end')).toBe(screen)
    spy.mockRestore()
  })

  it('in the Android app: Back (popstate) closes the view; saving a PDF says why it cannot', () => {
    const r = openAppWindow('/scoresheet_beach.html', { win: window, platform: 'capacitor' })
    window.dispatchEvent(new MessageEvent('message', { data: { type: MSG_SAVE_PDF, arrayBuffer: new ArrayBuffer(4), filename: 'x.pdf' }, origin: window.location.origin, source: r.window }))
    expect(document.querySelector('[data-testid="app-window-status"]').textContent).toMatch(/cannot save PDF/)
    window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    expect(document.querySelector('[data-testid="app-window"]')).toBeNull()
  })

  it('every window.open of the app goes through openAppWindow', () => {
    const root = resolve(__dirname, '../../..')
    const offenders = []
    for (const dir of ['src_beach', 'scoresheet_pdf_beach']) {
      for (const f of readdirSync(join(root, dir), { recursive: true })) {
        if (!/\.(jsx?|tsx?)$/.test(f) || f.includes('__tests__') || f.endsWith('openAppWindow_beach.js')) continue
        readFileSync(join(root, dir, f), 'utf8').split('\n').forEach((line, i) => {
          if (/\bwindow\.open\s*\(/.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${dir}/${f}:${i + 1}`)
        })
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('the desktop app windows this page opened (quit question)', () => {
  beforeEach(() => resetAppWindowsForTests())
  afterEach(() => resetAppWindowsForTests())

  it('tracks the app windows, not external links, and forgets closed ones', () => {
    const scoresheet = { closed: false }
    openAppWindow('/scoresheet_beach.html?matchId=7', { win: fakeWin({ opened: scoresheet }), platform: 'tauri' })
    openAppWindow('https://openvolley.app/help', { win: fakeWin({ opened: null }), platform: 'tauri' })
    // a browser popup is not an app window
    openAppWindow('/scoresheet_beach.html', { win: fakeWin({ opened: { closed: false } }), platform: 'web' })
    expect(openedAppWindows()).toEqual([scoresheet])
    scoresheet.closed = true
    expect(openedAppWindows()).toEqual([])
  })

  it('knows when one of them is still making / saving a PDF', () => {
    const a = { closed: false }
    const b = { closed: false }
    openAppWindow('/scoresheet_beach.html?matchId=7', { win: fakeWin({ opened: a }), platform: 'tauri' })
    openAppWindow('/scoresheet_beach.html?matchId=7&action=save', { win: fakeWin({ opened: b }), platform: 'tauri' })
    expect(pdfBusyInAppWindows()).toBe(false)
    setPdfBusy(true, b) // the scoresheet page sets it on its own window
    expect(pdfBusyInAppWindows()).toBe(true)
    setPdfBusy(false, b)
    expect(pdfBusyInAppWindows()).toBe(false)
    // a window that cannot be read is not counted as busy
    const locked = { closed: false, get __obPdfBusy() { throw new Error('SecurityError') } }
    expect(pdfBusyInAppWindows([locked])).toBe(false)
    expect(pdfBusyInAppWindows([{ closed: true, __obPdfBusy: true }])).toBe(false)
  })

  it('the scoresheet page sets the flag while it makes a PDF', () => {
    const src = readFileSync(resolve(__dirname, '../../../scoresheet_pdf_beach/App.tsx'), 'utf8')
    const save = src.slice(src.indexOf('const handleSavePDF'))
    expect(save).toMatch(/setPdfBusy\(true\)/)
    // cleared in the finally, so a failed PDF does not stay "busy"
    expect(save).toMatch(/finally \{[^}]*setPdfBusy\(false\)/)
  })
})

describe('the scoresheet page side (appWindowGuest_beach)', () => {
  function frameWin({ inView = true, opener = null } = {}) {
    const parent = { postMessage: vi.fn() }
    const win = {
      opener,
      close: vi.fn(),
      location: { origin: ORIGIN, href: `${ORIGIN}/scoresheet_beach.html?action=getBlob` },
      frameElement: inView ? { hasAttribute: (a) => a === APP_VIEW_ATTR } : null
    }
    win.parent = inView ? parent : win
    return { win, parent }
  }

  it('its opener is the popup opener or the scorer page under the in-app view', () => {
    const opener = { closed: false }
    expect(getOpenerWindow(frameWin({ inView: false, opener }).win)).toBe(opener)
    const { win, parent } = frameWin()
    expect(isInAppView(win)).toBe(true)
    expect(getOpenerWindow(win)).toBe(parent)
    expect(getOpenerWindow(frameWin({ inView: false }).win)).toBeNull()
  })

  it('getBlob: the PDF goes back to the match-end approval, then the view closes', () => {
    vi.useFakeTimers()
    const { win, parent } = frameWin()
    expect(deliverPdfToOpener({ arrayBuffer: new ArrayBuffer(4), filename: '35.pdf' }, win)).toBe(true)
    expect(parent.postMessage.mock.calls[0][0]).toMatchObject({ type: MSG_PDF_BLOB, filename: '35.pdf' })
    expect(parent.postMessage.mock.calls[0][1]).toBe(ORIGIN)
    vi.advanceTimersByTime(600)
    expect(parent.postMessage).toHaveBeenLastCalledWith({ type: MSG_CLOSE }, ORIGIN)
    vi.useRealTimers()
  })

  it('getBlob: a failed capture tells the approval at once (no 30 s wait)', () => {
    const opener = { closed: false, postMessage: vi.fn() }
    const popup = frameWin({ inView: false, opener })
    deliverPdfToOpener({ error: 'canvas too large' }, popup.win)
    expect(opener.postMessage).toHaveBeenCalledWith({ type: MSG_PDF_ERROR, reason: 'failed', message: 'canvas too large' }, ORIGIN)
    expect(deliverPdfToOpener({ error: 'x' }, frameWin({ inView: false }).win)).toBe(false)
  })

  it('closes the popup, or asks the app to close the in-app view; a PDF goes to the app only in the view', async () => {
    const popup = frameWin({ inView: false })
    closeAppWindow(popup.win)
    expect(popup.win.close).toHaveBeenCalled()
    const { win, parent } = frameWin()
    closeAppWindow(win)
    expect(parent.postMessage).toHaveBeenCalledWith({ type: MSG_CLOSE }, ORIGIN)
    const blob = new Blob(['%PDF'], { type: 'application/pdf' })
    expect(await savePdfThroughApp(blob, 'x.pdf', frameWin({ inView: false }).win)).toBe(false)
    expect(await savePdfThroughApp(blob, 'x.pdf', win)).toBe(true)
  })
})
