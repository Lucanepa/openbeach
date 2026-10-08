/**
 * The page side of openAppWindow_beach.js (after OpenVolley's
 * appWindowGuest.js): a page (the scoresheet) opened as a
 * popup / app window (browser, desktop app) or inside the in-app view of the
 * Android app.
 */

import { MSG_CLOSE, MSG_SAVE_PDF, isInAppView } from './openAppWindow_beach.js'

export { isInAppView }

/** The window that opened this page: the opener, or the app under the in-app view. */
export function getOpenerWindow(win = window) {
  try {
    if (win.opener && !win.opener.closed) return win.opener
  } catch { /* ignore */ }
  return isInAppView(win) ? win.parent : null
}

/** Closes this page: the popup / app window, or the in-app view. */
export function closeAppWindow(win = window) {
  if (isInAppView(win)) {
    win.parent.postMessage({ type: MSG_CLOSE }, win.location.origin)
    return
  }
  win.close()
}

/**
 * In the in-app view, hands a PDF to the app to save (the WebView cannot
 * download a blob). Returns false elsewhere: the page saves it itself.
 */
export async function savePdfThroughApp(blob, filename, win = window) {
  if (!isInAppView(win)) return false
  const arrayBuffer = await blob.arrayBuffer()
  win.parent.postMessage({ type: MSG_SAVE_PDF, arrayBuffer, filename }, win.location.origin)
  return true
}

/** Messages to the window that asked for the PDF (MatchEnd's approval). */
export const MSG_PDF_BLOB = 'pdfBlob'
export const MSG_PDF_ERROR = 'pdfError'
/** The heartbeat while the PDF is made: { page, pages } (scoresheetPdfRequest_beach.js). */
export const MSG_PDF_PROGRESS = 'pdfProgress'
/**
 * The approval's request id in this page's URL (`pdfReq`,
 * scoresheetPdfRequest_beach.js). Every answer carries it, so the approval
 * ignores a window of an earlier attempt (its late "closed" ended the new
 * wait).
 */
export const PDF_REQUEST_PARAM = 'pdfReq'

function withRequestId(message, win) {
  let req = null
  try {
    req = new URLSearchParams(win.location?.search || '').get(PDF_REQUEST_PARAM)
  } catch { /* no URL: no id */ }
  return req ? { ...message, req } : message
}

/** Tells the opener the PDF is still being made (page n of m). */
export function reportPdfProgress(progress = {}, win = window) {
  const opener = getOpenerWindow(win)
  if (!opener) return false
  try {
    opener.postMessage(withRequestId({ type: MSG_PDF_PROGRESS, page: progress.page ?? null, pages: progress.pages ?? null }, win), win.location.origin)
    return true
  } catch {
    return false
  }
}

/**
 * While `isBusy()` (the PDF is being made), closing this window tells the
 * opener at once ('pdfError', reason 'closed'), so the approval does not
 * wait for a PDF that will never come. Returns the cleanup.
 */
export function watchPdfWindowClose(isBusy, win = window) {
  let sent = false
  const onLeave = () => {
    if (sent || !isBusy()) return
    const opener = getOpenerWindow(win)
    if (!opener) return
    sent = true
    try {
      opener.postMessage(withRequestId({ type: MSG_PDF_ERROR, reason: 'closed', message: 'The scoresheet window was closed' }, win), win.location.origin)
    } catch { /* opener gone */ }
  }
  win.addEventListener('pagehide', onLeave)
  win.addEventListener('beforeunload', onLeave)
  return () => {
    win.removeEventListener('pagehide', onLeave)
    win.removeEventListener('beforeunload', onLeave)
  }
}

/**
 * The end of a getBlob scoresheet (the match-end approval): hands the PDF to
 * the opener (a popup's opener, or the scorer page under the in-app view), or
 * says why it could not be made so the opener stops waiting, then closes this
 * window / in-app view. Without an opener nobody waits: the page stays.
 * @param {{ arrayBuffer: ArrayBuffer, filename: string } | { error: string }} result
 */
export function deliverPdfToOpener(result, win = window) {
  const opener = getOpenerWindow(win)
  if (!opener) return false
  const origin = win.location.origin
  try {
    if (result && 'arrayBuffer' in result) opener.postMessage(withRequestId({ type: MSG_PDF_BLOB, arrayBuffer: result.arrayBuffer, filename: result.filename }, win), origin)
    else opener.postMessage(withRequestId({ type: MSG_PDF_ERROR, reason: 'failed', message: result?.error || 'PDF generation failed' }, win), origin)
  } catch { /* opener gone */ }
  setTimeout(() => closeAppWindow(win), 500)
  return true
}
