/**
 * When a team may ask for the Ball Mark Protocol from the scorer's table.
 *
 * A BMP challenges the call that ended the last rally, so it is possible only
 * between that rally's point and the next rally: not while a rally is in play,
 * not before the set's first point, and not once the game has moved on after
 * the point (a court switch, a technical time-out, a time-out, a decision
 * change, another BMP, the next rally's start). The court switch / TTO /
 * set-end dialogs keep their own "BMP request" button for the rally that just
 * ended before them.
 */

// Recorded between rallies without moving the game on: they do not close the
// window for a BMP on the last point
const NEUTRAL = new Set(['sanction', 'remark', 'mto', 'rit', 'medical_end', 'improper_request'])

const seqOf = (e) => Number(e?.seq) || 0

/**
 * null when the team may ask for a BMP now; otherwise why not:
 * 'set_over' | 'exhausted' | 'rally' | 'no_point' | 'moved_on'.
 */
export function teamBmpBlockReason({ events = [], setIndex, setFinished = false, rallyStatus = 'idle', remaining = 2 } = {}) {
  if (setFinished) return 'set_over'
  if (remaining <= 0) return 'exhausted'
  if (rallyStatus === 'in_play') return 'rally'
  const inSet = events
    .filter(e => e && e.setIndex === setIndex && !NEUTRAL.has(e.type))
    // sub-events (seq 7.1) belong to their parent: they sort after it
    .sort((a, b) => seqOf(a) - seqOf(b))
  if (!inSet.some(e => e.type === 'point')) return 'no_point'
  const last = inSet[inSet.length - 1]
  return last.type === 'point' ? null : 'moved_on'
}
