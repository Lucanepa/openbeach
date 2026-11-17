/**
 * The desktop app's own route to the Live screen (utils_beach/liveScreen_beach.js).
 *
 * Ported from OpenVolley escoresheet/frontend/src/utils/globalLivePush.js.
 * The browser and the Android app score over the cloud relay, which feeds
 * the page itself; a venue relay (OpenVolley's Node server.js) forwards its
 * courts to the cloud. The desktop app's relay (the Tauri beach flavour,
 * src-tauri relay.rs) does neither, so the desktop scorer sends its court
 * summary to the cloud over HTTPS: POST /api/global/live/<code>, at most one
 * request per match every PUSH_MS (the newest state wins), never offline,
 * failures ignored.
 *
 * openbeach's names are mapped to the server's here (team1 = home,
 * team2 = away), as relayPublisher_beach does for the relay sync.
 */
import { getCloudApiUrl } from './backendConfig_beach'
import { detectAppPlatform } from './openAppWindow_beach'
import { courtTokenFor } from './liveScreen_beach'

export const PUSH_MS = 2000
const SUMMARY_FIELDS = ['team_a_name', 'team_a_short', 'team_a_color', 'team_b_name', 'team_b_short', 'team_b_color', 'sets_won_a', 'sets_won_b', 'points_a', 'points_b', 'current_set', 'best_of', 'side_a', 'serving_team', 'match_status', 'timeout_active', 'set_interval_active']

/** Only the desktop app pushes (the others reach the page through a relay). */
export const pushesLiveScreen = (win = typeof window !== 'undefined' ? window : undefined) => detectAppPlatform(win) === 'tauri'

const slots = new Map() // matchId -> { timer, latest }

export function pickSummary(liveState) {
  const out = {}
  for (const k of SUMMARY_FIELDS) if (liveState && k in liveState) out[k] = liveState[k]
  return out
}

// openbeach's coin toss names team A 'team1' / 'team2'; the server reads 'home' / 'away'
const coinTossSide = (v) => (v === 'team1' ? 'home' : v === 'team2' ? 'away' : null)

/** The request body: the summary fields only, never players, PINs or line-ups. */
export async function liveScreenBody({ match, liveState, db, matchId }) {
  const court = await courtTokenFor(match)
  if (!court) return null
  const team1Id = match.team1Id || match.team1TeamId
  const team2Id = match.team2Id || match.team2TeamId
  const [team1, team2, sets] = await Promise.all([
    team1Id ? db.teams.get(team1Id) : null,
    team2Id ? db.teams.get(team2Id) : null,
    db.sets.where('matchId').equals(matchId).toArray()
  ])
  return {
    court,
    liveState: pickSummary(liveState),
    match: {
      coinTossTeamA: coinTossSide(match.coinTossTeamA),
      hall: match.hall ?? null,
      court: match.court ?? null,
      scheduledAt: match.scheduledAt ?? null,
      gameN: match.gameN ?? match.game_n ?? null
    },
    homeTeam: { name: team1?.name ?? match.team1Name ?? null },
    awayTeam: { name: team2?.name ?? match.team2Name ?? null },
    sets: (sets || [])
      .filter((x) => x?.finished === true)
      .sort((a, b) => a.index - b.index)
      .slice(0, 5)
      .map((x) => ({ index: x.index, homePoints: x.team1Points ?? 0, awayPoints: x.team2Points ?? 0, finished: true }))
  }
}

async function send({ code, match, liveState, db, matchId, fetchImpl }) {
  const url = getCloudApiUrl(`/api/global/live/${code}`)
  if (!url) return
  const body = await liveScreenBody({ match, liveState, db, matchId })
  if (!body) return
  await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit' })
}

/** Queue the match's newest live state for the cloud page (throttled per match). */
export function pushLiveScreen({ code, match, liveState, db, matchId, fetchImpl = (...a) => fetch(...a), online = () => typeof navigator === 'undefined' || navigator.onLine !== false }) {
  if (!code || !match || !liveState || !online()) return
  const slot = slots.get(matchId)
  if (slot) { slot.latest = { code, match, liveState }; return }
  const fresh = { latest: null, timer: null }
  slots.set(matchId, fresh)
  send({ code, match, liveState, db, matchId, fetchImpl }).catch(() => { /* offline or refused: the page waits */ })
  fresh.timer = setTimeout(() => {
    slots.delete(matchId)
    if (fresh.latest) pushLiveScreen({ ...fresh.latest, db, matchId, fetchImpl, online })
  }, PUSH_MS)
}

/** Tests only. */
export function resetLiveScreenPush() {
  for (const s of slots.values()) clearTimeout(s.timer)
  slots.clear()
}
