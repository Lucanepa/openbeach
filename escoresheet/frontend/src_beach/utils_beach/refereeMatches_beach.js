/**
 * The matches the referee page offers: the cloud database first, then the
 * relay's /api/match/list when the cloud has none (or failed). A page a
 * venue relay serves never asks the cloud list: its "cloud" is that relay,
 * which has no /api/db (backendConfig_beach isRelayOriginPage).
 * @param {{ relayOrigin: boolean, listCloud: () => Promise<object>, listRelay: () => Promise<object> }} p
 * @returns {Promise<{ result: { success: boolean, matches?: object[], error?: string }, source: 'supabase'|'websocket' }>}
 */
export async function loadRefereeMatches({ relayOrigin, listCloud, listRelay }) {
  let result = relayOrigin ? { success: false, matches: [] } : await listCloud()
  let source = 'supabase'
  if (!result.success || (result.matches && result.matches.length === 0)) {
    const wsResult = await listRelay()
    if (relayOrigin || (wsResult.success && wsResult.matches && wsResult.matches.length > 0)) {
      result = wsResult
      source = 'websocket'
    }
  }
  return { result, source }
}
