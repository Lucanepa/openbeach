// Test Match Constants (Beach Volleyball)
export const TEST_MATCH_SEED_KEY = 'test-match-default'
export const TEST_MATCH_EXTERNAL_ID = 'test-match-default'
export const TEST_TEAM_1_EXTERNAL_ID = 'test-team-alpha'
export const TEST_TEAM_2_EXTERNAL_ID = 'test-team-bravo'

export const TEST_MATCH_DEFAULTS = {
  hall: 'Beach Court 1',
  city: 'Zürich',
  league: 'Beach',
  gameNumber: '123456'
}

export function getNextTestMatchStartTime() {
  const now = new Date()
  const kickoff = new Date(now)
  kickoff.setHours(20, 0, 0, 0)
  if (kickoff <= now) {
    kickoff.setDate(kickoff.getDate() + 1)
  }
  return kickoff.toISOString()
}

// Test Team Seed Data - Beach Volleyball (2 players per team)
export const TEST_TEAM_SEED_DATA = [
  {
    seedKey: 'test-team-1',
    name: 'Team 1',
    shortName: 'TEAM1',
    color: '#3b82f6',
    players: [
      { number: 1, firstName: 'Anna', lastName: 'Müller', dob: '05/01/1998', isCaptain: true },
      { number: 2, firstName: 'Sara', lastName: 'Weber', dob: '12/03/1997', isCaptain: false },
    ]
  },
  {
    seedKey: 'test-team-2',
    name: 'Team 2',
    shortName: 'TEAM2',
    color: '#ef4444',
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
