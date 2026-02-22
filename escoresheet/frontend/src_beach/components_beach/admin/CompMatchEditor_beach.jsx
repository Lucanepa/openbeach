import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib_beach/supabaseClient_beach'
import { useScaledLayout } from '../../hooks_beach/useScaledLayout_beach'
import CountrySelect from '../CountrySelect_beach'

const emptyPlayer = { number: '', first_name: '', last_name: '', is_captain: false }
const DEFAULT_COUNTRY = 'CHE'
const emptyOfficial = { firstName: '', lastName: '', country: DEFAULT_COUNTRY }

function Field({ label, value, onChange, type = 'text', placeholder = '', s, style = {} }) {
  return (
    <div style={style}>
      <label style={{ display: 'block', fontSize: s(11), color: '#9ca3af', marginBottom: s(3), fontWeight: 500 }}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: `${s(7)}px ${s(10)}px`,
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: s(6),
          color: '#e5e7eb',
          fontSize: s(13),
          outline: 'none',
          boxSizing: 'border-box'
        }}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, s }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: s(11), color: '#9ca3af', marginBottom: s(3), fontWeight: 500 }}>{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: `${s(7)}px ${s(10)}px`,
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: s(6),
          color: '#e5e7eb',
          fontSize: s(13),
          outline: 'none',
          boxSizing: 'border-box',
          cursor: 'pointer'
        }}
      >
        <option value="">--</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function CountryField({ label, value, onChange, s }) {
  const triggerStyle = {
    padding: `${s(7)}px ${s(10)}px`,
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: s(6),
    minHeight: 'unset'
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: s(11), color: '#9ca3af', marginBottom: s(3), fontWeight: 500 }}>{label}</label>
      <CountrySelect value={value} onChange={onChange} placeholder="--" fontSize={`${s(13)}px`} triggerStyle={triggerStyle} />
    </div>
  )
}

function PlayerRow({ label, player, onChange, s }) {
  const update = (field, val) => onChange({ ...player, [field]: val })
  const inp = {
    width: '100%',
    padding: `${s(7)}px ${s(10)}px`,
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: s(6),
    color: '#e5e7eb',
    fontSize: s(13),
    outline: 'none',
    boxSizing: 'border-box'
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: s(11), color: '#9ca3af', marginBottom: s(4), fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: `${s(44)}px 1fr 1fr`, gap: s(6) }}>
        <input type="number" value={player.number || ''} onChange={e => update('number', e.target.value)} placeholder="#" style={inp} />
        <input value={player.first_name || ''} onChange={e => update('first_name', e.target.value)} placeholder="First name" style={inp} />
        <input value={player.last_name || ''} onChange={e => update('last_name', e.target.value)} placeholder="Last name" style={inp} />
      </div>
    </div>
  )
}

function OfficialRow({ label, official, onChange, s }) {
  const update = (field, val) => onChange({ ...official, [field]: val })
  const inp = {
    width: '100%',
    padding: `${s(7)}px ${s(10)}px`,
    background: '#1f2937',
    border: '1px solid #374151',
    borderRadius: s(6),
    color: '#e5e7eb',
    fontSize: s(13),
    outline: 'none',
    boxSizing: 'border-box'
  }
  return (
    <div>
      <label style={{ display: 'block', fontSize: s(11), color: '#9ca3af', marginBottom: s(4), fontWeight: 500 }}>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: s(6), alignItems: 'end' }}>
        <input value={official.firstName || ''} onChange={e => update('firstName', e.target.value)} placeholder="First name" style={inp} />
        <input value={official.lastName || ''} onChange={e => update('lastName', e.target.value)} placeholder="Last name" style={inp} />
        <CountrySelect value={official.country || ''} onChange={val => update('country', val)} placeholder="--" fontSize={`${s(13)}px`} triggerStyle={{
          padding: `${s(7)}px ${s(10)}px`,
          background: '#1f2937',
          border: '1px solid #374151',
          borderRadius: s(6),
          minHeight: 'unset'
        }} />
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, s }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: s(40),
        height: s(22),
        borderRadius: s(11),
        border: 'none',
        background: checked ? '#22c55e' : '#374151',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0
      }}
    >
      <div style={{
        width: s(16),
        height: s(16),
        borderRadius: '50%',
        background: '#fff',
        position: 'absolute',
        top: s(3),
        left: checked ? s(21) : s(3),
        transition: 'left 0.2s'
      }} />
    </button>
  )
}

// Infer team name from player last names: "LastA/LastB"
function inferTeamName(p1, p2) {
  const parts = [p1?.last_name, p2?.last_name].filter(Boolean)
  return parts.length > 0 ? parts.join('/') : ''
}

function TeamSection({ title, name, setName, country, setCountry, p1, setP1, p2, setP2, s }) {
  const inferredName = useMemo(() => inferTeamName(p1, p2), [p1, p2])

  return (
    <div style={{
      background: '#111827',
      borderRadius: s(10),
      border: '1px solid #1f2937',
      padding: s(14),
      flex: 1,
      minWidth: 0
    }}>
      <h3 style={{
        fontSize: s(13),
        fontWeight: 600,
        color: '#e5e7eb',
        margin: `0 0 ${s(10)}px 0`,
        paddingBottom: s(6),
        borderBottom: '1px solid #1f2937'
      }}>{title}</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: s(6) }}>
        <PlayerRow label="Player 1" player={p1} onChange={setP1} s={s} />
        <PlayerRow label="Player 2" player={p2} onChange={setP2} s={s} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: s(8), marginTop: s(10) }}>
        <Field label="Team Name" value={name || inferredName} onChange={setName} placeholder={inferredName || 'Team Name'} s={s} />
        <CountryField label="Country" value={country} onChange={setCountry} s={s} />
      </div>
    </div>
  )
}

export default function CompMatchEditor({ match, onClose, userId }) {
  const isNew = !match?.id
  const { scaleFactor: baseScaleFactor } = useScaledLayout()
  const scaleFactor = baseScaleFactor * 1.25
  const s = (px) => Math.round(px * scaleFactor)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Match info
  const [competitionName, setCompetitionName] = useState('')
  const [gameN, setGameN] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [site, setSite] = useState('')
  const [beach, setBeach] = useState('')
  const [court, setCourt] = useState('')
  const [gender, setGender] = useState('')
  const [phase, setPhase] = useState('')
  const [round, setRound] = useState('')
  const [hasCoach, setHasCoach] = useState(false)

  // Team 1
  const [t1Name, setT1Name] = useState('')
  const [t1Country, setT1Country] = useState(DEFAULT_COUNTRY)
  const [t1P1, setT1P1] = useState({ ...emptyPlayer })
  const [t1P2, setT1P2] = useState({ ...emptyPlayer })

  // Team 2
  const [t2Name, setT2Name] = useState('')
  const [t2Country, setT2Country] = useState(DEFAULT_COUNTRY)
  const [t2P1, setT2P1] = useState({ ...emptyPlayer })
  const [t2P2, setT2P2] = useState({ ...emptyPlayer })

  // Officials
  const [ref1, setRef1] = useState({ ...emptyOfficial })
  const [ref2, setRef2] = useState({ ...emptyOfficial })
  const [scorer, setScorer] = useState({ ...emptyOfficial })
  const [asst, setAsst] = useState({ ...emptyOfficial })

  // Load match data
  useEffect(() => {
    if (!match) return
    setCompetitionName(match.competition_name || '')
    setGameN(match.game_n != null ? String(match.game_n) : '')

    if (match.scheduled_at) {
      const d = new Date(match.scheduled_at)
      setDate(d.toISOString().slice(0, 10))
      setTime(d.toISOString().slice(11, 16))
    }

    const mi = match.match_info || {}
    setSite(mi.site || '')
    setBeach(mi.beach || '')
    setCourt(mi.court || '')
    setGender(mi.gender || 'men')
    setPhase(mi.phase || 'main')
    setRound(mi.round || 'pool')
    setHasCoach(mi.has_coach || false)

    const td1 = match.team1_data || {}
    setT1Name(td1.name || '')
    setT1Country(td1.country || DEFAULT_COUNTRY)

    const td2 = match.team2_data || {}
    setT2Name(td2.name || '')
    setT2Country(td2.country || DEFAULT_COUNTRY)

    const pt1 = match.players_team1 || []
    setT1P1(pt1[0] || { ...emptyPlayer })
    setT1P2(pt1[1] || { ...emptyPlayer })

    const pt2 = match.players_team2 || []
    setT2P1(pt2[0] || { ...emptyPlayer })
    setT2P2(pt2[1] || { ...emptyPlayer })

    const officials = match.officials || []
    const findOff = (role) => {
      const o = officials.find(o => o.role === role)
      return o ? { ...o, country: o.country || DEFAULT_COUNTRY } : { ...emptyOfficial }
    }
    setRef1(findOff('1st referee'))
    setRef2(findOff('2nd referee'))
    setScorer(findOff('scorer'))
    setAsst(findOff('assistant scorer'))
  }, [match])

  const handleSave = async () => {
    if (!supabase) return
    if (!competitionName.trim()) {
      setError('Competition name is required')
      return
    }
    setSaving(true)
    setError('')
    setSaved(false)

    const scheduled_at = date ? new Date(`${date}T${time || '00:00'}:00Z`).toISOString() : null
    const t1Inferred = inferTeamName(t1P1, t1P2)
    const t2Inferred = inferTeamName(t2P1, t2P2)

    const payload = {
      competition_name: competitionName,
      game_n: gameN ? parseInt(gameN, 10) : null,
      scheduled_at,
      match_info: { site, beach, court, gender, phase, round, has_coach: hasCoach },
      team1_data: { name: t1Name || t1Inferred, short_name: '', country: t1Country },
      team2_data: { name: t2Name || t2Inferred, short_name: '', country: t2Country },
      players_team1: [t1P1, t1P2].filter(p => p.first_name || p.last_name || p.number),
      players_team2: [t2P1, t2P2].filter(p => p.first_name || p.last_name || p.number),
      officials: [
        { ...ref1, role: '1st referee' },
        { ...ref2, role: '2nd referee' },
        { ...scorer, role: 'scorer' },
        { ...asst, role: 'assistant scorer' }
      ].filter(o => o.firstName || o.lastName),
      updated_at: new Date().toISOString()
    }

    try {
      if (isNew) {
        payload.created_by = userId || null
        payload.sport_type = 'beach'
        payload.status = 'template'
        const { error: err } = await supabase
          .from('beach_competition_matches')
          .insert(payload)
        if (err) throw err
      } else {
        const { error: err } = await supabase
          .from('beach_competition_matches')
          .update(payload)
          .eq('id', match.id)
        if (err) throw err
      }
      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 800)
    } catch (err) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const sectionBg = {
    background: '#111827',
    borderRadius: s(10),
    border: '1px solid #1f2937',
    padding: s(14),
    marginBottom: s(14)
  }

  const sectionTitle = {
    fontSize: s(13),
    fontWeight: 600,
    color: '#fff',
    margin: `0 0 ${s(10)}px 0`,
    paddingBottom: s(6),
    borderBottom: '1px solid #1f2937'
  }

  return (
    <div style={{
      width: '100%',
      padding: s(16),
      boxSizing: 'border-box',
      overflowY: 'auto',
      overflowX: 'hidden',
      height: 'calc(100vh - 49px)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: s(16) }}>
        <div>
          <h1 style={{ fontSize: s(18), fontWeight: 700, color: '#fff', margin: 0 }}>
            {isNew ? 'New Match' : `Edit Match #${match.game_n || '?'}`}
          </h1>
          {!isNew && <p style={{ color: '#6b7280', fontSize: s(12), margin: `${s(3)}px 0 0 0` }}>{match.competition_name}</p>}
        </div>
        <button onClick={onClose} style={{ padding: `${s(6)}px ${s(14)}px`, background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: s(6), cursor: 'pointer', fontSize: s(13) }}>
          Back
        </button>
      </div>

      {error && (
        <div style={{ padding: `${s(8)}px ${s(12)}px`, background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: s(8), color: '#ef4444', marginBottom: s(14), fontSize: s(13) }}>
          {error}
        </div>
      )}

      {/* Match Info */}
      <div style={sectionBg}>
        <h3 style={sectionTitle}>Match Info</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: s(10) }}>
          <Field label="Competition" value={competitionName} onChange={setCompetitionName} s={s} />
          <div style={{ display: 'grid', gridTemplateColumns: `${s(80)}px 2fr 1fr 2fr 2fr ${s(80)}px`, gap: s(10) }}>
            <Field label="Game #" value={gameN} onChange={setGameN} type="number" s={s} />
            <Field label="Date" value={date} onChange={setDate} type="date" s={s} />
            <Field label="Time" value={time} onChange={setTime} type="time" s={s} />
            <Field label="Site / City" value={site} onChange={setSite} s={s} />
            <Field label="Beach / Facility" value={beach} onChange={setBeach} s={s} />
            <Field label="Court" value={court} onChange={setCourt} s={s} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: s(10), alignItems: 'end' }}>
            <SelectField label="Gender" value={gender} onChange={setGender} s={s} options={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]} />
            <SelectField label="Phase" value={phase} onChange={setPhase} s={s} options={[{ value: 'main', label: 'Main Draw' }, { value: 'qualification', label: 'Qualification' }]} />
            <SelectField label="Round" value={round} onChange={setRound} s={s} options={[
              { value: 'pool', label: 'Pool Play' },
              { value: 'winner', label: 'Winner Bracket' },
              { value: 'class', label: 'Classification' },
              { value: 'semifinals', label: 'Semifinals' },
              { value: 'finals', label: 'Finals' }
            ]} />
            <div style={{ display: 'flex', alignItems: 'center', gap: s(8), paddingBottom: s(6) }}>
              <Toggle checked={hasCoach} onChange={setHasCoach} s={s} />
              <span style={{ color: '#9ca3af', fontSize: s(12) }}>Coach</span>
            </div>
          </div>
        </div>
      </div>

      {/* Teams - side by side on wide, stacked on narrow */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: s(14), marginBottom: s(14) }}>
        <TeamSection
          title="Team 1"
          name={t1Name} setName={setT1Name}
          country={t1Country} setCountry={setT1Country}
          p1={t1P1} setP1={setT1P1}
          p2={t1P2} setP2={setT1P2}
          s={s}
        />
        <TeamSection
          title="Team 2"
          name={t2Name} setName={setT2Name}
          country={t2Country} setCountry={setT2Country}
          p1={t2P1} setP1={setT2P1}
          p2={t2P2} setP2={setT2P2}
          s={s}
        />
      </div>

      {/* Officials */}
      <div style={sectionBg}>
        <h3 style={sectionTitle}>Officials</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: s(10) }}>
          <OfficialRow label="1st Referee" official={ref1} onChange={setRef1} s={s} />
          <OfficialRow label="2nd Referee" official={ref2} onChange={setRef2} s={s} />
          <OfficialRow label="Scorer" official={scorer} onChange={setScorer} s={s} />
          <OfficialRow label="Assistant Scorer" official={asst} onChange={setAsst} s={s} />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: s(10), marginBottom: s(30) }}>
        <button onClick={onClose} style={{ padding: `${s(8)}px ${s(18)}px`, background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: s(6), cursor: 'pointer', fontSize: s(13) }}>
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: `${s(8)}px ${s(22)}px`,
            background: saved ? '#22c55e' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: s(6),
            cursor: 'pointer',
            fontSize: s(13),
            fontWeight: 600
          }}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : isNew ? 'Create Match' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
