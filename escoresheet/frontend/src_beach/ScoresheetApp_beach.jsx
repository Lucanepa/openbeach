import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { apiStorage } from './lib_beach/apiClient_beach'
import { isBackendAvailable } from './utils_beach/backendConfig_beach'
import { BEACH_SCORESHEET_PREFIX, parseFinalScoresheetName } from './utils_beach/scoresheetUploader_beach'
import { ArrowLeft, ChevronRight, Download, FileText, FileX2, PanelLeft } from 'lucide-react'
import { cn } from './ui/volleyui/cn.js'
import { FOCUS_RING } from './ui/volleyui/Button.jsx'
import { Card } from './ui/volleyui/Card.jsx'
import { Row, RowList } from './ui/volleyui/Row.jsx'
import { Chip, CountBadge } from './ui/volleyui/Chip.jsx'
import { EmptyState } from './ui/volleyui/EmptyState.jsx'
import { GateMessage } from './ui/volleyui/ErrorScreen.jsx'
import { AppSpinner } from './ui/volleyui/AppSpinner.jsx'
import { dayLabel } from './ui/volleyui/format.js'
import { BRAND } from './brand_beach'

// Beach scoresheets live under beach/{date}/ in the shared bucket (indoor
// writes {date}/ at the root)
const inBeachFolder = (path) => `${BEACH_SCORESHEET_PREFIX}/${path}`

// Download a PDF from the backend's scoresheets bucket and return an object
// URL for it (the backend has no signed URLs; every read needs the session of
// the account that uploaded the scoresheet). The caller revokes the URL.
const getPdfObjectUrl = async (path) => {
  if (!isBackendAvailable()) return null
  const { data, error } = await apiStorage
    .from('scoresheets')
    .download(path)
  if (error || !data) {
    console.error('[Scoresheet] PDF download error:', error)
    return null
  }
  const blob = data.type === 'application/pdf' ? data : new Blob([data], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
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
    if (!isBackendAvailable()) {
      console.error('Supabase client not available')
      return []
    }

    // List all date folders under beach/ in the scoresheets bucket
    const { data: folders, error: foldersError } = await apiStorage
      .from('scoresheets')
      .list(BEACH_SCORESHEET_PREFIX, { limit: 100, sortBy: { column: 'name', order: 'desc' } })

    if (foldersError) {
      console.error('[Scoresheet] Error listing folders:', foldersError)
      return []
    }

    const scoresheets = []

    // For each date folder, list the game files
    for (const folder of folders || []) {
      if (!folder.name || folder.name.startsWith('.')) continue

      const { data: files, error: filesError } = await apiStorage
        .from('scoresheets')
        .list(inBeachFolder(folder.name), { limit: 50 })

      if (filesError) {
        console.error(`[Scoresheet] Error listing files in ${folder.name}:`, filesError)
        continue
      }

      // Collect all filenames in this folder to check for PDFs
      const fileNames = new Set((files || []).map(f => f.name))

      for (const file of files || []) {
        // Only show approved/final scoresheets: game{n}_{seed}_final.json
        // (older ones: game{n}_final.json); the PDF has the same name, .pdf
        const parsed = parseFinalScoresheetName(file.name)
        if (!parsed) continue

        scoresheets.push({
          date: folder.name,
          game: parsed.game,
          path: inBeachFolder(`${folder.name}/${file.name}`),
          pdfPath: fileNames.has(parsed.pdfName) ? inBeachFolder(`${folder.name}/${parsed.pdfName}`) : null
        })
      }
    }

    // Fetch metadata for each scoresheet (team names, score, grouping fields)
    const enrichedScoresheets = await Promise.all(
      scoresheets.slice(0, 50).map(async (item) => {
        try {
          const { data, error } = await apiStorage
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

// Label maps for display (sentence case)
const genderLabels = { men: 'Men', women: 'Women' }
const phaseLabels = { main: 'Main draw', main_draw: 'Main draw', qualification: 'Qualification' }
const roundLabels = {
  pool: 'Pool play', pool_play: 'Pool play',
  winner: 'Winner bracket', winner_bracket: 'Winner bracket',
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

// Full-page loading state (kit spinner on the warm stone page)
const PageLoading = ({ label }) => (
  <div className="ov-kit flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-100 via-stone-50 to-stone-100 p-4">
    <AppSpinner label={label} />
  </div>
)

// An <a> styled as an h-11 kit button (toolbar, row tools)
const TOOLBAR_LINK = cn(
  'inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-semibold transition-colors',
  FOCUS_RING
)

// Scoresheet PDF viewer — embeds the PDF from Supabase storage
const ScoresheetViewer = ({ date, game }) => {
  const { t } = useTranslation()
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let objectUrl = null
    let cancelled = false
    const loadPdf = async () => {
      try {
        const url = await getPdfObjectUrl(inBeachFolder(`${date}/game${game}.pdf`))
        if (cancelled) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        if (url) {
          objectUrl = url
          setPdfUrl(url)
        } else {
          setError(`PDF not found: ${inBeachFolder(`${date}/game${game}.pdf`)}`)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load PDF')
      } finally {
        setLoading(false)
      }
    }
    loadPdf()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [date, game])

  if (loading) {
    return <PageLoading label={t('scoresheetApp.loadingScoresheet')} />
  }

  if (error) {
    return (
      <div className="ov-kit">
        <GateMessage
          icon={FileX2}
          title={t('scoresheetApp.scoresheetNotFound')}
          body={error}
          action={{ label: t('scoresheetApp.backToList'), icon: <ArrowLeft className="h-4 w-4" aria-hidden />, onClick: () => { window.location.href = '/' } }}
        />
      </div>
    )
  }

  return (
    <div className="ov-kit flex h-screen flex-col bg-stone-100">
      <div className="flex shrink-0 items-center gap-2 border-b border-stone-200/70 bg-white px-4 py-2">
        <a href="/" className={cn(TOOLBAR_LINK, 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50')}>
          <ArrowLeft size={16} aria-hidden="true" />
          {t('scoresheetApp.backToArchive', 'Back to archive')}
        </a>
        <a href={pdfUrl} download={`game${game}.pdf`} className={cn(TOOLBAR_LINK, 'ml-auto bg-slate-900 text-white hover:bg-slate-800')}>
          <Download size={16} aria-hidden="true" />
          {t('scoresheetApp.downloadPdf', 'Download PDF')}
        </a>
      </div>
      <iframe src={pdfUrl} className="w-full flex-1 border-0 bg-white" title={`Game ${game} scoresheet`} />
    </div>
  )
}

// One archived match: game number and final score chips, team 1 vs team 2, View PDF
const MatchCard = ({ item }) => {
  const { t } = useTranslation()
  const team1 = item.team1 || 'Team A'
  const team2 = item.team2 || 'Team B'
  return (
    <Row
      stripe={false}
      title={
        <div className="min-w-0 text-left">
          <p className="text-sm font-semibold leading-snug break-words text-stone-900 sm:text-[15px]">{team1}</p>
          <p className="text-sm leading-snug break-words text-stone-600 sm:text-[15px]">
            <span className="sr-only">{t('common.vs', 'vs')} </span>{team2}
          </p>
        </div>
      }
      chips={
        <>
          <Chip><span className="tabular-nums">#{item.gameN || item.game}</span></Chip>
          {item.finalScore && <Chip tone="emerald"><span className="tabular-nums">{item.finalScore}</span></Chip>}
        </>
      }
      status={item.pdfPath ? (
        <a
          href={`?date=${item.date}&game=${item.game}`}
          className={cn('inline-flex h-11 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-800', FOCUS_RING)}
        >
          <FileText size={14} aria-hidden="true" />
          {t('scoresheetApp.viewPdf', 'View PDF')}
        </a>
      ) : (
        <span className="text-xs text-stone-500">{t('scoresheetApp.noPdf', 'No PDF')}</span>
      )}
      className="min-h-11"
    />
  )
}

// Collapsible section component — collapsed by default (gender > phase > round)
const Section = ({ label, badge, level, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen)
  const sizes = ['text-base font-bold', 'text-sm font-semibold', 'text-sm font-medium']

  return (
    <div className="mb-2" style={{ marginLeft: level > 0 ? 12 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-stone-200/70 bg-white px-3 py-2 text-left shadow-card transition-colors hover:bg-stone-50',
          FOCUS_RING
        )}
      >
        <ChevronRight
          size={16}
          className={cn('shrink-0 text-stone-400 transition-transform duration-200', open && 'rotate-90')}
          aria-hidden
        />
        <span className={cn('min-w-0 text-stone-900', sizes[level] || sizes[2])}>{label}</span>
        {badge != null && <CountBadge tone="stone">{badge}</CountBadge>}
      </button>
      {open && <div className="mt-1">{children}</div>}
    </div>
  )
}

// Sidebar navigation item: the chosen competition is slate-900
const SidebarItem = ({ label, dateRange, count, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active || undefined}
    className={cn(
      'flex min-h-11 w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors',
      FOCUS_RING,
      active ? 'bg-slate-900 text-white' : 'text-stone-700 hover:bg-stone-100'
    )}
  >
    <span className="flex w-full items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{label}</span>
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
        active ? 'bg-white/15 text-white' : 'bg-stone-100 text-stone-600'
      )}>
        {count}
      </span>
    </span>
    {dateRange && <span className={cn('text-xs tabular-nums', active ? 'text-white/70' : 'text-stone-500')}>{dateRange}</span>}
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
    return <PageLoading label={t('scoresheetApp.loadingScoresheets')} />
  }

  if (error) {
    return (
      <div className="ov-kit">
        <GateMessage icon={FileX2} title={t('scoresheetApp.errorLoadingScoresheets')} body={error} />
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
    <div className="ov-kit flex h-screen overflow-hidden bg-stone-100 text-stone-800">
      {/* Sidebar: beside the list from sm, a drawer over it on phones */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-stone-900/40 sm:hidden"
        />
      )}
      {sidebarOpen && (
        <aside className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col border-r border-stone-200/70 bg-white shadow-xl sm:static sm:z-auto sm:shadow-none">
          {/* Sidebar header */}
          <div className="flex items-center gap-3 border-b border-stone-200/70 px-4 py-3">
            <img src={BRAND.mark} alt="OpenBeach" className="h-8 w-8 shrink-0" draggable={false} />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold text-stone-900">{t('scoresheetApp.scoresheetArchive')}</h1>
              <p className="text-xs tabular-nums text-stone-500">
                {t('scoresheetApp.scoresheetCount', { count: scoresheets.length })}
              </p>
            </div>
          </div>

          {/* Sidebar body — scrollable */}
          <nav className="flex-1 overflow-y-auto p-3">
            {scoresheets.length === 0 ? (
              <p className="px-1 py-4 text-sm text-stone-500">{t('scoresheetApp.noScoresheetsYet')}</p>
            ) : (
              sortedYears.map(year => {
                const comps = Object.entries(tree[year])
                  .sort(([, a], [, b]) => {
                    const aMin = [...a.dates].sort()[0] || ''
                    const bMin = [...b.dates].sort()[0] || ''
                    return bMin.localeCompare(aMin)
                  })

                return (
                  <div key={year} className="mb-4">
                    <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500 tabular-nums">{year}</div>
                    <div className="flex flex-col gap-1">
                      {comps.map(([compName, comp]) => {
                        const sortedDates = [...comp.dates].sort()
                        const dateRange = sortedDates.length === 1
                          ? formatCompDate(sortedDates[0])
                          : `${formatCompDate(sortedDates[0])} – ${formatCompDate(sortedDates[sortedDates.length - 1])}`
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
      )}

      {/* Main content */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* Top bar with sidebar toggle */}
        <div className="flex shrink-0 items-center gap-3 border-b border-stone-200/70 bg-white px-4 py-2">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-pressed={sidebarOpen}
            className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 transition-colors hover:bg-stone-100', FOCUS_RING)}
            aria-label={sidebarOpen ? t('scoresheetApp.hideSidebar', 'Hide sidebar') : t('scoresheetApp.showSidebar', 'Show sidebar')}
            title={sidebarOpen ? t('scoresheetApp.hideSidebar', 'Hide sidebar') : t('scoresheetApp.showSidebar', 'Show sidebar')}
          >
            <PanelLeft size={18} aria-hidden="true" />
          </button>
          {selectedComp && (
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold tracking-tight text-stone-900">{selectedComp.compName}</h2>
              <p className="text-xs tabular-nums text-stone-500">{selectedComp.year}</p>
            </div>
          )}
        </div>

        {/* Match content */}
        <div className="flex-1 overflow-y-auto px-4 py-6">
          {!selectedCompData ? (
            <Card className="mx-auto max-w-md">
              <EmptyState icon={FileText}>{t('scoresheetApp.selectCompetition', 'Select a competition from the sidebar')}</EmptyState>
            </Card>
          ) : (
            <div className="mx-auto max-w-3xl">
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
                                  <Card pad="flush" stack={false} className="mb-2 ml-3 px-2">
                                    <RowList soft>
                                      {sortedMatches.map(item => (
                                        <MatchCard key={item.path} item={item} />
                                      ))}
                                    </RowList>
                                  </Card>
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

// Format date for competition date range (Swiss short form, "06.10.")
const formatCompDate = (dateStr) => dayLabel(dateStr) || dateStr

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
