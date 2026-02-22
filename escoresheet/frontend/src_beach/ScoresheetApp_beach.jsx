import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from './lib_beach/supabaseClient_beach'

// Get a signed URL for a file in Supabase storage (valid for 1 hour)
const getSignedUrl = async (path) => {
  if (!supabase) return null
  const { data, error } = await supabase.storage
    .from('scoresheets')
    .createSignedUrl(path, 3600)
  if (error) {
    console.error('[Scoresheet] Signed URL error:', error)
    return null
  }
  return data.signedUrl
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

      // Collect all filenames in this folder to check for PDFs
      const fileNames = new Set((files || []).map(f => f.name))

      for (const file of files || []) {
        // Only show approved/final scoresheets (game123_final.json)
        if (!file.name.endsWith('_final.json')) continue

        // Extract game number from filename (game123_final.json -> 123)
        const gameMatch = file.name.match(/game(\d+)_final\.json/)
        if (!gameMatch) continue

        const gameNum = gameMatch[1]
        const hasPdf = fileNames.has(`game${gameNum}.pdf`)

        scoresheets.push({
          date: folder.name,
          game: gameNum,
          path: `${folder.name}/${file.name}`,
          pdfPath: hasPdf ? `${folder.name}/game${gameNum}.pdf` : null
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

          console.log(`[Scoresheet] ${item.path} → sport_type: "${json.match?.sport_type}"`)

          // Only show beach volleyball scoresheets — sport_type MUST be 'beach'
          if (json.match?.sport_type !== 'beach') {
            console.warn(`[Scoresheet] FILTERED OUT ${item.path} (sport_type="${json.match?.sport_type}")`)
            return null
          }

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
  return { date, game }
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

// Scoresheet PDF viewer — embeds the PDF from Supabase storage
const ScoresheetViewer = ({ date, game }) => {
  const { t } = useTranslation()
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadPdf = async () => {
      try {
        const url = await getSignedUrl(`${date}/game${game}.pdf`)
        if (url) {
          setPdfUrl(url)
        } else {
          setError(`PDF not found: ${date}/game${game}.pdf`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }
    loadPdf()
  }, [date, game])

  if (loading) {
    return (
      <div className="scoresheet-fullscreen-center">
        <div className="scoresheet-loading-text">{t('scoresheetApp.loadingScoresheet')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="scoresheet-fullscreen-center scoresheet-fullscreen-col">
        <div className="scoresheet-error-title">{t('scoresheetApp.scoresheetNotFound')}</div>
        <div className="scoresheet-error-detail">{error}</div>
        <button
          onClick={() => window.location.href = '/'}
          className="scoresheet-btn-back"
        >
          {t('scoresheetApp.backToList')}
        </button>
      </div>
    )
  }

  return (
    <div className="scoresheet-pdf-viewer">
      <div className="scoresheet-pdf-toolbar">
        <a href="/" className="scoresheet-btn-back">Back to archive</a>
        <a href={pdfUrl} download={`game${game}.pdf`} className="scoresheet-btn-view">Download PDF</a>
      </div>
      <iframe src={pdfUrl} className="scoresheet-pdf-frame" title={`Game ${game} scoresheet`} />
    </div>
  )
}

// Match card component
const MatchCard = ({ item }) => (
  <div className="scoresheet-match-card">
    <div className="scoresheet-match-info">
      <div className="scoresheet-match-badges">
        <span className="scoresheet-badge-game">
          #{item.gameN || item.game}
        </span>
        {item.finalScore && (
          <span className="scoresheet-badge-score">
            {item.finalScore}
          </span>
        )}
      </div>
      <div className="scoresheet-match-teams">
        {item.team1 || 'Team A'} vs {item.team2 || 'Team B'}
      </div>
    </div>
    <div className="scoresheet-match-actions">
      {item.pdfPath ? (
        <a
          href={`?date=${item.date}&game=${item.game}`}
          className="scoresheet-btn-view"
        >
          View PDF
        </a>
      ) : (
        <span className="scoresheet-no-pdf">No PDF</span>
      )}
    </div>
  </div>
)

// Collapsible section component — collapsed by default
const Section = ({ label, badge, level, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className={`scoresheet-section scoresheet-section-l${level}`}>
      <button
        onClick={() => setOpen(!open)}
        className={`scoresheet-section-btn scoresheet-section-btn-l${level}`}
      >
        <span className="scoresheet-section-arrow">{open ? '▼' : '▶'}</span>
        <span>{label}</span>
        {badge != null && (
          <span className="scoresheet-section-badge">{badge}</span>
        )}
      </button>
      {open && <div className="scoresheet-section-content">{children}</div>}
    </div>
  )
}

// Sidebar navigation item
const SidebarItem = ({ label, dateRange, count, active, onClick }) => (
  <button
    onClick={onClick}
    className={`scoresheet-sidebar-item ${active ? 'active' : ''}`}
  >
    <div className="scoresheet-sidebar-item-row">
      <span className="scoresheet-sidebar-item-label">{label}</span>
      <span className={`scoresheet-sidebar-item-count ${active ? 'active' : ''}`}>
        {count}
      </span>
    </div>
    {dateRange && <div className="scoresheet-sidebar-item-date">{dateRange}</div>}
  </button>
)

// Scoresheet list component with sidebar layout
const ScoresheetList = () => {
  const { t } = useTranslation()
  const [scoresheets, setScoresheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedComp, setSelectedComp] = useState(null) // { year, compName }
  const [sidebarOpen, setSidebarOpen] = useState(true)

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

  // Auto-select first competition when data loads
  useEffect(() => {
    if (!selectedComp && Object.keys(tree).length > 0) {
      const firstYear = Object.keys(tree).sort((a, b) => b.localeCompare(a))[0]
      const firstComp = Object.keys(tree[firstYear]).sort((a, b) => {
        const aMin = [...tree[firstYear][a].dates].sort()[0] || ''
        const bMin = [...tree[firstYear][b].dates].sort()[0] || ''
        return bMin.localeCompare(aMin)
      })[0]
      if (firstYear && firstComp) setSelectedComp({ year: firstYear, compName: firstComp })
    }
  }, [tree, selectedComp])

  if (loading) {
    return (
      <div className="scoresheet-fullscreen-center">
        <div className="scoresheet-loading-text">{t('scoresheetApp.loadingScoresheets')}</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="scoresheet-fullscreen-center scoresheet-fullscreen-col">
        <div className="scoresheet-error-title">{t('scoresheetApp.errorLoadingScoresheets')}</div>
        <div className="scoresheet-error-detail">{error}</div>
      </div>
    )
  }

  // Sort years descending
  const sortedYears = Object.keys(tree).sort((a, b) => b.localeCompare(a))

  // Get the selected competition data
  const selectedCompData = selectedComp ? tree[selectedComp.year]?.[selectedComp.compName] : null

  // Count matches in a competition
  const countCompMatches = (comp) =>
    Object.values(comp.genders).reduce((gSum, phases) =>
      gSum + Object.values(phases).reduce((pSum, rounds) =>
        pSum + Object.values(rounds).reduce((rSum, matches) => rSum + matches.length, 0)
      , 0)
    , 0)

  return (
    <div className="scoresheet-archive-layout">
      {/* Sidebar */}
      <aside className={`scoresheet-sidebar ${sidebarOpen ? 'open' : ''}`}>
        {/* Sidebar header */}
        <div className="scoresheet-sidebar-header">
          <img src="/openbeach_no_bg.png" alt="openBeach" style={{ width: 32, height: 32 }} />
          <div style={{ minWidth: 0 }}>
            <h1 className="scoresheet-sidebar-title">{t('scoresheetApp.scoresheetArchive')}</h1>
            <p className="scoresheet-sidebar-subtitle">
              {scoresheets.length} scoresheet{scoresheets.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Sidebar body — scrollable */}
        <nav className="scoresheet-sidebar-nav">
          {scoresheets.length === 0 ? (
            <div className="scoresheet-sidebar-empty">{t('scoresheetApp.noScoresheetsYet')}</div>
          ) : (
            sortedYears.map(year => {
              const comps = Object.entries(tree[year])
                .sort(([, a], [, b]) => {
                  const aMin = [...a.dates].sort()[0] || ''
                  const bMin = [...b.dates].sort()[0] || ''
                  return bMin.localeCompare(aMin)
                })

              return (
                <div key={year} className="scoresheet-sidebar-year">
                  <div className="scoresheet-sidebar-year-label">{year}</div>
                  <div className="scoresheet-sidebar-comps">
                    {comps.map(([compName, comp]) => {
                      const sortedDates = [...comp.dates].sort()
                      const dateRange = sortedDates.length === 1
                        ? formatCompDate(sortedDates[0])
                        : `${formatCompDate(sortedDates[0])} — ${formatCompDate(sortedDates[sortedDates.length - 1])}`
                      const isActive = selectedComp?.year === year && selectedComp?.compName === compName

                      return (
                        <SidebarItem
                          key={compName}
                          label={compName}
                          dateRange={dateRange}
                          count={countCompMatches(comp)}
                          active={isActive}
                          onClick={() => setSelectedComp({ year, compName })}
                        />
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main className="scoresheet-main">
        {/* Top bar with sidebar toggle */}
        <div className="scoresheet-topbar">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="scoresheet-topbar-toggle"
            title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="3" y1="5" x2="17" y2="5" />
              <line x1="3" y1="10" x2="17" y2="10" />
              <line x1="3" y1="15" x2="17" y2="15" />
            </svg>
          </button>
          {selectedComp && (
            <div>
              <h2 className="scoresheet-topbar-title">{selectedComp.compName}</h2>
              <p className="scoresheet-topbar-subtitle">{selectedComp.year}</p>
            </div>
          )}
        </div>

        {/* Match content */}
        <div className="scoresheet-content-area">
          {!selectedCompData ? (
            <div className="scoresheet-empty-state">Select a competition from the sidebar</div>
          ) : (
            <div className="scoresheet-matches-container">
              {(() => {
                const genderEntries = Object.entries(selectedCompData.genders)
                  .sort(([a], [b]) => {
                    const order = { men: 0, women: 1, unknown: 2 }
                    return (order[a] ?? 2) - (order[b] ?? 2)
                  })

                return genderEntries.map(([gender, phases]) => {
                  const genderLabel = genderLabels[gender] || gender
                  const phaseEntries = Object.entries(phases)
                    .sort(([a], [b]) => {
                      const order = { main: 0, main_draw: 0, qualification: 1, unknown: 2 }
                      return (order[a] ?? 2) - (order[b] ?? 2)
                    })

                  return (
                    <Section key={gender} label={genderLabel} level={0}>
                      {phaseEntries.map(([phase, rounds]) => {
                        const phaseLabel = phaseLabels[phase] || phase
                        const roundEntries = Object.entries(rounds)
                          .sort(([a], [b]) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99))

                        return (
                          <Section key={phase} label={phaseLabel} level={1}>
                            {roundEntries.map(([round, matches]) => {
                              const roundLabel = roundLabels[round] || round
                              const sortedMatches = [...matches].sort((a, b) => a.gameN - b.gameN)

                              return (
                                <Section key={round} label={roundLabel} badge={matches.length} level={2}>
                                  <div className="scoresheet-match-list">
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
                })
              })()}
            </div>
          )}
        </div>
      </main>
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
  const { date, game } = getUrlParams()

  // If date and game are provided, show the PDF viewer
  if (date && game) {
    return <ScoresheetViewer date={date} game={game} />
  }

  // Otherwise show the list
  return <ScoresheetList />
}
