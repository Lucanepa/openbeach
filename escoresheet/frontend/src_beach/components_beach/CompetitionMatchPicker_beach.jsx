import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib_beach/supabaseClient_beach'

// Label maps (same as ScoresheetApp/CompetitionList)
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

function buildGroupedTree(matches) {
  const comps = {}
  for (const item of matches) {
    const comp = item.competition_name || 'Unknown Competition'
    const gender = item.match_info?.gender || 'unknown'
    const phase = item.match_info?.phase || 'unknown'
    const round = item.match_info?.round || 'unknown'

    if (!comps[comp]) comps[comp] = { dates: new Set(), genders: {} }
    if (item.scheduled_at) comps[comp].dates.add(item.scheduled_at.slice(0, 10))
    if (!comps[comp].genders[gender]) comps[comp].genders[gender] = {}
    if (!comps[comp].genders[gender][phase]) comps[comp].genders[gender][phase] = {}
    if (!comps[comp].genders[gender][phase][round]) comps[comp].genders[gender][phase][round] = []
    comps[comp].genders[gender][phase][round].push(item)
  }
  return comps
}

function Section({ label, badge, level, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  const sizes = { 0: 15, 1: 14, 2: 13, 3: 12 }
  const paddings = { 0: 0, 1: 8, 2: 16, 3: 24 }

  return (
    <div style={{ paddingLeft: paddings[level] || 0, marginBottom: level < 2 ? 8 : 4 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '3px 0', background: 'none', border: 'none', color: '#d1d5db', fontSize: sizes[level] || 12, fontWeight: level < 2 ? 600 : 500, cursor: 'pointer' }}
      >
        <span style={{ color: '#4b5563', fontSize: 10, width: 12, flexShrink: 0 }}>{open ? '\u25BC' : '\u25B6'}</span>
        <span>{label}</span>
        {badge != null && <span style={{ fontSize: 10, color: '#6b7280', background: '#1f2937', padding: '1px 5px', borderRadius: 8 }}>{badge}</span>}
      </button>
      {open && <div style={{ marginTop: 2 }}>{children}</div>}
    </div>
  )
}

export default function CompetitionMatchPicker({ open, onClose, onSelect }) {
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selecting, setSelecting] = useState(null) // match id being loaded

  useEffect(() => {
    if (!open) return
    async function fetch() {
      try {
        setLoading(true)
        setError(null)
        if (!supabase) {
          setError('Supabase not configured')
          return
        }
        const { data, error: err } = await supabase
          .from('beach_competition_matches')
          .select('*')
          .eq('status', 'template')
          .order('scheduled_at', { ascending: true })
        if (err) throw err
        setMatches(data || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [open])

  const tree = useMemo(() => buildGroupedTree(matches), [matches])

  const handleSelect = async (match) => {
    setSelecting(match.id)
    try {
      await onSelect(match)
    } catch {
      setSelecting(null)
    }
  }

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
      <div style={{ width: 'min(95vw, 600px)', maxHeight: '85vh', background: '#111827', border: '2px solid #7c3aed', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'rgba(124, 58, 237, 0.1)', borderBottom: '1px solid rgba(124, 58, 237, 0.3)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: 18, fontWeight: 600 }}>Load Competition Match</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1 }}>x</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>Loading available matches...</div>
          ) : error ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <p style={{ color: '#ef4444', marginBottom: 8 }}>Error: {error}</p>
            </div>
          ) : matches.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>&#x1F4CB;</div>
              <p style={{ color: '#6b7280' }}>No competition matches available</p>
              <p style={{ color: '#4b5563', fontSize: 13 }}>Ask your competition admin to upload matches</p>
            </div>
          ) : (
            Object.entries(tree)
              .sort(([, a], [, b]) => {
                const aMin = [...a.dates].sort()[0] || ''
                const bMin = [...b.dates].sort()[0] || ''
                return bMin.localeCompare(aMin)
              })
              .map(([compName, comp]) => {
                const genderEntries = Object.entries(comp.genders)
                  .sort(([a], [b]) => {
                    const order = { men: 0, women: 1, unknown: 2 }
                    return (order[a] ?? 2) - (order[b] ?? 2)
                  })

                return (
                  <Section key={compName} label={compName} level={0}>
                    {genderEntries.map(([gender, phases]) => {
                      const genderLabel = genderLabels[gender] || gender
                      const phaseEntries = Object.entries(phases)
                        .sort(([a], [b]) => {
                          const order = { main: 0, main_draw: 0, qualification: 1, unknown: 2 }
                          return (order[a] ?? 2) - (order[b] ?? 2)
                        })

                      return (
                        <Section key={gender} label={genderLabel} level={1}>
                          {phaseEntries.map(([phase, rounds]) => {
                            const phaseLabel = phaseLabels[phase] || phase
                            const roundEntries = Object.entries(rounds)
                              .sort(([a], [b]) => (roundOrder[a] ?? 99) - (roundOrder[b] ?? 99))

                            return (
                              <Section key={phase} label={phaseLabel} level={2}>
                                {roundEntries.map(([round, roundMatches]) => {
                                  const roundLabel = roundLabels[round] || round
                                  const sorted = [...roundMatches].sort((a, b) => (a.game_n || 0) - (b.game_n || 0))

                                  return (
                                    <Section key={round} label={roundLabel} badge={roundMatches.length} level={3}>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 12 }}>
                                        {sorted.map(item => {
                                          const t1 = item.team1_data?.name || ''
                                          const t2 = item.team2_data?.name || ''
                                          const isSelecting = selecting === item.id

                                          return (
                                            <button
                                              key={item.id}
                                              onClick={() => handleSelect(item)}
                                              disabled={isSelecting}
                                              style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 10px',
                                                background: isSelecting ? 'rgba(124, 58, 237, 0.2)' : '#0b1220',
                                                borderRadius: 6,
                                                border: '1px solid #1f2937',
                                                cursor: isSelecting ? 'wait' : 'pointer',
                                                width: '100%',
                                                textAlign: 'left'
                                              }}
                                            >
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                  <span style={{ fontSize: 10, fontWeight: 600, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.1)', padding: '1px 5px', borderRadius: 3 }}>
                                                    #{item.game_n || '?'}
                                                  </span>
                                                  {item.scheduled_at && (
                                                    <span style={{ fontSize: 10, color: '#6b7280' }}>
                                                      {new Date(item.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                      {' '}
                                                      {new Date(item.scheduled_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                                                    </span>
                                                  )}
                                                </div>
                                                <div style={{ fontSize: 12, fontWeight: 500, color: '#e5e7eb', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                  {t1 || 'TBD'} vs {t2 || 'TBD'}
                                                </div>
                                              </div>
                                              <span style={{ fontSize: 11, color: isSelecting ? '#7c3aed' : '#6b7280', fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>
                                                {isSelecting ? 'Loading...' : 'Load'}
                                              </span>
                                            </button>
                                          )
                                        })}
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
              })
          )}
        </div>
      </div>
    </div>
  )
}
