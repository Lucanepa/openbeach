import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './lib_beach/supabaseClient_beach'
import App from '../scoresheet_pdf_beach/App'

// Fetch scoresheet data from Supabase storage (only _final files)
const fetchFromStorage = async (date, game) => {
  try {
    if (!supabase) {
      console.error('Supabase client not available')
      return null
    }

    const storagePath = `${date}/game${game}_final.json`

    const { data, error } = await supabase.storage
      .from('scoresheets')
      .download(storagePath)

    if (error) {
      console.error('[Scoresheet] Storage fetch error:', error)
      return null
    }

    const text = await data.text()
    return JSON.parse(text)
  } catch (error) {
    console.error('[Scoresheet] Error fetching from storage:', error)
    return null
  }
}

// Extract team name from scoresheet JSON, checking all possible key formats
const extractTeamName = (json, teamNum) => {
  const team = json[`team${teamNum}Team`] || json[`team_${teamNum}Team`] || json[`team${teamNum}`]
  if (team?.name) return team.name
  return json.match?.[`team${teamNum}Name`] || ''
}

// Fetch all scoresheets from storage (beach only)
const fetchAllScoresheets = async () => {
  try {
    if (!supabase) {
      console.error('Supabase client not available')
      return []
    }

    // List all folders (dates) in the scoresheets bucket
    const { data: folders, error: foldersError } = await supabase.storage
      .from('scoresheets')
      .list('', { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    if (foldersError) {
      console.error('[Scoresheet] Error listing folders:', foldersError)
      return []
    }

    const scoresheets = []

    // For each date folder, list the game files
    for (const folder of folders || []) {
      if (!folder.name || folder.name.startsWith('.')) continue

      const { data: files, error: filesError } = await supabase.storage
        .from('scoresheets')
        .list(folder.name, { limit: 50 })

      if (filesError) {
        console.error(`[Scoresheet] Error listing files in ${folder.name}:`, filesError)
        continue
      }

      for (const file of files || []) {
        // Only show approved/final scoresheets (game123_final.json)
        if (!file.name.endsWith('_final.json')) continue

        // Extract game number from filename (game123_final.json -> 123)
        const gameMatch = file.name.match(/game(\d+)_final\.json/)
        if (!gameMatch) continue

        scoresheets.push({
          date: folder.name,
          game: gameMatch[1],
          path: `${folder.name}/${file.name}`
        })
      }
    }

    // Fetch metadata for each scoresheet (team names, score, grouping fields)
    const enrichedScoresheets = await Promise.all(
      scoresheets.slice(0, 50).map(async (item) => {
        try {
          const { data, error } = await supabase.storage
            .from('scoresheets')
            .download(item.path)

          if (error || !data) return null

          const text = await data.text()
          const json = JSON.parse(text)

          // Only show beach volleyball scoresheets
          // If sport_type is set and not beach, skip. If not set, assume beach (this is the beach app).
          if (json.match?.sport_type && json.match.sport_type !== 'beach') return null

          const match = json.match || {}

          return {
            ...item,
            team1: extractTeamName(json, 1),
            team2: extractTeamName(json, 2),
            finalScore: match.final_score || '',
            uploadedAt: json.uploadedAt,
            // Grouping fields
            competition: match.eventName || match.league || '',
            gender: match.matchGender || match.gender || match.match_type_2 || '',
            phase: match.matchPhase || match.phase || '',
            round: match.matchRound || match.round || '',
            scheduledAt: match.scheduledAt || '',
            gameN: parseInt(match.game_n || match.gameNumber || item.game, 10) || 0
          }
        } catch {
          return null
        }
      })
    )

    return enrichedScoresheets.filter(Boolean)
  } catch (error) {
    console.error('[Scoresheet] Error fetching scoresheets:', error)
    return []
  }
}

// Get URL parameters
const getUrlParams = () => {
  const params = new URLSearchParams(window.location.search)
  const date = params.get('date')
  const game = params.get('game')
  const action = params.get('action') || 'preview'
  return { date, game, action }
}

// Label maps for display
const genderLabels = { men: 'Men', women: 'Women' }
const phaseLabels = { main: 'Main Draw', main_draw: 'Main Draw', qualification: 'Qualification' }
const roundLabels = {
  pool: 'Pool Play', pool_play: 'Pool Play',
  winner: 'Winner Bracket', winner_bracket: 'Winner Bracket',
  class: 'Classification', classification: 'Classification',
  semi_final: 'Semifinals', semifinals: 'Semifinals',
  finals: 'Finals'
}

// Round sort order
const roundOrder = { pool: 0, pool_play: 0, winner: 1, winner_bracket: 1, class: 2, classification: 2, semi_final: 3, semifinals: 3, finals: 4 }

// Build the grouped hierarchy: Year -> Competition -> Gender -> Phase -> Round -> Matches
const buildGroupedTree = (scoresheets) => {
  const years = {}

  for (const item of scoresheets) {
    const year = item.date?.slice(0, 4) || 'Unknown'
    const comp = item.competition || 'Unknown Competition'
    const gender = item.gender || 'unknown'
    const phase = item.phase || 'unknown'
    const round = item.round || 'unknown'

    if (!years[year]) years[year] = {}
    if (!years[year][comp]) years[year][comp] = { dates: new Set(), genders: {} }
    years[year][comp].dates.add(item.date)
    if (!years[year][comp].genders[gender]) years[year][comp].genders[gender] = {}
    if (!years[year][comp].genders[gender][phase]) years[year][comp].genders[gender][phase] = {}
    if (!years[year][comp].genders[gender][phase][round]) years[year][comp].genders[gender][phase][round] = []
    years[year][comp].genders[gender][phase][round].push(item)
  }

  return years
}

// Scoresheet viewer component
const ScoresheetViewer = ({ date, game, action }) => {
  const { t } = useTranslation()
  const [matchData, setMatchData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchFromStorage(date, game)
        if (data) {
          setMatchData(data)
        } else {
          setError(`Scoresheet not found: ${date}/game${game}_final.json`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scoresheet')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [date, game])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">{t('scoresheetApp.loadingScoresheet')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-5">
        <div className="text-2xl font-bold text-red-500">{t('scoresheetApp.scoresheetNotFound')}</div>
        <div className="text-gray-600">{error}</div>
        <button
          onClick={() => window.location.href = '/'}
          className="px-5 py-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          {t('scoresheetApp.backToList')}
        </button>
      </div>
    )
  }

  return <App matchData={matchData} autoAction={action} />
}

// Match card component
const MatchCard = ({ item }) => (
  <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded flex-shrink-0">
          #{item.gameN || item.game}
        </span>
        {item.finalScore && (
          <span className="text-sm font-semibold text-emerald-600 flex-shrink-0">
            {item.finalScore}
          </span>
        )}
      </div>
      <div className="text-sm font-medium text-gray-800 truncate">
        {item.team1 || 'Team A'} vs {item.team2 || 'Team B'}
      </div>
    </div>
    <div className="flex gap-2 flex-shrink-0 ml-3">
      <a
        href={`?date=${item.date}&game=${item.game}`}
        className="px-3 py-1.5 text-sm font-medium bg-blue-500 text-white rounded-md hover:bg-blue-600"
      >
        View
      </a>
      <a
        href={`?date=${item.date}&game=${item.game}&action=save`}
        target="_blank"
        rel="noopener noreferrer"
        className="px-3 py-1.5 text-sm font-medium bg-gray-100 text-gray-600 border border-gray-200 rounded-md hover:bg-gray-200"
      >
        PDF
      </a>
    </div>
  </div>
)

// Collapsible section component
const Section = ({ label, badge, level, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen)

  const styles = {
    0: 'text-lg font-bold text-gray-800 border-b-2 border-gray-300 pb-1',
    1: 'text-base font-semibold text-gray-700',
    2: 'text-sm font-semibold text-gray-600',
    3: 'text-sm font-medium text-gray-500',
    4: 'text-xs font-medium text-gray-500 uppercase tracking-wide',
  }

  const paddings = { 0: 'pl-0', 1: 'pl-2', 2: 'pl-4', 3: 'pl-6', 4: 'pl-8' }

  return (
    <div className={`${paddings[level] || 'pl-0'} mb-3`}>
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 w-full text-left py-1 hover:opacity-80 ${styles[level] || styles[4]}`}
      >
        <span className="text-gray-400 text-xs w-4 flex-shrink-0">{open ? '▼' : '▶'}</span>
        <span>{label}</span>
        {badge != null && (
          <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

// Scoresheet list component
const ScoresheetList = () => {
  const { t } = useTranslation()
  const [scoresheets, setScoresheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadList = async () => {
      try {
        const items = await fetchAllScoresheets()
        setScoresheets(items)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scoresheets')
      } finally {
        setLoading(false)
      }
    }
    loadList()
  }, [])

  const tree = useMemo(() => buildGroupedTree(scoresheets), [scoresheets])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-gray-600">{t('scoresheetApp.loadingScoresheets')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-5">
        <div className="text-2xl font-bold text-red-500">{t('scoresheetApp.errorLoadingScoresheets')}</div>
        <div className="text-gray-600">{error}</div>
      </div>
    )
  }

  // Sort years descending
  const sortedYears = Object.keys(tree).sort((a, b) => b.localeCompare(a))

  return (
    <div className="min-h-screen bg-gray-50 p-5">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <img src="/openbeach_no_bg.png" alt="openBeach" className="w-12 h-12" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('scoresheetApp.scoresheetArchive')}</h1>
            <p className="text-gray-500">
              {scoresheets.length} scoresheet{scoresheets.length !== 1 ? 's' : ''} available
            </p>
          </div>
        </div>

        {scoresheets.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <div className="text-5xl mb-4">📋</div>
            <div className="text-lg text-gray-500">{t('scoresheetApp.noScoresheetsYet')}</div>
          </div>
        ) : (
          sortedYears.map(year => {
            // Sort competitions by earliest date within the year
            const comps = Object.entries(tree[year])
              .sort(([, a], [, b]) => {
                const aMin = [...a.dates].sort()[0] || ''
                const bMin = [...b.dates].sort()[0] || ''
                return bMin.localeCompare(aMin) // newest first
              })

            const yearMatchCount = comps.reduce((sum, [, comp]) => {
              return sum + Object.values(comp.genders).reduce((gSum, phases) => {
                return gSum + Object.values(phases).reduce((pSum, rounds) => {
                  return pSum + Object.values(rounds).reduce((rSum, matches) => rSum + matches.length, 0)
                }, 0)
              }, 0)
            }, 0)

            return (
              <Section key={year} label={year} badge={yearMatchCount} level={0}>
                {comps.map(([compName, comp]) => {
                  // Format date range for this competition
                  const sortedDates = [...comp.dates].sort()
                  const dateRange = sortedDates.length === 1
                    ? formatCompDate(sortedDates[0])
                    : `${formatCompDate(sortedDates[0])} — ${formatCompDate(sortedDates[sortedDates.length - 1])}`

                  // Sort genders: men first, then women, then unknown
                  const genderEntries = Object.entries(comp.genders)
                    .sort(([a], [b]) => {
                      const order = { men: 0, women: 1, unknown: 2 }
                      return (order[a] ?? 2) - (order[b] ?? 2)
                    })

                  return (
                    <Section key={compName} label={<>{compName} <span className="font-normal text-xs text-gray-400">{dateRange}</span></>} level={1}>
                      {genderEntries.map(([gender, phases]) => {
                        const genderLabel = genderLabels[gender] || gender
                        // Sort phases: main first, then qualification
                        const phaseEntries = Object.entries(phases)
                          .sort(([a], [b]) => {
                            const order = { main: 0, main_draw: 0, qualification: 1, unknown: 2 }
                            return (order[a] ?? 2) - (order[b] ?? 2)
                          })

                        return (
                          <Section key={gender} label={genderLabel} level={2}>
                            {phaseEntries.map(([phase, rounds]) => {
                              const phaseLabel = phaseLabels[phase] || phase
                              // Sort rounds by round order
                              const roundEntries = Object.entries(rounds)
                                .sort(([a], [b]) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99))

                              return (
                                <Section key={phase} label={phaseLabel} level={3}>
                                  {roundEntries.map(([round, matches]) => {
                                    const roundLabel = roundLabels[round] || round
                                    // Sort matches by game number
                                    const sortedMatches = [...matches].sort((a, b) => a.gameN - b.gameN)

                                    return (
                                      <Section key={round} label={roundLabel} badge={matches.length} level={4}>
                                        <div className="flex flex-col gap-1.5 pl-4">
                                          {sortedMatches.map(item => (
                                            <MatchCard key={item.path} item={item} />
                                          ))}
                                        </div>
                                      </Section>
                                    )
                                  })}
                                </Section>
                              )
                            })}
                          </Section>
                        )
                      })}
                    </Section>
                  )
                })}
              </Section>
            )
          })
        )}
      </div>
    </div>
  )
}

// Format date for competition date range (short format)
const formatCompDate = (dateStr) => {
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Main app component
export default function ScoresheetApp() {
  const { date, game, action } = getUrlParams()

  // If date and game are provided, show the scoresheet viewer
  if (date && game) {
    return <ScoresheetViewer date={date} game={game} action={action} />
  }

  // Otherwise show the list
  return <ScoresheetList />
}
