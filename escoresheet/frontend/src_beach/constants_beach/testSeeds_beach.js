// Test Match Constants (Beach Volleyball)
export const TEST_MATCH_SEED_KEY = 'test-match-default'

/**
 * A test match's own seed key, which is also its relay room:
 * `test-match-default-<random>` (as OpenVolley's constants/testSeeds.js).
 * Test matches publish to the venue relay without a game PIN, so two courts
 * rehearsing on one relay must not share a room: both sockets were granted
 * it, each sync replaced the other's match, the referee and the LedBox jumped
 * between courts, and the scorer's delete-match of the old key (switching to
 * the official match) dropped the other court's room.
 */
export function newTestMatchSeedKey() {
  let suffix = ''
  try {
    const bytes = new Uint8Array(6)
    globalThis.crypto.getRandomValues(bytes)
    suffix = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    suffix = Math.random().toString(16).slice(2, 14).padEnd(12, '0')
  }
  return `${TEST_MATCH_SEED_KEY}-${suffix}`
}

/** The seed key of a test match: the shared legacy one or a per-device one. */
export function isTestMatchSeedKey(key) {
  return typeof key === 'string' && (key === TEST_MATCH_SEED_KEY || key.startsWith(`${TEST_MATCH_SEED_KEY}-`))
}

/**
 * The seed key a device's test match keeps: its own per-device key (the
 * LedBox keeps following the same room when the test match is restarted), or
 * a new one in place of the shared legacy key or none.
 */
export function testMatchSeedKeyFor(existing) {
  return isTestMatchSeedKey(existing) && existing !== TEST_MATCH_SEED_KEY ? existing : newTestMatchSeedKey()
}
export const TEST_MATCH_EXTERNAL_ID = 'test-match-default'
export const TEST_TEAM_1_EXTERNAL_ID = 'test-team-1'
export const TEST_TEAM_2_EXTERNAL_ID = 'test-team-2'

export const TEST_MATCH_DEFAULTS = {
  hall: 'Beach Court 1',
  city: 'Zürich',
  league: 'Beach Tour A1 - Zürich',
  matchNumber: '1',
  gameNumber: '1',
  court: '1',
  gender: 'women',
  phase: 'main',
  round: 'pool',

}

export function getNextTestMatchStartTime() {
  const now = new Date()
  const kickoff = new Date(now)
  kickoff.setHours(12, 0, 0, 0)
  if (kickoff <= now) {
    kickoff.setDate(kickoff.getDate() + 1)
  }
  return kickoff.toISOString()
}

// Test Team Seed Data - Beach Volleyball (2 players per team)
export const TEST_TEAM_SEED_DATA = [
  {
    seedKey: 'test-team-1',
    name: 'Müller/Weber (CHE)',
    shortName: 'CHE',
    color: '#3b82f6',
    country: 'CHE',
    players: [
      { number: 1, firstName: 'Anna', lastName: 'Müller', dob: '05/01/1998', isCaptain: true },
      { number: 2, firstName: 'Sara', lastName: 'Weber', dob: '12/03/1997', isCaptain: false },
    ]
  },
  {
    seedKey: 'test-team-2',
    name: 'Schmidt/Fischer (DEU)',
    shortName: 'DEU',
    color: '#a855f7',
    country: 'DEU',
    players: [
      { number: 1, firstName: 'Julia', lastName: 'Schmidt', dob: '11/01/1998', isCaptain: true },
      { number: 2, firstName: 'Nina', lastName: 'Fischer', dob: '24/03/1996', isCaptain: false },
    ]
  }
]

// Helper to get team data by external ID
export function getTestTeamByExternalId(externalId) {
  return TEST_TEAM_SEED_DATA.find(t => t.seedKey === externalId)
}

// Get team 1 short name
export function getTestTeam1ShortName() {
  const team = getTestTeamByExternalId(TEST_TEAM_1_EXTERNAL_ID)
  return team?.shortName || 'TEAM1'
}

// Get team 2 short name
export function getTestTeam2ShortName() {
  const team = getTestTeamByExternalId(TEST_TEAM_2_EXTERNAL_ID)
  return team?.shortName || 'TEAM2'
}

export const TEST_REFEREE_SEED_DATA = [
  {
    seedKey: 'test-referee-alpha',
    firstName: 'Claudia',
    lastName: 'Moser',
    country: 'CHE',
    dob: '1982-04-19'
  },
  {
    seedKey: 'test-referee-bravo',
    firstName: 'Martin',
    lastName: 'Kunz',
    country: 'CHE',
    dob: '1979-09-02'
  }
]

export const TEST_SCORER_SEED_DATA = [
  {
    seedKey: 'test-scorer-alpha',
    firstName: 'Petra',
    lastName: 'Schneider',
    country: 'CHE',
    dob: '1990-01-15'
  },
  {
    seedKey: 'test-scorer-bravo',
    firstName: 'Lukas',
    lastName: 'Baumann',
    country: 'CHE',
    dob: '1988-06-27'
  }
]
