import { emitActivity } from './bus_beach'
import { stackFrames } from '../activitySummary_beach'

/**
 * An uncaught error or rejection, or a render error caught by an error
 * boundary: one 'app.error' entry (message <= 300 characters, the top 5
 * stack frames as file:line; the same message at most 5 times per 10 minutes).
  *
 * Ported from OpenVolley src/utils/activity/appError.js (653b4f27).
 */
export function reportAppError(message, stack, source) {
  try {
    emitActivity('app.error', {
      message: String(message || 'Error').slice(0, 300),
      frames: stackFrames(stack),
      source: source || null
    }, { level: 'error' })
  } catch {
    // never throws
  }
}
