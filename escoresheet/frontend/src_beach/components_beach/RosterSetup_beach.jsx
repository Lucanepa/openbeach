import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { getMatchData } from '../utils_beach/serverDataSync_beach'
import { useRealtimeConnection } from '../hooks_beach/useRealtimeConnection_beach'
import { db } from '../db_beach/db_beach'
import { supabase } from '../lib_beach/supabaseClient_beach'
import SignaturePad from './SignaturePad_beach'

export default function RosterSetup({ matchId, team, onBack, embedded = false, useSupabaseConnection = false, matchData = null }) {
  const { t } = useTranslation()
  const { showAlert } = useAlert()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)

  // Signature states (beach volleyball: captain only)
  const [captainSignature, setCaptainSignature] = useState(null)
  const [openSignature, setOpenSignature] = useState(null) // 'captain' | null

  const [match, setMatch] = useState(matchData)
  const [teamId, setTeamId] = useState(null)

  // Helper to update state from match data result
  const updateFromMatchData = useCallback((result) => {
    if (!result || !result.success) return

    setMatch(result.match)

    const loadedTeamId = team === 'team1' ? result.match.team1Id : result.match.team2Id
    setTeamId(loadedTeamId)

    const teamPlayers = team === 'team1'
      ? (result.team1Players || [])
      : (result.team2Players || [])

    setPlayers(teamPlayers
      .sort((a, b) => (a.number || 0) - (b.number || 0))
      .map(p => ({
        id: p.id,
        number: p.number,
        firstName: p.firstName || '',
        lastName: p.lastName || p.name || '',
        dob: p.dob || '',
        isCaptain: p.isCaptain || false
      })))

    
  }, [team])

  // Handle match deletion - navigate back
  const handleMatchDeleted = useCallback(() => {
    if (onBack) {
      onBack()
    }
  }, [onBack])

  // Use Supabase Realtime as primary connection, WebSocket as fallback
  const { isConnected, activeConnection } = useRealtimeConnection({
    matchId: matchId !== -1 ? matchId : null, // Disable for test mode
    onData: updateFromMatchData,
    onDeleted: handleMatchDeleted,
    enabled: matchId && matchId !== -1
  })

  // Load initial match data and handle test mode
  useEffect(() => {
    if (!matchId) {
      setMatch(null)
      return
    }

    // Test mode: use mock data
    if (matchId === -1) {
      setMatch({
        id: -1,
        gameNumber: 999,
        status: 'live'
      })
      setTeamId(-1) // Mock team ID for test mode
      setPlayers([
        { id: 1, number: 1, firstName: 'Test', lastName: 'Player 1', dob: '', isCaptain: true },
        { id: 2, number: 2, firstName: 'Test', lastName: 'Player 2', dob: '', isCaptain: false }
      ])
      return
    }

    // Fetch initial data
    const fetchData = async () => {
      try {
        const result = await getMatchData(matchId)
        updateFromMatchData(result)
      } catch (err) {
        console.error('Error loading roster:', err)
        setError('Failed to load roster. Make sure the main scoresheet is running.')
      }
    }

    fetchData()
  }, [matchId, updateFromMatchData])

  const handleAddPlayer = () => {
    const newNumber = players.length > 0 
      ? Math.max(...players.map(p => p.number || 0)) + 1 
      : 1
    setPlayers([...players, {
      id: null,
      number: newNumber,
      firstName: '',
      lastName: '',
      dob: '',
      isCaptain: false
    }])
  }

  const handleDeletePlayer = (index) => {
    const player = players[index]
    if (player.id) {
      // Delete from database
      db.players.delete(player.id).catch(err => {
        console.error('Error deleting player:', err)
        setError('Failed to delete player')
      })
    }
    setPlayers(players.filter((_, i) => i !== index))
  }

  const handleUpdatePlayer = (index, field, value) => {
    const updated = [...players]
    updated[index] = { ...updated[index], [field]: value }
    setPlayers(updated)
  }

  const handleSave = async (overwrite = false) => {
    if (!teamId) {
      setError('Team ID not found')
      return
    }

    // Skip database operations in test mode
    if (matchId === -1 || teamId === -1) {
      return
    }

    setLoading(true)
    setError('')

    try {
      // If overwrite is true (e.g., from PDF import), delete all existing players first
      if (overwrite) {
        const existingPlayers = await db.players.where('teamId').equals(teamId).toArray()
        for (const ep of existingPlayers) {
          await db.players.delete(ep.id)
        }
      } else {
        // Normal save: update existing, add new, delete removed
        const existingPlayers = await db.players.where('teamId').equals(teamId).toArray()
        
        for (const player of players) {
          if (player.id) {
            // Update existing player
            await db.players.update(player.id, {
              number: player.number,
              firstName: player.firstName,
              lastName: player.lastName,
              name: `${player.lastName} ${player.firstName}`,
              dob: player.dob || null,
              isCaptain: !!player.isCaptain
            })
          } else {
            // Add new player
            await db.players.add({
              teamId,
              number: player.number,
              firstName: player.firstName,
              lastName: player.lastName,
              name: `${player.lastName} ${player.firstName}`,
              dob: player.dob || null,
              isCaptain: !!player.isCaptain,
              role: null,
              createdAt: new Date().toISOString()
            })
          }
        }

        // Delete players that are no longer in the roster
        const rosterNumbers = new Set(players.map(p => p.number))
        for (const ep of existingPlayers) {
          if (!rosterNumbers.has(ep.number)) {
            await db.players.delete(ep.id)
          }
        }
      }
      
      // Add all players (after deletion if overwrite)
      if (overwrite || players.some(p => !p.id)) {
        await db.players.bulkAdd(
          players.map(p => ({
            teamId,
            number: p.number,
            firstName: p.firstName,
            lastName: p.lastName,
            name: `${p.lastName} ${p.firstName}`,
            dob: p.dob || null,
            isCaptain: !!p.isCaptain,
            role: null,
            createdAt: new Date().toISOString()
          }))
        )
      }

      // If connected to Supabase, also sync roster
      if (useSupabaseConnection && supabase && matchData?.external_id) {
        setSyncing(true)

        // JSONB signature keys
        const captainSigJsonKey = team === 'team1' ? 'team1_captain' : 'team2_captain'

        const supabaseUpdate = {}

        // Build signatures JSONB partial update
        const signaturesUpdate = {}

        // Save signatures to JSONB
        if (captainSignature) {
          signaturesUpdate[captainSigJsonKey] = captainSignature
        }

        // Merge with existing signatures JSONB
        if (Object.keys(signaturesUpdate).length > 0) {
          const { data: existingMatch } = await supabase
            .from('matches')
            .select('signatures')
            .eq('external_id', matchData.external_id)
            .maybeSingle()

          supabaseUpdate.signatures = {
            ...(existingMatch?.signatures || {}),
            ...signaturesUpdate
          }
        }

        const { error: supabaseError } = await supabase
          .from('matches')
          .update(supabaseUpdate)
          .eq('external_id', matchData.external_id)

        setSyncing(false)

        if (supabaseError) {
          console.error('[RosterSetup] Failed to sync roster to Supabase:', supabaseError)
        }
        showAlert(t('rosterSetup.rosterSaved'), 'success')
      } else {
        showAlert(t('rosterSetup.rosterSaved'), 'success')
      }
    } catch (err) {
      console.error('Error saving roster:', err)
      setError('Failed to save roster')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
      color: '#fff',
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        background: 'var(--bg-secondary)',
        borderRadius: '12px',
        padding: '30px'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '30px'
        }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0 }}>
            {t('rosterSetup.title')} — {team === 'team1' ? (match?.team1Name || t('Team 1')) : (match?.team2Name || t('Team 2'))}
          </h1>
          <button
            onClick={onBack}
            style={{
              padding: '10px 20px',
              fontSize: '14px',
              fontWeight: 500,
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            {t('common.back')}
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '6px',
            color: '#ef4444',
            fontSize: '14px',
            marginBottom: '20px'
          }}>
            {error}
          </div>
        )}

        {/* Players Section */}
        <div style={{
          marginBottom: '30px',
          padding: '20px',
          background: 'var(--bg)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>
              {t('rosterSetup.players')}
            </h2>
            <button
              onClick={handleAddPlayer}
              style={{
                padding: '8px 16px',
                fontSize: '14px',
                fontWeight: 600,
                background: 'var(--accent)',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer'
              }}
            >
              {t('rosterSetup.addPlayer')}
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.2)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.number')}</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.firstName')}</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.lastName')}</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.dob')}</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.captain')}</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontSize: '14px', fontWeight: 600 }}>{t('rosterSetup.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {players.map((player, index) => (
                  <tr key={index} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="number"
                        value={player.number || ''}
                        onChange={(e) => handleUpdatePlayer(index, 'number', parseInt(e.target.value) || 0)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                        style={{
                          width: '40px',
                          padding: '6px',
                          fontSize: '14px',
                          textAlign: 'center',
                          background: 'var(--bg-secondary)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: 'var(--text)'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        value={player.firstName}
                        onChange={(e) => handleUpdatePlayer(index, 'firstName', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                        style={{
                          width: '150px',
                          padding: '6px',
                          fontSize: '14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: 'var(--text)'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        value={player.lastName}
                        onChange={(e) => handleUpdatePlayer(index, 'lastName', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                        style={{
                          width: '150px',
                          padding: '6px',
                          fontSize: '14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: 'var(--text)'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="text"
                        value={player.dob}
                        onChange={(e) => handleUpdatePlayer(index, 'dob', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur() } }}
                        placeholder="DD/MM/YYYY"
                        style={{
                          width: '120px',
                          padding: '6px',
                          fontSize: '14px',
                          background: 'var(--bg-secondary)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '4px',
                          color: 'var(--text)'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px' }}>
                      <input
                        type="radio"
                        name={`captain-${team}`}
                        checked={player.isCaptain || false}
                        onChange={(e) => {
                          // Unset all other captains, set this one
                          const updatedPlayers = players.map((p, idx) => ({
                            ...p,
                            isCaptain: idx === index ? e.target.checked : false
                          }))
                          setPlayers(updatedPlayers)
                        }}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleDeletePlayer(index)}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: 'rgba(239, 68, 68, 0.2)',
                          color: '#ef4444',
                          border: '1px solid #ef4444',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {t('common.delete')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Signatures Section */}
        <div style={{
          marginBottom: '30px',
          padding: '20px',
          background: 'var(--bg)',
          borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.1)'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            {t('rosterSetup.signatures', 'Signatures')}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--muted)', marginBottom: '20px' }}>
            {t('rosterSetup.signaturesDescription', 'Optional: Captain can sign the roster before submitting.')}
          </p>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Captain Signature */}
            <div style={{ flex: 1, minWidth: '200px' }}>
              <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                {t('rosterSetup.captainSignature', 'Captain Signature')}
              </div>
              <div
                onClick={() => setOpenSignature('captain')}
                style={{
                  width: '100%',
                  height: '100px',
                  background: captainSignature ? 'white' : 'rgba(255,255,255,0.05)',
                  border: captainSignature ? '2px solid #22c55e' : '2px dashed rgba(255,255,255,0.3)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden'
                }}
              >
                {captainSignature ? (
                  <img src={captainSignature} alt="Captain signature" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                ) : (
                  <span style={{ color: 'var(--muted)', fontSize: '13px' }}>
                    {t('rosterSetup.tapToSign', 'Tap to sign')}
                  </span>
                )}
              </div>
              {captainSignature && (
                <button
                  onClick={(e) => { e.stopPropagation(); setCaptainSignature(null); }}
                  style={{
                    marginTop: '8px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#ef4444',
                    border: '1px solid #ef4444',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  {t('common.clear', 'Clear')}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px',
          marginTop: '30px'
        }}>
          <button
            onClick={onBack}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 500,
              background: 'transparent',
              color: 'var(--muted)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 600,
              background: loading ? 'rgba(255,255,255,0.3)' : 'var(--accent)',
              color: loading ? 'rgba(255,255,255,0.5)' : '#000',
              border: 'none',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer'
            }}
          >
            {loading ? t('rosterSetup.saving') : t('rosterSetup.saveRoster')}
          </button>
        </div>

        {/* Syncing Modal */}
        {syncing && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001
          }}>
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: '12px',
              padding: '32px',
              textAlign: 'center',
              maxWidth: '400px',
              width: '90%'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                border: '4px solid rgba(255, 255, 255, 0.2)',
                borderTopColor: 'var(--accent)',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 20px'
              }} />
              <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
                {t('rosterSetup.syncingToDatabase', 'Syncing to Database')}
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)' }}>
                {t('rosterSetup.syncingMessage', 'Sending roster to scoresheet for approval...')}
              </p>
              <style>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          </div>
        )}

        {/* Signature Pad */}
        <SignaturePad
          open={openSignature !== null}
          onClose={() => setOpenSignature(null)}
          onSave={(signature) => {
            if (openSignature === 'captain') {
              setCaptainSignature(signature)
            }
            setOpenSignature(null)
          }}
          title={t('rosterSetup.captainSignature', 'Captain Signature')}
        />
      </div>
    </div>
  )
}

