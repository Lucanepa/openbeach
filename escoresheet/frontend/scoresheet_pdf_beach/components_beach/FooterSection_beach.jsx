import React from 'react'

/**
 * Results component - displays set-by-set results in a table format
 */
export function Results({
  teamAShortName = '',
  teamBShortName = '',
  setResults = [],
  matchStart = null,
  matchEnd = null,
  matchDuration = null,
  winner = null,
  result = null
}) {
  return (
    <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #000' }}>
            <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Set</th>
            <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{teamAShortName || 'Team A'}</th>
            <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{teamBShortName || 'Team B'}</th>
            <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Duration</th>
          </tr>
        </thead>
        <tbody>
          {setResults.map((setResult, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #ccc' }}>
              <td style={{ padding: '8px', fontWeight: 'bold' }}>{setResult.set || index + 1}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{setResult.teamAScore || 0}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{setResult.teamBScore || 0}</td>
              <td style={{ padding: '8px', textAlign: 'center' }}>{setResult.duration || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {(matchStart || matchEnd || matchDuration) && (
        <div style={{ marginTop: '16px', fontSize: '10px', color: '#666' }}>
          {matchStart && <div>Start: {new Date(matchStart).toLocaleString()}</div>}
          {matchEnd && <div>End: {new Date(matchEnd).toLocaleString()}</div>}
          {matchDuration && <div>Duration: {matchDuration}</div>}
        </div>
      )}
      {winner && (
        <div style={{ marginTop: '12px', fontWeight: 'bold', textAlign: 'center' }}>
          Winner: {winner}
        </div>
      )}
      {result && (
        <div style={{ marginTop: '8px', textAlign: 'center', fontSize: '11px' }}>
          {result}
        </div>
      )}
    </div>
  )
}

/**
 * Sanctions component - displays sanctions in a table format
 */
export function Sanctions({
  items = [],
  improperRequests = { teamA: false, teamB: false }
}) {
  return (
    <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px' }}>
      {/* Improper Requests */}
      {(improperRequests.teamA || improperRequests.teamB) && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Improper Requests:</div>
          <div style={{ display: 'flex', gap: '16px' }}>
            {improperRequests.teamA && <span>Team A: ✓</span>}
            {improperRequests.teamB && <span>Team B: ✓</span>}
          </div>
        </div>
      )}

      {/* Sanctions Table */}
      {items.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #000' }}>
              <th style={{ padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Team</th>
              <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Player</th>
              <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Type</th>
              <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Set</th>
              <th style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>Score</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} style={{ borderBottom: '1px solid #ccc' }}>
                <td style={{ padding: '8px' }}>{item.team || '-'}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>{item.playerNr || '-'}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>{item.type || '-'}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>{item.set || '-'}</td>
                <td style={{ padding: '8px', textAlign: 'center' }}>{item.score || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
          No sanctions recorded
        </div>
      )}
    </div>
  )
}

/**
 * Remarks component - displays remarks and overflow sanctions
 */
export function Remarks({
  overflowSanctions = []
}) {
  return (
    <div style={{ padding: '16px', fontFamily: 'monospace', fontSize: '12px' }}>
      {overflowSanctions.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Additional Sanctions (overflow):</div>
          <div style={{ fontSize: '10px', color: '#666' }}>
            {overflowSanctions.map((item, index) => (
              <div key={index} style={{ marginBottom: '4px' }}>
                {item.team} - Player {item.playerNr} - {item.type} (Set {item.set}, Score {item.score})
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ color: '#666', fontStyle: 'italic' }}>
        Remarks section - additional notes can be added here
      </div>
    </div>
  )
}

