import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import GameList from '../../components_beach/GameList_beach'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => {
      const translations = {
        'gameList.loadingGames': 'Loading games...',
        'gameList.noGamesAvailable': 'No games available',
        'gameList.upcomingMatches': 'Upcoming Matches',
        'gameList.selectGameToStart': 'Select a game to start',
        'gameList.status': 'Status',
        'gameList.dateTbc': 'Date TBC',
        'gameList.openMatch': 'Open Match',
        'gameList.deleteMatchData': 'Delete Match Data',
        'gameList.loadTestData': 'Load Test Data',
        'common.vs': 'vs',
        'common.tbc': 'TBC',
        'common.noData': 'No data'
      }
      return translations[key] || key
    },
    i18n: { language: 'en' }
  })
}))

const mockMatches = [
  {
    id: 'match-1',
    team1Name: 'Team Alpha',
    team2Name: 'Team Beta',
    league: 'Premier League',
    status: 'scheduled',
    scheduledAt: '2024-06-15T14:00:00Z',
    hall: 'Main Court',
    city: 'Zurich'
  },
  {
    id: 'match-2',
    team1Name: 'Team Gamma',
    team2Name: 'Team Delta',
    league: 'Premier League',
    status: 'live',
    scheduledAt: '2024-06-15T16:00:00Z'
  },
  {
    id: 'match-3',
    team1Name: 'Team Epsilon',
    team2Name: 'Team Zeta',
    league: 'Second Division',
    status: 'scheduled',
    scheduledAt: null
  }
]

describe('GameList_beach', () => {
  describe('loading state', () => {
    it('should show loading message when loading', () => {
      render(<GameList matches={[]} loading={true} onSelectMatch={() => {}} />)
      expect(screen.getByText('Loading games...')).toBeInTheDocument()
    })
  })

  describe('empty state', () => {
    it('should show no games message for empty matches array', () => {
      render(<GameList matches={[]} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('No games available')).toBeInTheDocument()
    })

    it('should show no games message for null matches', () => {
      render(<GameList matches={null} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('No games available')).toBeInTheDocument()
    })
  })

  describe('match rendering', () => {
    it('should render team names', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('Team Alpha')).toBeInTheDocument()
      expect(screen.getByText('Team Beta')).toBeInTheDocument()
      expect(screen.getByText('Team Gamma')).toBeInTheDocument()
    })

    it('should render vs separator', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      const vsList = screen.getAllByText('vs')
      expect(vsList.length).toBe(3)
    })

    it('should render match status', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getAllByText('scheduled').length).toBe(2)
      expect(screen.getByText('live')).toBeInTheDocument()
    })

    it('should render hall and city when available', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText(/Main Court/)).toBeInTheDocument()
      expect(screen.getByText(/Zurich/)).toBeInTheDocument()
    })

    it('should show Date TBC for matches without scheduledAt', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText(/Date TBC/)).toBeInTheDocument()
    })
  })

  describe('league grouping', () => {
    it('should group matches by league', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('Premier League')).toBeInTheDocument()
      expect(screen.getByText('Second Division')).toBeInTheDocument()
    })

    it('should show match count per league', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('2 matches')).toBeInTheDocument()
      expect(screen.getByText('1 match')).toBeInTheDocument()
    })

    it('should render header', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.getByText('Upcoming Matches')).toBeInTheDocument()
      expect(screen.getByText('Select a game to start')).toBeInTheDocument()
    })
  })

  describe('click handlers', () => {
    it('should call onSelectMatch with match id when Open Match is clicked', () => {
      const onSelectMatch = vi.fn()
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={onSelectMatch} />)

      const openButtons = screen.getAllByText('Open Match')
      fireEvent.click(openButtons[0])
      expect(onSelectMatch).toHaveBeenCalledWith('match-1')
    })

    it('should call onDeleteMatchData with match id when Delete is clicked', () => {
      const onDeleteMatchData = vi.fn()
      render(
        <GameList
          matches={mockMatches}
          loading={false}
          onSelectMatch={() => {}}
          onDeleteMatchData={onDeleteMatchData}
        />
      )

      const deleteButtons = screen.getAllByText('Delete Match Data')
      fireEvent.click(deleteButtons[0])
      expect(onDeleteMatchData).toHaveBeenCalledWith('match-1')
    })

    it('should call onLoadTestData with match id when Load Test Data is clicked', () => {
      const onLoadTestData = vi.fn()
      render(
        <GameList
          matches={mockMatches}
          loading={false}
          onSelectMatch={() => {}}
          onLoadTestData={onLoadTestData}
        />
      )

      const loadButtons = screen.getAllByText('Load Test Data')
      fireEvent.click(loadButtons[0])
      expect(onLoadTestData).toHaveBeenCalledWith('match-1')
    })
  })

  describe('optional buttons', () => {
    it('should not render Delete button when onDeleteMatchData is not provided', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.queryByText('Delete Match Data')).not.toBeInTheDocument()
    })

    it('should not render Load Test Data button when onLoadTestData is not provided', () => {
      render(<GameList matches={mockMatches} loading={false} onSelectMatch={() => {}} />)
      expect(screen.queryByText('Load Test Data')).not.toBeInTheDocument()
    })

    it('should render both optional buttons when both handlers provided', () => {
      render(
        <GameList
          matches={mockMatches}
          loading={false}
          onSelectMatch={() => {}}
          onDeleteMatchData={() => {}}
          onLoadTestData={() => {}}
        />
      )
      expect(screen.getAllByText('Delete Match Data').length).toBe(3)
      expect(screen.getAllByText('Load Test Data').length).toBe(3)
    })
  })
})
