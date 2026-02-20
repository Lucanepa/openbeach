import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib_beach/supabaseClient_beach'

// Label maps (same as ScoresheetApp)
const genderLabels = { men: 'Men', women: 'Women' }
const phaseLabels = { main: 'Main Draw', main_draw: 'Main Draw', qualification: 'Qualification' }
const roundLabels = {
  pool: 'Pool Play', pool_play: 'Pool Play',
  winner: 'Winner Bracket', winner_bracket: 'Winner Bracket',
  class: 'Classification', classification: 'Classification',
  semi_final: 'Semifinals', semifinals: 'Semifinals',
  finals: 'Finals'
}
const roundOrder = { pool: 0, pool_play: 0, winner: 1, winner_bracket: 1, class: 2, classification: 2, semi_final: 3, semifinals: 3, finals: 4 }

// Build the grouped hierarchy: Year > Competition > Gender > Phase > Round > Matches
function buildGroupedTree(matches) {
  const years = {}
  for (const item of matches) {
    const year = item.scheduled_at ? new Date(item.scheduled_at).getFullYear().toString() : 'Unknown'
    const comp = item.competition_name || 'Unknown Competition'
    const gender = item.match_info?.gender || 'unknown'
    const phase = item.match_info?.phase || 'unknown'
    const round = item.match_info?.round || 'unknown'

    if (!years[year]) years[year] = {}
    if (!years[year][comp]) years[year][comp] = { dates: new Set(), genders: {} }
    if (item.scheduled_at) years[year][comp].dates.add(item.scheduled_at.slice(0, 10))
    if (!years[year][comp].genders[gender]) years[year][comp].genders[gender] = {}
    if (!years[year][comp].genders[gender][phase]) years[year][comp].genders[gender][phase] = {}
    if (!years[year][comp].genders[gender][phase][round]) years[year][comp].genders[gender][phase][round] = []
    years[year][comp].genders[gender][phase][round].push(item)
  }
  return years
}

function formatCompDate(dateStr) {
  try {
    const date = new Date(dateStr + 'T12:00:00')
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return dateStr
  }
}

// Collapsible section
function Section({ label, badge, level, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)

  const colors = {
    0: '#e5e7eb',
    1: '#d1d5db',
    2: '#9ca3af',
    3: '#6b7280',
    4: '#6b7280'
  }
  const sizes = { 0: 18, 1: 16, 2: 14, 3: 13, 4: 12 }
  const paddings = { 0: 0, 1: 8, 2: 16, 3: 24, 4: 32 }

  return (
    <div style={{ paddingLeft: paddings[level] || 0, marginBottom: level < 2 ? 12 : 6 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left',
          padding: '4px 0',
          background: 'none',
          border: 'none',
          color: colors[level] || '#6b7280',
          fontSize: sizes[level] || 12,
          fontWeight: level < 2 ? 600 : 500,
          cursor: 'pointer'
        }}
      >
        <span style={{ color: '#4b5563', fontSize: 10, width: 12, flexShrink: 0 }}>{open ? '\u25BC' : '\u25B6'}</span>
        <span>{label}</span>
        {badge != null && (
          <span style={{ fontSize: 11, fontWeight: 400, color: '#6b7280', background: '#1f2937', padding: '1px 6px', borderRadius: 10 }}>
            {badge}
          </span>
        )}
      </button>
      {open && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}

// Match card for admin
function MatchCard({ item, onEdit, onDelete }) {
  const team1 = item.team1_data?.name || ''
  const team2 = item.team2_data?.name || ''
  const isClaimed = item.status === 'claimed'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '10px 12px',
      background: '#111827',
      borderRadius: 8,
      border: `1px solid ${isClaimed ? '#374151' : '#1f2937'}`,
      opacity: isClaimed ? 0.6 : 1
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#3b82f6',
            background: 'rgba(59, 130, 246, 0.1)',
            padding: '1px 6px',
            borderRadius: 4,
            flexShrink: 0
          }}>
            #{item.game_n || '?'}
          </span>
          {item.scheduled_at && (
            <span style={{ fontSize: 11, color: '#6b7280' }}>
              {new Date(item.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' '}
              {new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </span>
          )}
          {isClaimed && (
            <span style={{ fontSize: 10, color: '#22c55e', background: 'rgba(34, 197, 94, 0.1)', padding: '1px 6px', borderRadius: 4 }}>
              Claimed
            </span>
          )}
        </div>
        <div style={{ fontSize: 13, fontWeight: 500, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {team1 || 'TBD'} vs {team2 || 'TBD'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 12 }}>
        <button
          onClick={() => onEdit(item)}
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 500, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Edit
        </button>
        <button
          onClick={() => onDelete(item)}
          style={{ padding: '5px 12px', fontSize: 12, fontWeight: 500, background: '#374151', color: '#9ca3af', border: 'none', borderRadius: 6, cursor: 'pointer' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

export default function CompetitionList({ onEdit }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const fetchMatches = async () => {
    try {
      setLoading(true)
      if (!supabase) {
        setError('Supabase not configured')
        return
      }
      const { data, error: err } = await supabase
        .from('beach_competition_matches')
        .select('*')
        .order('scheduled_at', { ascending: true })

      if (err) throw err
      setMatches(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMatches() }, [])

  const tree = useMemo(() => buildGroupedTree(matches), [matches])

  const handleDelete = async (match) => {
    setDeleteConfirm(match)
  }

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    try {
      const { error: err } = await supabase
        .from('beach_competition_matches')
        .delete()
        .eq('id', deleteConfirm.id)
      if (err) throw err
      setMatches(prev => prev.filter(m => m.id !== deleteConfirm.id))
    } catch (err) {
      alert('Delete failed: ' + err.message)
    }
    setDeleteConfirm(null)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
        <span style={{ color: '#9ca3af', fontSize: 16 }}>Loading competition matches...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
        <span style={{ color: '#ef4444', fontSize: 16 }}>Error: {error}</span>
        <button onClick={fetchMatches} style={{ padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Retry</button>
      </div>
    )
  }

  const sortedYears = Object.keys(tree).sort((a, b) => b.localeCompare(a))

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: 0 }}>Competition Matches</h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0 0' }}>
            {matches.length} match{matches.length !== 1 ? 'es' : ''} across {new Set(matches.map(m => m.competition_name)).size} competition{new Set(matches.map(m => m.competition_name)).size !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={fetchMatches} style={{ padding: '6px 14px', background: '#1f2937', color: '#9ca3af', border: '1px solid #374151', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          Refresh
        </button>
      </div>

      {matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, background: '#111827', borderRadius: 12, border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4CB;</div>
          <div style={{ color: '#6b7280', fontSize: 16 }}>No competition matches yet</div>
          <p style={{ color: '#4b5563', fontSize: 13 }}>Upload an Excel file to get started</p>
        </div>
      ) : (
        sortedYears.map(year => {
          const comps = Object.entries(tree[year])
            .sort(([, a], [, b]) => {
              const aMin = [...a.dates].sort()[0] || ''
              const bMin = [...b.dates].sort()[0] || ''
              return bMin.localeCompare(aMin)
            })

          const yearMatchCount = comps.reduce((sum, [, comp]) =>
            sum + Object.values(comp.genders).reduce((gSum, phases) =>
              gSum + Object.values(phases).reduce((pSum, rounds) =>
                pSum + Object.values(rounds).reduce((rSum, ms) => rSum + ms.length, 0), 0), 0), 0)

          return (
            <Section key={year} label={year} badge={yearMatchCount} level={0}>
              {comps.map(([compName, comp]) => {
                const sortedDates = [...comp.dates].sort()
                const dateRange = sortedDates.length === 1
                  ? formatCompDate(sortedDates[0])
                  : `${formatCompDate(sortedDates[0])} \u2014 ${formatCompDate(sortedDates[sortedDates.length - 1])}`

                const genderEntries = Object.entries(comp.genders)
                  .sort(([a], [b]) => {
                    const order = { men: 0, women: 1, unknown: 2 }
                    return (order[a] ?? 2) - (order[b] ?? 2)
                  })

                return (
                  <Section key={compName} label={<>{compName} <span style={{ fontWeight: 400, fontSize: 11, color: '#6b7280' }}>{dateRange}</span></>} level={1}>
                    {genderEntries.map(([gender, phases]) => {
                      const genderLabel = genderLabels[gender] || gender
                      const phaseEntries = Object.entries(phases)
                        .sort(([a], [b]) => {
                          const order = { main: 0, main_draw: 0, qualification: 1, unknown: 2 }
                          return (order[a] ?? 2) - (order[b] ?? 2)
                        })

                      return (
                        <Section key={gender} label={genderLabel} level={2}>
                          {phaseEntries.map(([phase, rounds]) => {
                            const phaseLabel = phaseLabels[phase] || phase
                            const roundEntries = Object.entries(rounds)
                              .sort(([a], [b]) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99))

                            return (
                              <Section key={phase} label={phaseLabel} level={3}>
                                {roundEntries.map(([round, roundMatches]) => {
                                  const roundLabel = roundLabels[round] || round
                                  const sorted = [...roundMatches].sort((a, b) => (a.game_n || 0) - (b.game_n || 0))

                                  return (
                                    <Section key={round} label={roundLabel} badge={roundMatches.length} level={4}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingLeft: 16 }}>
                                        {sorted.map(item => (
                                          <MatchCard key={item.id} item={item} onEdit={onEdit} onDelete={handleDelete} />
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setDeleteConfirm(null)}>
          <div style={{ width: 'min(90vw, 380px)', background: '#111827', border: '2px solid #ef4444', borderRadius: 12, padding: 20 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px 0', color: '#fff', fontSize: 16 }}>Delete Match #{deleteConfirm.game_n}?</h3>
            <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 20 }}>
              {deleteConfirm.team1_data?.name || 'TBD'} vs {deleteConfirm.team2_data?.name || 'TBD'}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: '10px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>Cancel</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
