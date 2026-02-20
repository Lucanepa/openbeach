import { useState, useEffect } from 'react'
import { supabase } from '../../lib_beach/supabaseClient_beach'

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  background: '#1f2937',
  border: '1px solid #374151',
  borderRadius: 6,
  color: '#e5e7eb',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box'
}

const labelStyle = {
  display: 'block',
  fontSize: 12,
  color: '#9ca3af',
  marginBottom: 4,
  fontWeight: 500
}

const sectionStyle = {
  background: '#111827',
  borderRadius: 10,
  border: '1px solid #1f2937',
  padding: 16,
  marginBottom: 16
}

const sectionTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#fff',
  margin: '0 0 12px 0',
  paddingBottom: 8,
  borderBottom: '1px solid #1f2937'
}

function Field({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, cursor: 'pointer' }}
      >
        <option value="">--</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

function PlayerRow({ label, player, onChange }) {
  const update = (field, val) => onChange({ ...player, [field]: val })
  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr 100px', gap: 6 }}>
        <input type="number" value={player.number || ''} onChange={e => update('number', e.target.value)} placeholder="#" style={inputStyle} />
        <input value={player.first_name || ''} onChange={e => update('first_name', e.target.value)} placeholder="First name" style={inputStyle} />
        <input value={player.last_name || ''} onChange={e => update('last_name', e.target.value)} placeholder="Last name" style={inputStyle} />
        <input value={player.dob || ''} onChange={e => update('dob', e.target.value)} placeholder="DOB" style={inputStyle} />
      </div>
    </div>
  )
}

function OfficialRow({ label, official, onChange }) {
  const update = (field, val) => onChange({ ...official, [field]: val })
  return (
    <div>
      <label style={{ ...labelStyle, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px', gap: 6 }}>
        <input value={official.firstName || ''} onChange={e => update('firstName', e.target.value)} placeholder="First name" style={inputStyle} />
        <input value={official.lastName || ''} onChange={e => update('lastName', e.target.value)} placeholder="Last name" style={inputStyle} />
        <input value={official.country || ''} onChange={e => update('country', e.target.value)} placeholder="Country" style={inputStyle} />
        <input value={official.dob || ''} onChange={e => update('dob', e.target.value)} placeholder="DOB" style={inputStyle} />
      </div>
    </div>
  )
}

const emptyPlayer = { number: '', first_name: '', last_name: '', dob: '', is_captain: false }
const emptyOfficial = { firstName: '', lastName: '', country: '', dob: '' }

export default function CompMatchEditor({ match, onClose }) {
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
  const [t1Short, setT1Short] = useState('')
  const [t1Country, setT1Country] = useState('')
  const [t1P1, setT1P1] = useState({ ...emptyPlayer })
  const [t1P2, setT1P2] = useState({ ...emptyPlayer })

  // Team 2
  const [t2Name, setT2Name] = useState('')
  const [t2Short, setT2Short] = useState('')
  const [t2Country, setT2Country] = useState('')
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
    setGender(mi.gender || '')
    setPhase(mi.phase || '')
    setRound(mi.round || '')
    setHasCoach(mi.has_coach || false)

    const td1 = match.team1_data || {}
    setT1Name(td1.name || '')
    setT1Short(td1.short_name || '')
    setT1Country(td1.country || '')

    const td2 = match.team2_data || {}
    setT2Name(td2.name || '')
    setT2Short(td2.short_name || '')
    setT2Country(td2.country || '')

    const pt1 = match.players_team1 || []
    setT1P1(pt1[0] || { ...emptyPlayer })
    setT1P2(pt1[1] || { ...emptyPlayer })

    const pt2 = match.players_team2 || []
    setT2P1(pt2[0] || { ...emptyPlayer })
    setT2P2(pt2[1] || { ...emptyPlayer })

    const officials = match.officials || []
    const findOff = (role) => officials.find(o => o.role === role) || { ...emptyOfficial }
    setRef1(findOff('1st referee'))
    setRef2(findOff('2nd referee'))
    setScorer(findOff('scorer'))
    setAsst(findOff('assistant scorer'))
  }, [match])

  const handleSave = async () => {
    if (!supabase || !match?.id) return
    setSaving(true)
    setError('')
    setSaved(false)

    const scheduled_at = date ? new Date(`${date}T${time || '00:00'}:00Z`).toISOString() : null

    const payload = {
      competition_name: competitionName,
      game_n: gameN ? parseInt(gameN, 10) : null,
      scheduled_at,
      match_info: { site, beach, court, gender, phase, round, has_coach: hasCoach },
      team1_data: { name: t1Name, short_name: t1Short, color: match.team1_data?.color || '#ef4444', country: t1Country },
      team2_data: { name: t2Name, short_name: t2Short, color: match.team2_data?.color || '#3b82f6', country: t2Country },
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
      const { error: err } = await supabase
        .from('beach_competition_matches')
        .update(payload)
        .eq('id', match.id)
      if (err) throw err
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!match) return null

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: 0 }}>
            Edit Match #{match.game_n || '?'}
          </h1>
          <p style={{ color: '#6b7280', fontSize: 13, margin: '4px 0 0 0' }}>{match.competition_name}</p>
        </div>
        <button onClick={onClose} style={{ padding: '8px 16px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>
          Back
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Match Info */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Match Info</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Competition" value={competitionName} onChange={setCompetitionName} />
          <Field label="Game #" value={gameN} onChange={setGameN} type="number" />
          <Field label="Date" value={date} onChange={setDate} type="date" />
          <Field label="Time" value={time} onChange={setTime} type="time" />
          <Field label="Site / City" value={site} onChange={setSite} />
          <Field label="Beach / Facility" value={beach} onChange={setBeach} />
          <Field label="Court" value={court} onChange={setCourt} />
          <SelectField label="Gender" value={gender} onChange={setGender} options={[{ value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }]} />
          <SelectField label="Phase" value={phase} onChange={setPhase} options={[{ value: 'main', label: 'Main Draw' }, { value: 'qualification', label: 'Qualification' }]} />
          <SelectField label="Round" value={round} onChange={setRound} options={[
            { value: 'pool', label: 'Pool Play' },
            { value: 'winner', label: 'Winner Bracket' },
            { value: 'class', label: 'Classification' },
            { value: 'semifinals', label: 'Semifinals' },
            { value: 'finals', label: 'Finals' }
          ]} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={hasCoach} onChange={e => setHasCoach(e.target.checked)} />
            Has Coach
          </label>
        </div>
      </div>

      {/* Team 1 */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Team 1</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 12, marginBottom: 12 }}>
          <Field label="Name" value={t1Name} onChange={setT1Name} />
          <Field label="Short Name" value={t1Short} onChange={setT1Short} />
          <Field label="Country" value={t1Country} onChange={setT1Country} placeholder="CHE" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PlayerRow label="Player 1" player={t1P1} onChange={setT1P1} />
          <PlayerRow label="Player 2" player={t1P2} onChange={setT1P2} />
        </div>
      </div>

      {/* Team 2 */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Team 2</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px', gap: 12, marginBottom: 12 }}>
          <Field label="Name" value={t2Name} onChange={setT2Name} />
          <Field label="Short Name" value={t2Short} onChange={setT2Short} />
          <Field label="Country" value={t2Country} onChange={setT2Country} placeholder="CHE" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <PlayerRow label="Player 1" player={t2P1} onChange={setT2P1} />
          <PlayerRow label="Player 2" player={t2P2} onChange={setT2P2} />
        </div>
      </div>

      {/* Officials */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Officials</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <OfficialRow label="1st Referee" official={ref1} onChange={setRef1} />
          <OfficialRow label="2nd Referee" official={ref2} onChange={setRef2} />
          <OfficialRow label="Scorer" official={scorer} onChange={setScorer} />
          <OfficialRow label="Assistant Scorer" official={asst} onChange={setAsst} />
        </div>
      </div>

      {/* Save */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 40 }}>
        <button onClick={onClose} style={{ flex: 1, padding: '12px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 2,
            padding: '12px',
            background: saved ? '#22c55e' : '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600
          }}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
