/**
 * The match-end approval's PDF (after OpenVolley's
 * src/utils/scoresheetPdfRequest.js): MatchEnd opens the scoresheet with
 * action=getBlob (a popup, a desktop app window or the Android in-app view)
 * and the page answers by postMessage (appWindowGuest_beach.js):
 *
 * - `pdfProgress` while it works (a heartbeat, at least once a second),
 * - `pdfBlob` with the PDF, or
 * - `pdfError` when it could not make it (reason 'closed' when its window is
 *   closed while the PDF is being made).
 *
 * OpenBeach 2026-10-08: closing the scoresheet window while it made the PDF
 * left the scorer waiting up to 30 s with nothing to press. Now the wait
 * ends at once when the window is gone (polled), when the page stops
 * sending its heartbeat, on the scorer's Cancel (an AbortSignal) or after a
 * hard timeout, and the error says which (`error.reason`).
 */

import { MSG_PDF_BLOB, MSG_PDF_ERROR, MSG_PDF_PROGRESS } from './appWindowGuest_beach.js'

/** Hard limit for the whole PDF (the heartbeat normally ends a stuck wait first). */
export const PDF_TIMEOUT_MS = 90000
/** No heartbeat from the scoresheet for this long: it is gone or stuck. */
export const PDF_STALL_MS = 10000
/** How often the opened window is checked for being closed. */
export const PDF_CLOSED_POLL_MS = 500

/** Error reasons: why no PDF came. */
export const PDF_FAIL = Object.freeze({
  CLOSED: 'closed',
  STALLED: 'stalled',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled',
  BLOCKED: 'blocked',
  FAILED: 'failed'
})

function pdfError(reason, message) {
  const e = new Error(message)
  e.reason = reason
  return e
}

/** Whether the window / in-app view openAppWindow returned has gone away. */
export function openedWindowClosed(opened) {
  if (!opened) return false
  try {
    if (typeof opened.isClosed === 'function') return opened.isClosed() === true
    return opened.window ? opened.window.closed === true : false
  } catch {
    return false // not readable: unknown, the heartbeat decides
  }
}

function closeOpened(opened) {
  try {
    if (opened?.close) opened.close()
    else opened?.window?.close?.()
  } catch { /* already gone */ }
}

/**
 * Opens the scoresheet through `open()` (an openAppWindow call) and resolves
 * with { blob, filename } when its PDF arrives. Rejects with an Error whose
 * `reason` is one of PDF_FAIL. On a stall, timeout or cancel the window is
 * closed, so none is left behind.
 * @param {() => ({ ok?: boolean, window?: Window|null, close?: () => void, isClosed?: () => boolean } | undefined)} open
 * @param {{ win?: Window, timeoutMs?: number, stallMs?: number, pollMs?: number, signal?: AbortSignal, onProgress?: (p: { page?: number, pages?: number }) => void }} [opts]
 */
export function waitForScoresheetPdf(open, {
  win = window,
  timeoutMs = PDF_TIMEOUT_MS,
  stallMs = PDF_STALL_MS,
  pollMs = PDF_CLOSED_POLL_MS,
  signal,
  onProgress
} = {}) {
  let opened
  let settled = false
  let timer = null
  let stallTimer = null
  let pollTimer = null
  let onAbort = null

  return new Promise((resolve, reject) => {
    const done = () => {
      settled = true
      clearTimeout(timer)
      clearTimeout(stallTimer)
      clearInterval(pollTimer)
      win.removeEventListener('message', handler)
      if (onAbort) signal?.removeEventListener?.('abort', onAbort)
    }
    const fail = (reason, message, { close = true } = {}) => {
      if (settled) return
      done()
      if (close) closeOpened(opened)
      reject(pdfError(reason, message))
    }
    const armStall = () => {
      clearTimeout(stallTimer)
      stallTimer = setTimeout(() => fail(PDF_FAIL.STALLED, 'The scoresheet window stopped answering'), stallMs)
    }

    function handler(event) {
      // only the app's own pages (same origin) answer
      if (event.origin !== win.location.origin) return
      const type = event.data?.type
      if (type === MSG_PDF_PROGRESS) {
        armStall()
        try { onProgress?.({ page: event.data.page, pages: event.data.pages }) } catch { /* ignore */ }
      } else if (type === MSG_PDF_BLOB) {
        if (settled) return
        done()
        resolve({ blob: new Blob([event.data.arrayBuffer], { type: 'application/pdf' }), filename: event.data.filename })
      } else if (type === MSG_PDF_ERROR) {
        if (event.data.reason === PDF_FAIL.CLOSED) fail(PDF_FAIL.CLOSED, 'The scoresheet window was closed before the PDF was ready', { close: false })
        else fail(PDF_FAIL.FAILED, event.data.message || 'The scoresheet could not create the PDF')
      }
    }

    if (signal?.aborted) {
      settled = true
      reject(pdfError(PDF_FAIL.CANCELLED, 'Cancelled'))
      return
    }
    win.addEventListener('message', handler)
    if (signal) {
      onAbort = () => fail(PDF_FAIL.CANCELLED, 'Cancelled')
      signal.addEventListener('abort', onAbort, { once: true })
    }
    timer = setTimeout(() => fail(PDF_FAIL.TIMEOUT, 'PDF generation timed out'), timeoutMs)
    armStall()

    try {
      opened = open()
    } catch (e) {
      fail(PDF_FAIL.BLOCKED, e?.message || 'The scoresheet window could not be opened', { close: false })
      return
    }
    // nothing opened (a browser's popup blocker): no answer will come
    if (opened && opened.ok === false) {
      fail(PDF_FAIL.BLOCKED, 'The scoresheet window could not be opened', { close: false })
      return
    }
    pollTimer = setInterval(() => {
      if (openedWindowClosed(opened)) fail(PDF_FAIL.CLOSED, 'The scoresheet window was closed before the PDF was ready', { close: false })
    }, pollMs)
  })
}
