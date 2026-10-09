import Dexie from 'dexie'
import { leftTeamInSet } from './courtSides_beach'
import { labelsInDesignation } from './coinToss_beach'
import { effectiveTeamColour } from './teamColours_beach'

/**
 * The full match state at this moment, read fresh from IndexedDB: what the
 * snapshot-based undo restores, what every event stores as stateSnapshot and
 * what the live state (match_live_state, the referee, the scoreboard display)
 * is built from. Moved out of Scoreboard_beach.jsx so it can be tested.
 *
 * @param {import('dexie').Dexie} db  the beach Dexie database
 * @param {number} matchId            the local (Dexie) match id
 * @param {{ uptoSeq?: number }} [opts] uptoSeq: count only the events up to
 *   this seq (the state right after that event, with the match as it is now)
 * @returns {Promise<object|null>}    null without a match / set, or on error
 */
export async function captureFullStateSnapshot(db, matchId, { uptoSeq = null } = {}) {
  if (!matchId) return null

  try {
    // Query fresh data from IndexedDB to avoid stale closure issues
    const match = await db.matches.get(matchId)
    if (!match) return null

    // Get current set from database
    const allSets = await db.sets.where({ matchId }).toArray()
    const currentSet = allSets.find(s => !s.finished) || allSets[allSets.length - 1]
    if (!currentSet) return null

    // Get all events from database
    const allEvents = (await db.events.where({ matchId }).toArray())
      .filter(e => uptoSeq == null || (e.seq || 0) <= uptoSeq)

    // Get players from database (support both old and new field names)
    // The team records (their colours), unless the snapshot is taken inside a
    // transaction without the teams table: reading them there would throw
    // and lose the whole snapshot (then the match's colours stand in)
    const tx = Dexie.currentTransaction
    const teamsReadable = !!db.teams && (!tx || tx.storeNames.includes('teams'))
    const team1TeamIdSnapshot = match.team1Id || match.team1TeamId
    const team2TeamIdSnapshot = match.team2Id || match.team2TeamId
    const [team1PlayersDb, team2PlayersDb, team1TeamDb, team2TeamDb] = await Promise.all([
      team1TeamIdSnapshot ? db.players.where('teamId').equals(team1TeamIdSnapshot).toArray() : [],
      team2TeamIdSnapshot ? db.players.where('teamId').equals(team2TeamIdSnapshot).toArray() : [],
      teamsReadable && team1TeamIdSnapshot ? db.teams.get(team1TeamIdSnapshot) : null,
      teamsReadable && team2TeamIdSnapshot ? db.teams.get(team2TeamIdSnapshot) : null
    ])

    // Compute current state
    const finishedSets = allSets.filter(s => s.finished)
    const team1SetsWon = finishedSets.filter(s => s.team1Points > s.team2Points).length
    const team2SetsWon = finishedSets.filter(s => s.team2Points > s.team1Points).length

    // A/B Model: Team A = coin toss winner (constant), side_a = which side they're on
    const setIndex = currentSet.index
    const teamAKey = match.coinTossTeamA || 'team1'
    const teamBKey = teamAKey === 'team1' ? 'team2' : 'team1'
    const set3CourtSwitched = match.set3CourtSwitched
    const set3LeftTeam = match.set3LeftTeam

    // Which side Team A is on this set: the scorer's own rule
    // (courtSides_beach: setLeftTeamOverrides holds 'A' / 'B', written by
    // every change of courts, the TTO's too; set 3 starts on its toss's
    // side; no change between sets unless asked)
    const setLeftTeamOverrides = match.setLeftTeamOverrides || {}
    const sideA = leftTeamInSet(setIndex, match) === 'A' ? 'left' : 'right'

    // Team names and colors
    const teamAName = teamAKey === 'team1' ? match.team1Name : match.team2Name
    const teamBName = teamAKey === 'team1' ? match.team2Name : match.team1Name
    const teamAShort = teamAKey === 'team1' ? match.team1ShortName : match.team2ShortName
    const teamBShort = teamAKey === 'team1' ? match.team2ShortName : match.team1ShortName
    // The colours the scorer's court shows (the team's own first, Manual
    // Adjustments edits only the team)
    const team1Colour = effectiveTeamColour('team1', team1TeamDb, match)
    const team2Colour = effectiveTeamColour('team2', team2TeamDb, match)
    const teamAColor = teamAKey === 'team1' ? team1Colour : team2Colour
    const teamBColor = teamAKey === 'team1' ? team2Colour : team1Colour

    // Points and set scores
    const pointsA = teamAKey === 'team1' ? currentSet.team1Points : currentSet.team2Points
    const pointsB = teamAKey === 'team1' ? currentSet.team2Points : currentSet.team1Points
    const setScoreA = teamAKey === 'team1' ? team1SetsWon : team2SetsWon
    const setScoreB = teamAKey === 'team1' ? team2SetsWon : team1SetsWon

    // Current set events
    const currentSetEvents = allEvents.filter(e => e.setIndex === currentSet.index)

    // Timeouts
    const timeouts = currentSetEvents.filter(e => e.type === 'timeout').reduce((acc, e) => {
      const team = e.payload?.team
      if (team) acc[team] = (acc[team] || 0) + 1
      return acc
    }, { team1: 0, team2: 0 })
    const timeoutsA = teamAKey === 'team1' ? timeouts.team1 : timeouts.team2
    const timeoutsB = teamAKey === 'team1' ? timeouts.team2 : timeouts.team1

    // Substitutions with details team1
    const subsDetails = currentSetEvents.filter(e => e.type === 'substitution').reduce((acc, e) => {
      const team = e.payload?.team
      if (team) {
        if (!acc[team]) acc[team] = []
        acc[team].push({
          playerIn: e.payload?.playerIn,
          playerOut: e.payload?.playerOut,
          position: e.payload?.position,
          exceptional: e.payload?.exceptional || false,
          ts: e.ts
        })
      }
      return acc
    }, { team1: [], team2: [] })
    const subsA = teamAKey === 'team1' ? subsDetails.team1 : subsDetails.team2
    const subsB = teamAKey === 'team1' ? subsDetails.team2 : subsDetails.team1

    // Get lineups - check ALL events that have lineup data (lineup, rotation, substitution, etc.)
    const getLineupForTeam = (teamKey) => {
      // Find all events for this team in current set that have lineup data
      const eventsWithLineup = allEvents
        .filter(e => e.payload?.team === teamKey && e.setIndex === currentSet.index &&
          (e.payload?.lineup || e.payload?.newLineup))
        .sort((a, b) => (a.seq || 0) - (b.seq || 0))

      if (eventsWithLineup.length === 0) return null

      // Get the most recent event with lineup data
      const lastEvent = eventsWithLineup[eventsWithLineup.length - 1]
      // Prefer newLineup over lineup
      return lastEvent.payload?.newLineup || lastEvent.payload?.lineup || null
    }



    const getInitialLineupForTeam = (teamKey) => {
      const initialLineup = allEvents.find(e =>
        e.type === 'lineup' &&
        e.payload?.team === teamKey &&
        e.setIndex === currentSet.index &&
        e.payload?.isInitial === true
      )
      return initialLineup?.payload?.lineup || null
    }

    let rawLineupA = getLineupForTeam(teamAKey)
    let rawLineupB = getLineupForTeam(teamBKey)

    // Beach volleyball fallback: build lineup from team players when no lineup events exist
    // First-serving team: positions I (first server) and III (second server)
    // Second-serving team: positions II (first server) and IV (second server)
    const set1FirstServe = match.firstServe || 'team1'
    const buildBasicLineup = (playersDb, teamKey) => {
      if (!playersDb || playersDb.length === 0) return null
      const thisTeamServesFirst = teamKey === set1FirstServe
      const pos1 = thisTeamServesFirst ? 'I' : 'II'
      const pos2 = thisTeamServesFirst ? 'III' : 'IV'
      const firstServeNum = teamKey === 'team1' ? match.team1FirstServe : match.team2FirstServe
      const sorted = [...playersDb].sort((a, b) => (a.number || 0) - (b.number || 0))
      let firstServer, secondServer
      if (firstServeNum) {
        firstServer = sorted.find(p => String(p.number) === String(firstServeNum))
        secondServer = sorted.find(p => String(p.number) !== String(firstServeNum))
      } else {
        firstServer = sorted[0]
        secondServer = sorted[1]
      }
      const lineup = {}
      if (firstServer) lineup[pos1] = firstServer.number
      if (secondServer) lineup[pos2] = secondServer.number
      return Object.keys(lineup).length > 0 ? lineup : null
    }
    const teamAPlayersDb = teamAKey === 'team1' ? team1PlayersDb : team2PlayersDb
    const teamBPlayersDb = teamAKey === 'team1' ? team2PlayersDb : team1PlayersDb
    if (!rawLineupA && teamAPlayersDb?.length > 0) rawLineupA = buildBasicLineup(teamAPlayersDb, teamAKey)
    if (!rawLineupB && teamBPlayersDb?.length > 0) rawLineupB = buildBasicLineup(teamBPlayersDb, teamBKey)

    const initialLineupA = getInitialLineupForTeam(teamAKey)
    const initialLineupB = getInitialLineupForTeam(teamBKey)


    // Captain info
    const getCaptainInfo = (playersDb) => {
      const captain = playersDb.find(p => p.isCaptain || p.captain)
      return captain ? captain.number : null
    }
    const captainA = getCaptainInfo(teamAPlayersDb)
    const captainB = getCaptainInfo(teamBPlayersDb)
    const courtCaptainA = teamAKey === 'team1' ? match.team1CourtCaptain : match.team2CourtCaptain
    const courtCaptainB = teamBKey === 'team1' ? match.team1CourtCaptain : match.team2CourtCaptain

    // Serving team calculation
    const pointEvents = allEvents
      .filter(e => e.type === 'point' && e.setIndex === currentSet.index)
      .sort((a, b) => (b.seq || 0) - (a.seq || 0))

    let currentSetFirstServe
    if (setIndex === 3 && match.set3FirstServe) {
      currentSetFirstServe = match.set3FirstServe === 'A' ? teamAKey : teamBKey
    } else if (setIndex === 3) {
      // Set 3 default: opposite of set 2 first serve
      const set2First = match.set2FirstServe || (set1FirstServe === 'team1' ? 'team2' : 'team1')
      currentSetFirstServe = set2First === 'team1' ? 'team2' : 'team1'
    } else if (setIndex === 2 && match.set2FirstServe) {
      currentSetFirstServe = match.set2FirstServe
    } else if (setIndex === 2) {
      currentSetFirstServe = set1FirstServe === 'team1' ? 'team2' : 'team1'
    } else {
      currentSetFirstServe = set1FirstServe
    }

    const servingTeam = pointEvents.length > 0 ? (pointEvents[0].payload?.team || currentSetFirstServe) : currentSetFirstServe

    // Determine which player on the serving team is currently serving
    // In beach volleyball each team has 2 players. The first server is set at coin toss.
    // Server alternates within a team each time they regain service.
    // Count how many times this team has gained serve (service changes)
    const pointEventsAsc = [...pointEvents].reverse()
    let trackingServe = currentSetFirstServe
    let serviceChangeCount = trackingServe === servingTeam ? 1 : 0
    for (const pe of pointEventsAsc) {
      const scorer = pe.payload?.team
      if (scorer && scorer !== trackingServe) {
        trackingServe = scorer
        if (scorer === servingTeam) serviceChangeCount++
      }
    }
    // Odd = first server, Even = second server
    const isFirstServer = serviceChangeCount % 2 === 1

    // Get the first server number for the serving team (set at coin toss)
    const servingTeamFirstServe = servingTeam === 'team1'
      ? match.team1FirstServe
      : match.team2FirstServe
    // Get the other player on the serving team
    const servingTeamPlayers = servingTeam === 'team1' ? team1PlayersDb : team2PlayersDb
    const otherPlayer = servingTeamPlayers.find(p => String(p.number) !== String(servingTeamFirstServe))
    const secondServerNum = otherPlayer ? Number(otherPlayer.number) : null
    const firstServerNum = servingTeamFirstServe ? Number(servingTeamFirstServe) : null

    const serverNumber = isFirstServer ? firstServerNum : secondServerNum
    console.warn('[Snapshot] serverNumber=' + serverNumber +
      ' servingTeam=' + servingTeam +
      ' isFirstServer=' + isFirstServer +
      ' firstServerNum=' + firstServerNum +
      ' secondServerNum=' + secondServerNum +
      ' serviceChangeCount=' + serviceChangeCount)

    // Sanctions
    const getSanctionsForTeam = (teamKey) => {
      return currentSetEvents
        .filter(e => e.type === 'sanction' && e.payload?.team === teamKey)
        .map(e => ({
          player: e.payload?.playerNumber || null,
          type: e.payload?.type || e.payload?.sanctionType,
          playerType: e.payload?.playerType || null,
          position: e.payload?.position || null,
          role: e.payload?.role || null,
          ts: e.ts
        }))
    }
    const sanctionsA = getSanctionsForTeam(teamAKey)
    const sanctionsB = getSanctionsForTeam(teamBKey)

    // Match-wide sanctions (team, players) - persist across sets
    const getMatchTeamSanctionsForTeam = (teamKey) => {
      return allEvents
        .filter(e => e.type === 'sanction' && e.payload?.team === teamKey)
        .map(e => ({
          player: e.payload?.playerNumber || null,
          type: e.payload?.type || e.payload?.sanctionType,
          playerType: e.payload?.playerType || null,
          position: e.payload?.position || null,
          role: e.payload?.role || null,
          ts: e.ts
        }))
    }
    const matchTeamSanctionsA = getMatchTeamSanctionsForTeam(teamAKey)
    const matchTeamSanctionsB = getMatchTeamSanctionsForTeam(teamBKey)

    // Build rich lineup
    const buildRichLineup = (rawLineup, initialLineup, playersDb, sanctions, isServingTeam, captainNum, courtCaptainNum, serverNum) => {
      if (!rawLineup) return null

      const backRowPositions = ['I', 'V', 'VI']
      const richLineup = {}

      // Check if team captain is on court - if so, don't show court captain badge for anyone
      const captainOnCourt = captainNum && Object.values(rawLineup).some(num => String(num) === String(captainNum))

      for (const position of ['I', 'II', 'III', 'IV', 'V', 'VI']) {
        const playerNum = rawLineup[position]
        if (!playerNum) continue

        const playerNumStr = String(playerNum)
        const player = playersDb.find(p => String(p.number) === playerNumStr)
        const isBackRow = backRowPositions.includes(position)


        const isInInitialLineup = initialLineup && Object.values(initialLineup).some(num => String(num) === playerNumStr)


        const playerSanctions = sanctions.filter(s => String(s.player) === playerNumStr)
        const hasSanction = playerSanctions.length > 0

        const isCaptain = !!(captainNum && String(captainNum) === playerNumStr)
        // Only show court captain badge if team captain is NOT on court
        const isCourtCaptain = !captainOnCourt && !!(courtCaptainNum && String(courtCaptainNum) === playerNumStr)

        const positionData = {
          number: Number(playerNum),
          hasSanction,
          isCaptain,
          isCourtCaptain
        }

        // Beach volleyball: only the actual server is marked as serving (not both players)
        if (isServingTeam && serverNum != null && String(playerNum) === String(serverNum)) {
          positionData.isServing = true
        } else {
          positionData.isServing = false
        }



        if (hasSanction) {
          positionData.sanctions = playerSanctions.map(s => ({ type: s.type, ts: s.ts }))
        }

        richLineup[position] = positionData
      }

      return Object.keys(richLineup).length > 0 ? richLineup : null
    }

    const lineupA = buildRichLineup(rawLineupA, initialLineupA, teamAPlayersDb, sanctionsA, servingTeam === teamAKey, captainA, courtCaptainA, serverNumber)
    const lineupB = buildRichLineup(rawLineupB, initialLineupB, teamBPlayersDb, sanctionsB, servingTeam === teamBKey, captainB, courtCaptainB, serverNumber)

    // BMP challenges used (unsuccessful) per team in current set
    const challengesUsedA = currentSetEvents.filter(e =>
      e.type === 'challenge_outcome' && e.payload?.team === teamAKey && e.payload?.result === 'unsuccessful'
    ).length
    const challengesUsedB = currentSetEvents.filter(e =>
      e.type === 'challenge_outcome' && e.payload?.team === teamBKey && e.payload?.result === 'unsuccessful'
    ).length

    // Check rally status
    const lastRallyStart = currentSetEvents.filter(e => e.type === 'rally_start').sort((a, b) => (b.seq || 0) - (a.seq || 0))[0]
    const lastPoint = pointEvents[0]
    const rallyInProgress = lastRallyStart && (!lastPoint || (lastRallyStart.seq || 0) > (lastPoint.seq || 0))

    // Build set results history
    const setResults = finishedSets.map(s => ({
      index: s.index,
      pointsA: teamAKey === 'team1' ? s.team1Points : s.team2Points,
      pointsB: teamAKey === 'team1' ? s.team2Points : s.team1Points,
      winner: s.team1Points > s.team2Points ? (teamAKey === 'team1' ? 'A' : 'B') : (teamAKey === 'team1' ? 'B' : 'A')
    }))

    return {
      // Match info
      matchId,
      matchStatus: match.status || 'live',
      teamAKey,
      teamAName,
      teamAShort: teamAShort || teamAName?.substring(0, 3).toUpperCase(),
      teamAColor,
      teamBName,
      teamBShort: teamBShort || teamBName?.substring(0, 3).toUpperCase(),
      teamBColor,

      // Current set
      currentSetIndex: setIndex,
      sideA,
      pointsA,
      pointsB,
      setScoreA,
      setScoreB,

      // Lineups (rich format)
      lineupA,
      lineupB,

      // Game flow
      servingTeam,
      serverNumber,
      rallyInProgress: !!rallyInProgress,

      // Counts & history
      timeoutsA,
      timeoutsB,
      subsA,
      subsB,
      sanctionsA,
      sanctionsB,
      matchTeamSanctionsA,
      matchTeamSanctionsB,

      // Set results history
      setResults,

      // BMP challenges used (unsuccessful) per team
      challengesUsedA,
      challengesUsedB,

      // Match flags
      set3CourtSwitched: !!set3CourtSwitched,
      set3LeftTeam: set3LeftTeam || null,
      setLeftTeamOverrides: { ...setLeftTeamOverrides },

      // Match-level sanctions (improper request, delay warning flags)
      matchSanctions: match.sanctions ? { ...match.sanctions } : {},

      // Serve configuration (needed for undo of coin toss / between-sets changes)
      firstServe: match.firstServe || null,
      set2FirstServe: match.set2FirstServe || null,
      set3FirstServe: match.set3FirstServe || null,
      team1FirstServe: match.team1FirstServe || null,
      team2FirstServe: match.team2FirstServe || null,
      set3CoinTossWinner: match.set3CoinTossWinner || null
    }
  } catch (err) {
    console.error('[captureFullStateSnapshot] Error:', err)
    return null
  }
}

/**
 * The snapshot fields the interval's taps change: "Switch sides" (the set's
 * side: set3LeftTeam or setLeftTeamOverrides), "Switch serve" (set2FirstServe /
 * set3FirstServe), the service order boxes (team1FirstServe / team2FirstServe),
 * and what follows from them (the side, the serving team and player, the
 * line-ups with the servers in their order).
 */
export const INTERVAL_CHOICE_FIELDS = Object.freeze([
  'set3LeftTeam', 'setLeftTeamOverrides', 'set2FirstServe', 'set3FirstServe',
  'team1FirstServe', 'team2FirstServe',
  'sideA', 'servingTeam', 'serverNumber', 'lineupA', 'lineupB'
])

/**
 * The INTERVAL_CHOICE_FIELDS of `fresh` (a snapshot taken now) for a snapshot
 * of Team A `teamAKey`: a "Swap team A ↔ B" since that event names the teams
 * the other way round (its A/B labels, the side of A, the line-ups of A and
 * B); the teams, their sides and the serve are the same.
 */
function choicesInDesignation(fresh, teamAKey) {
  const from = fresh.teamAKey
  if (!teamAKey || !from || teamAKey === from) return fresh
  const out = { ...fresh, ...labelsInDesignation({ set3LeftTeam: fresh.set3LeftTeam, set3FirstServe: fresh.set3FirstServe, setLeftTeamOverrides: fresh.setLeftTeamOverrides }, from, teamAKey) }
  out.sideA = fresh.sideA === 'left' ? 'right' : fresh.sideA === 'right' ? 'left' : fresh.sideA
  out.lineupA = fresh.lineupB
  out.lineupB = fresh.lineupA
  return out
}

/**
 * After an interval tap: the snapshots of the events logged in this interval
 * (the set 3 toss, a sanction, ...) get the tap's sides, serve and service
 * order. The taps log no event; an undo restores the snapshot of the event
 * before the one it takes back, and a snapshot from before the tap put the
 * tap back (toss, sanction, "Switch sides", undo the sanction: set 3 back on
 * the toss's sides). Each event keeps its own state otherwise (its sanctions,
 * its flags); only INTERVAL_CHOICE_FIELDS change, recomputed as after that
 * event with the match as it is now.
 *
 * `write(id, snapshot)` stores one refreshed snapshot (the caller writes it
 * without an event-history edit: the scoresheet content is unchanged).
 *
 * @param {import('dexie').Dexie} db
 * @param {number} matchId
 * @param {number} setIndex  the set the interval leads to
 * @param {(id: number, snapshot: object) => Promise<unknown>} write
 * @returns {Promise<number>} how many snapshots were refreshed
 */
export async function refreshIntervalSnapshots(db, matchId, setIndex, write) {
  const events = (await db.events.where({ matchId }).toArray())
    .filter(e => e.setIndex === setIndex && e.stateSnapshot &&
      Number(e.stateSnapshot.currentSetIndex) === Number(setIndex))
  let refreshed = 0
  for (const e of events) {
    const fresh = await captureFullStateSnapshot(db, matchId, { uptoSeq: e.seq || 0 })
    if (!fresh || Number(fresh.currentSetIndex) !== Number(setIndex)) continue
    const next = { ...e.stateSnapshot }
    const choices = choicesInDesignation(fresh, e.stateSnapshot.teamAKey)
    for (const field of INTERVAL_CHOICE_FIELDS) next[field] = choices[field]
    await write(e.id, next)
    refreshed++
  }
  return refreshed
}
