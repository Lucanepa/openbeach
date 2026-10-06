/**
 * connection_pins (matches JSONB column) built from the local Dexie match.
 *
 * The backend never returns connection_pins (it hashes them), so a client
 * read-merge-write always starts from {} and a partial update (one role's PIN)
 * would erase the other roles' PINs on the server, where
 * /api/match/validate-connection-pin (sport 'beach') reads them. The local
 * match is the source of truth for PINs, so every write sends the full object.
 *
 * Beach keys (the backend's CONNECTION_PIN_TYPES.beach): referee,
 * bench_team1 / bench_team2 (older builds wrote team1_data / team2_data),
 * upload_team1 / upload_team2. The local match names the team PINs team1Pin /
 * team2Pin (Dexie v16; some screens still read team1TeamPin).
 *
 * Ported from OpenVolley src/utils/connectionPins.js.
 */
export function buildConnectionPins(localMatch) {
  if (!localMatch) return {}
  const pins = {
    referee: localMatch.refereePin,
    bench_team1: localMatch.team1Pin ?? localMatch.team1TeamPin,
    bench_team2: localMatch.team2Pin ?? localMatch.team2TeamPin,
    upload_team1: localMatch.team1UploadPin ?? localMatch.team1TeamUploadPin,
    upload_team2: localMatch.team2UploadPin ?? localMatch.team2TeamUploadPin
  }
  const out = {}
  for (const [key, value] of Object.entries(pins)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') out[key] = String(value).trim()
  }
  return out
}
