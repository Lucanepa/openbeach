/**
 * When a team may ask for the Ball Mark Protocol from the scorer's table.
 *
 * The rule (owner, 2026-10-08: "there has to be a completed rally, otherwise
 * no"): a BMP is asked about a COMPLETED rally, and only ONCE per rally. After
 * any BMP (a team's or the referee's, successful or not) the next BMP is
 * possible only once another rally has been completed. Together with the rally
 * rules, a team BMP is possible only between a rally's point and the next
 * rally start, and only if no BMP was taken on that rally yet:
 *  - not while a rally is in play ('rally');
 *  - not before the set's first completed rally: at the set start there is
 *    nothing to challenge, and the last set's points do not count ('no_point');
 *  - not once a BMP was taken on the last completed rally ('bmp_taken'): a
 *    team BMP of either team, any outcome, or a referee BMP that decided the
 *    rally. Two BMPs one completed rally apart are fine;
 *  - not once the game has moved on after the point ('moved_on'): a court
 *    switch, a technical time-out, a time-out, a decision change, a penalty
 *    point, the next rally's start, a replay;
 *  - the per-set limit stays (two unsuccessful team BMPs: 'exhausted').
 * The court switch / TTO / set-end dialogs open on the point that ended the
 * rally and keep their own "BMP request" button for it (`dialog: true`): the
 * technical time-out / court switch logged with that point do not close it,
 * a BMP already taken on that rally does (the set-end dialog reopens after an
 * unsuccessful BMP and offered a second one).
 *
 * The referee BMP (the in-rally button) decides the rally in play, so it is
 * offered only while a rally is in play: after any BMP it comes back only with
 * the next rally, and a rally it decided takes no team BMP (its point is the
 * BMP's point, not a rally point).
 *
 * Read from the event log only, never from UI state: an undo or a decision
 * change that takes the point (or the BMP) back moves the window with it, and
 * a reload shows the same as before it.
 */

// Recorded between rallies without moving the game on: they do not close the
// window for a BMP on the last point
const NEUTRAL = new Set(['sanction', 'remark', 'mto', 'rit', 'medical_end', 'improper_request'])

// A BMP and its parts: the outcome (and the point it gave) are sub-events of
// the request; 'bmp' is an older name of the referee BMP outcome
const BMP_PARTS = new Set(['challenge', 'challenge_outcome', 'referee_bmp_request', 'referee_bmp_outcome', 'bmp'])

// Logged with the point that opened the court switch / TTO dialog: they do not
// close that dialog's "BMP request"
const DIALOG_EVENTS = new Set(['technical_to', 'court_switch'])

const seqOf = (e) => Number(e?.seq) || 0

/**
 * null when the team may ask for a BMP now; otherwise why not:
 * 'set_over' | 'exhausted' | 'rally' | 'no_point' | 'bmp_taken' | 'moved_on'.
 * `dialog`: asked from the court switch / TTO / set-end dialog of the point.
 */
export function teamBmpBlockReason({ events = [], setIndex, setFinished = false, rallyStatus = 'idle', remaining = 2, dialog = false } = {}) {
  if (setFinished && !dialog) return 'set_over'
  if (remaining <= 0) return 'exhausted'
  if (rallyStatus === 'in_play') return 'rally'
  const after = sinceLastRally(events, setIndex)
  if (!after) return 'no_point'
  if (after.some(isBmpPart)) return 'bmp_taken'
  const movedOn = dialog ? after.filter(e => !DIALOG_EVENTS.has(e.type)) : after
  return movedOn.length ? 'moved_on' : null
}

// What the set logged after its last completed rally's point (null: no rally
// completed in the set yet)
function sinceLastRally(events, setIndex) {
  const inSet = (events || [])
    .filter(e => e && e.setIndex === setIndex && !NEUTRAL.has(e.type))
    // sub-events (seq 7.1) belong to their parent: they sort after it
    .sort((a, b) => seqOf(a) - seqOf(b))
  for (let i = inSet.length - 1; i >= 0; i--) {
    if (isRallyPoint(inSet[i])) return inSet.slice(i + 1)
  }
  return null
}

const isBmpPart = (e) => BMP_PARTS.has(e?.type) || (e?.type === 'point' && !!e.payload?.fromBMP)

// A point won in a rally. A BMP's own point (a successful team BMP or a
// referee BMP, logged as a `point` sub-event of the request), a penalty point
// and a forfeit's points end no rally: no BMP on them.
function isRallyPoint(e) {
  if (e?.type !== 'point') return false
  const p = e.payload || {}
  return !p.fromBMP && !p.fromPenalty && !p.fromForfait
}
