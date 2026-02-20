import { useState, useRef } from 'react'
import { supabase } from '../../lib_beach/supabaseClient_beach'
import { parseExcel, mapExcelRowToCompMatch, validateCompMatch } from '../../utils_beach/excelParser_beach'

const BATCH_SIZE = 50

export default function ExcelUpload({ userId, onComplete }) {
  const [file, setFile] = useState(null)
  const [parsedRows, setParsedRows] = useState([])
  const [mappedMatches, setMappedMatches] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [step, setStep] = useState('select') // 'select' | 'preview' | 'importing' | 'done'
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const fileRef = useRef(null)

  const handleFileSelect = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setError('')

    try {
      const rows = await parseExcel(f)
      if (rows.length === 0) {
        setError('No data rows found in the file')
        return
      }
      setParsedRows(rows)

      const mapped = rows.map(row => mapExcelRowToCompMatch(row, userId))
      setMappedMatches(mapped)

      const errors = mapped.flatMap((m, i) => validateCompMatch(m, i))
      setValidationErrors(errors)
      setStep('preview')
    } catch (err) {
      setError('Failed to parse file: ' + (err.message || 'Unknown error'))
    }
  }

  const handleImport = async () => {
    if (!supabase) {
      setError('Supabase not configured')
      return
    }
    setStep('importing')
    setProgress({ done: 0, total: mappedMatches.length })

    try {
      for (let i = 0; i < mappedMatches.length; i += BATCH_SIZE) {
        const batch = mappedMatches.slice(i, i + BATCH_SIZE)
        const { error: err } = await supabase
          .from('beach_competition_matches')
          .insert(batch)
        if (err) throw err
        setProgress({ done: Math.min(i + BATCH_SIZE, mappedMatches.length), total: mappedMatches.length })
      }
      setStep('done')
    } catch (err) {
      setError('Import failed: ' + (err.message || 'Unknown error'))
      setStep('preview')
    }
  }

  const reset = () => {
    setFile(null)
    setParsedRows([])
    setMappedMatches([])
    setValidationErrors([])
    setStep('select')
    setError('')
    setProgress({ done: 0, total: 0 })
    if (fileRef.current) fileRef.current.value = ''
  }

  // Group by competition for preview summary
  const competitionSummary = mappedMatches.reduce((acc, m) => {
    const comp = m.competition_name || 'Unknown'
    if (!acc[comp]) acc[comp] = 0
    acc[comp]++
    return acc
  }, {})

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 20 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: '#fff', margin: '0 0 20px 0' }}>Upload Excel</h1>

      {error && (
        <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, color: '#ef4444', marginBottom: 16, fontSize: 14 }}>
          {error}
        </div>
      )}

      {/* Step: Select file */}
      {step === 'select' && (
        <div style={{ background: '#111827', borderRadius: 12, border: '2px dashed #374151', padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#x1F4C4;</div>
          <p style={{ color: '#9ca3af', marginBottom: 20 }}>Select an Excel file (.xlsx, .xls, or .csv) with competition match data</p>
          <label style={{ display: 'inline-block', padding: '10px 24px', background: '#3b82f6', color: '#fff', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
            Choose File
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </label>
          <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 500, margin: '24px auto 0' }}>
            <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Expected columns:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 16px', fontSize: 11, color: '#4b5563' }}>
              <span>Competition (required)</span>
              <span>Team 1 Name</span>
              <span>Game #</span>
              <span>Team 1 Country</span>
              <span>Date (required)</span>
              <span>T1 Player 1 #, Last, First</span>
              <span>Time</span>
              <span>T1 Player 2 #, Last, First</span>
              <span>Site</span>
              <span>Team 2 Name</span>
              <span>Court</span>
              <span>Team 2 Country</span>
              <span>Gender (required)</span>
              <span>T2 Player 1 #, Last, First</span>
              <span>Phase (required)</span>
              <span>T2 Player 2 #, Last, First</span>
              <span>Round (required)</span>
              <span>1st/2nd Referee Last, First</span>
            </div>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === 'preview' && (
        <div>
          {/* Summary */}
          <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1f2937', padding: 16, marginBottom: 16 }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: 15 }}>Import Summary</h3>
            <p style={{ color: '#9ca3af', fontSize: 13, margin: 0 }}>
              {mappedMatches.length} matches from {Object.keys(competitionSummary).length} competition(s)
            </p>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(competitionSummary).map(([comp, count]) => (
                <span key={comp} style={{ fontSize: 12, background: '#1f2937', color: '#d1d5db', padding: '3px 10px', borderRadius: 12 }}>
                  {comp}: {count}
                </span>
              ))}
            </div>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
              <p style={{ color: '#ef4444', fontSize: 13, fontWeight: 600, margin: '0 0 6px 0' }}>Validation warnings ({validationErrors.length}):</p>
              <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                {validationErrors.map((err, i) => (
                  <div key={i} style={{ color: '#fca5a5', fontSize: 12, padding: '2px 0' }}>{err}</div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          <div style={{ background: '#111827', borderRadius: 12, border: '1px solid #1f2937', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1f2937' }}>
                    {['#', 'Competition', 'Game', 'Date', 'Gender', 'Phase', 'Round', 'Team 1', 'Team 2', 'Players'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap', borderBottom: '1px solid #374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mappedMatches.slice(0, 100).map((m, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                      <td style={{ padding: '6px 10px', color: '#6b7280' }}>{i + 1}</td>
                      <td style={{ padding: '6px 10px', color: '#e5e7eb', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.competition_name}</td>
                      <td style={{ padding: '6px 10px', color: '#3b82f6', fontWeight: 600 }}>{m.game_n || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {m.scheduled_at ? new Date(m.scheduled_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-'}
                      </td>
                      <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{m.match_info?.gender || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{m.match_info?.phase || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#9ca3af' }}>{m.match_info?.round || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#e5e7eb' }}>{m.team1_data?.name || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#e5e7eb' }}>{m.team2_data?.name || '-'}</td>
                      <td style={{ padding: '6px 10px', color: '#6b7280' }}>
                        {(m.players_team1?.length || 0) + (m.players_team2?.length || 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {mappedMatches.length > 100 && (
              <div style={{ padding: 8, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>
                Showing first 100 of {mappedMatches.length} rows
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={reset} style={{ flex: 1, padding: '12px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              Cancel
            </button>
            <button onClick={handleImport} style={{ flex: 2, padding: '12px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              Import {mappedMatches.length} Matches
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: 60, background: '#111827', borderRadius: 12, border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 40, marginBottom: 16, animation: 'spin 1s linear infinite' }}>&#x23F3;</div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: '#e5e7eb', fontSize: 16, marginBottom: 8 }}>Importing matches...</p>
          <p style={{ color: '#6b7280', fontSize: 14 }}>{progress.done} / {progress.total}</p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: 60, background: '#111827', borderRadius: 12, border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 48, marginBottom: 12, color: '#22c55e' }}>&#x2713;</div>
          <h2 style={{ color: '#fff', fontSize: 20, marginBottom: 8 }}>Import Complete</h2>
          <p style={{ color: '#9ca3af', fontSize: 14, marginBottom: 24 }}>
            Successfully imported {mappedMatches.length} matches
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button onClick={reset} style={{ padding: '10px 20px', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              Upload More
            </button>
            <button onClick={onComplete} style={{ padding: '10px 20px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
              View Matches
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
