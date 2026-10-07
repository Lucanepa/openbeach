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
    if (result && 'arrayBuffer' in result) opener.postMessage({ type: MSG_PDF_BLOB, arrayBuffer: result.arrayBuffer, filename: result.filename }, origin)
    else opener.postMessage({ type: MSG_PDF_ERROR, message: result?.error || 'PDF generation failed' }, origin)
  } catch { /* opener gone */ }
  setTimeout(() => closeAppWindow(win), 500)
  return true
}
