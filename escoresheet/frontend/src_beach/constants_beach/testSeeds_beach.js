export const TEST_TEAM_SEED_DATA = [
  {
    seedKey: 'test-team-alpha',
    color: '#89bdc3',
    country: 'SUI',
    players: [
      { number: "", firstName: 'Lucas', lastName: 'Keller', isCaptain: false },
      { number: "", firstName: 'Jonas', lastName: 'Hofmann', isCaptain: false },
    ]
  },
  {
    seedKey: 'test-team-bravo',
    color: '#323134',
    country: 'GER',
    players: [
      { number: "", firstName: 'Thomas', lastName: 'Weber', isCaptain: false },
      { number: "", firstName: 'Maximilian', lastName: 'Schneider', isCaptain: false },
    

    ]
  }
]

export const TEST_REFEREE_SEED_DATA = [
  {
    seedKey: 'test-referee-alpha',
    firstName: 'Amadeus',
    lastName: 'Mozart',
    country: 'AUT'
  },
  {
    seedKey: 'test-referee-bravo',
    firstName: 'Donald',
    lastName: 'Trump',
    country: 'USA'
  }
]

export const TEST_SCORER_SEED_DATA = [
  {
    seedKey: 'test-scorer-alpha',
    firstName: 'Napoleon',
    lastName: 'Bonaparte',
    country: 'FRA'
  },
  {
    seedKey: 'test-scorer-bravo',
    firstName: 'Leonardo',
    lastName: 'Da Vinci',
    country: 'ITA'
  }
]

export const TEST_LINE_JUDGE_SEED_DATA = [
  {
    seedKey: 'test-line-judge-alpha',
    firstName: 'Johannes',
    lastName: 'Kepler',
    country: 'GER'
  },
  {
    seedKey: 'test-line-judge-bravo',
    firstName: 'Isaac',
    lastName: 'Newton',
    country: 'ENG'
  }
]

/**
 * Format an ISO date string to display format (DD/MM/YYYY)
 * Used for test data generation
 */
export function formatISODateToDisplay(dateString) {
  if (!dateString) return null
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return dateString
  }
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

