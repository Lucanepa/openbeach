import { useLiveQuery } from 'dexie-react-hooks'
import ConnectTabletsModal from '../connect/ConnectTabletsModal_beach'
import { db } from '../../db_beach/db_beach'

/**
 * "Connect tablets" from the scorer's header menu (App_beach, Scoreboard_beach).
 *
 * The three-step dialog lives in components_beach/connect (ported from
 * OpenVolley's ConnectTabletsModal): this keeps the props the scorer views
 * pass and reads the match itself, live from IndexedDB, so a referee switched
 * on or a PIN changed elsewhere shows at once (App_beach passes only the id).
 * The dialog reads the referee PIN from the match. It is mounted only while
 * open (no polling of the relay or the desktop app while closed).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {number|null} [props.matchId]  the scorer's Dexie match id
 * @param {object|null} [props.match]    the scorer's match, when the view has it
 * @param {string|null} [props.matchSeedKey]
 * @param {string|null} [props.refereePin]  when the match passed has none
 */
export default function ConnectionSetupModal({ open, onClose, matchId = null, match = null, matchSeedKey = null, refereePin = null }) {
  const stored = useLiveQuery(
    () => (open && matchId != null ? db.matches.get(matchId) : undefined),
    [open, matchId]
  )
  if (!open) return null
  const base = stored || match || null
  const current = base
    ? {
      id: matchId ?? base.id,
      ...base,
      seed_key: base.seed_key || matchSeedKey || undefined,
      refereePin: base.refereePin ?? refereePin ?? null
    }
    : null
  return <ConnectTabletsModal open onClose={onClose} match={current} />
}
