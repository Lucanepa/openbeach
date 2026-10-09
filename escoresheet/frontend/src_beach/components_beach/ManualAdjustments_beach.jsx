import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/volleyui/Button.jsx'
import { SegmentedControl } from '../ui/volleyui/SegmentedControl.jsx'
import { DateField, TimeField } from '../ui/volleyui/DateField.jsx'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db_beach/db_beach'
import { useAlert } from '../contexts_beach/AlertContext_beach'
import { withActivityContext } from '../db_beach/eventHistory_beach'
import { randomUuid } from '../utils_beach/deviceId_beach'
import { sanctionLabel } from '../utils_beach/corrections_beach'
import { swapTeamDesignation as swapTeamDesignationPatch, coinTossCloud } from '../utils_beach/coinToss_beach'
import CorrectionsPanel from './corrections/CorrectionsPanel_beach'
import { isCustomColour } from '../utils_beach/teamColours_beach'

// Standard volleyball team colors - keys for translation
const TEAM_COLORS = [
  { key: 'blue', value: '#3b82f6' },
  { key: 'red', value: '#ef4444' },
  { key: 'green', value: '#22c55e' },
  { key: 'yellow', value: '#eab308' },
  { key: 'purple', value: '#a855f7' },
  { key: 'orange', value: '#f97316' },
  { key: 'black', value: '#1f2937' },
  { key: 'white', value: '#f8fafc' },
  { key: 'navy', value: '#1e3a5f' },
  { key: 'maroon', value: '#7f1d1d' },
  { key: 'teal', value: '#0d9488' },
  { key: 'pink', value: '#ec4899' }
]

// A team colour that is none of the list above (picked as a custom colour in
// Match setup, or from a saved team): the select keeps it as its own option
// instead of showing the first colour of the list
const isOtherColour = (colour) =>
  typeof colour === 'string' && colour.trim() !== '' && !TEAM_COLORS.some(c => c.value.toLowerCase() === colour.trim().toLowerCase())

// That option's text: "Custom colour #…" for a colour picked as a custom one,
// the bare code for one of Match setup's twelve shirts this list lacks
// (white #FFFFFF, black #000000, red #dc2626...), which is no custom colour
const otherColourLabel = (t, colour) =>
  isCustomColour(colour) ? `${t('matchSetup.customColour', 'Custom colour')} ${colour}` : colour

/**
 * A stored instant as the local date ('YYYY-MM-DD') and time ('HH:MM') the
 * fields show. Local, because an edit goes back through new Date('…T…') (local
 * time): the UTC slice shown before made the time jump by the UTC offset on
 * every edit (18:30 in Zürich showed as 16:30, and saving it stored 14:30).
 */
function localDateTime(value) {
  if (!value) return { date: '', time: '' }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return { date: '', time: '' }
  const p = (n) => String(n).padStart(2, '0')
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` }
}

/**
 * Convert various date formats to ISO yyyy-MM-dd for the date fields
 * Handles: DD.MM.YYYY, DD/MM/YYYY, MM/DD/YYYY, ISO format
 */
function toISODate(dateStr) {
  if (!dateStr) return ''

  // Already in ISO format (yyyy-MM-dd)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // European format: DD.MM.YYYY or DD/MM/YYYY
  const euroMatch = dateStr.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/)
  if (euroMatch) {
    const [, day, month, year] = euroMatch
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Try parsing as Date object
  const date = new Date(dateStr)
  if (!isNaN(date.getTime())) {
    return date.toISOString().split('T')[0]
  }

  return ''
}

/**
 * ManualAdjustments - Full match editing component
 * Allows editing of all match data: scores, teams, players,
 * sanctions, timeouts, and match officials.
 */
export default function ManualAdjustments({ matchId, onClose, onSave }) {
  const { t } = useTranslation()
  const { showAlert } = useAlert()

  // Track all changes for audit log
  const [changes, setChanges] = useState([])
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('corrections')

  // Editable state - Sets
  const [editedSets, setEditedSets] = useState([])

  // Editable state - Match
  const [editedMatch, setEditedMatch] = useState(null)
  // The scheduled time of day, kept while the date is retyped: the typed date
  // field reports '' while half-typed (scheduledAt empties for that moment)
  const scheduledTimeRef = useRef('')

  // Editable state - Teams
  const [editedTeam1, setEditedTeam1] = useState(null)
  const [editedTeam2, setEditedTeam2] = useState(null)

  // Add sanction modal state
  const [showAddSanction, setShowAddSanction] = useState(null) // { team: 'team1'|'team2', playerNumber?: number, playerType: 'player' }
  const [newSanctionData, setNewSanctionData] = useState({ type: 'warning', setIndex: 1, scoreA: 0, scoreB: 0 })

  // Edit sanction modal state
  const [editingSanction, setEditingSanction] = useState(null)

  // Timeout modal state
  const [showAddTimeout, setShowAddTimeout] = useState(false)
  const [newTimeoutData, setNewTimeoutData] = useState({ team: 'team1', setIndex: 1, scoreA: 0, scoreB: 0 })

  // Editable state - Players
  const [editedTeam1Players, setEditedTeam1Players] = useState([])
  const [editedTeam2Players, setEditedTeam2Players] = useState([])

  // Editable state - Events (filtered by type)
  const [allEvents, setAllEvents] = useState([])
  const [deletedEventIds, setDeletedEventIds] = useState([])
  const [newEvents, setNewEvents] = useState([])

  // Editable state - Officials (with DOB)
  const [editedOfficials, setEditedOfficials] = useState({
    ref1: { firstName: '', lastName: '', country: '', dob: '' },
    ref2: { firstName: '', lastName: '', country: '', dob: '' },
    scorer: { firstName: '', lastName: '', dob: '' },
    asstScorer: { firstName: '', lastName: '', dob: '' }
  })

  // Players to delete (marked for deletion)
  const [deletedPlayerIds, setDeletedPlayerIds] = useState([])

  // Load match data
  const data = useLiveQuery(async () => {
    const match = await db.matches.get(matchId)
    if (!match) return null

    const [team1, team2] = await Promise.all([
      match?.team1Id ? db.teams.get(match.team1Id) : null,
      match?.team2Id ? db.teams.get(match.team2Id) : null
    ])

    const sets = await db.sets.where('matchId').equals(matchId).sortBy('index')

    const [team1Players, team2Players] = await Promise.all([
      match?.team1Id ? db.players.where('teamId').equals(match.team1Id).sortBy('number') : [],
      match?.team2Id ? db.players.where('teamId').equals(match.team2Id).sortBy('number') : []
    ])

    const events = await db.events.where('matchId').equals(matchId).toArray()
    const sortedEvents = events.sort((a, b) => (a.seq || 0) - (b.seq || 0))

    return { match, team1, team2, sets, team1Players, team2Players, events: sortedEvents }
  }, [matchId])

  // Initialize editable state from data
  useEffect(() => {
    if (data) {
      setEditedSets(data.sets.map(s => ({ ...s })))
      setEditedMatch({ ...data.match })
      setEditedTeam1(data.team1 ? { ...data.team1 } : null)
      setEditedTeam2(data.team2 ? { ...data.team2 } : null)
      setEditedTeam1Players(data.team1Players.map(p => ({ ...p })))
      setEditedTeam2Players(data.team2Players.map(p => ({ ...p })))
      setAllEvents(data.events.map(e => ({ ...e })))

      // Initialize officials from match data - handle both array and object formats
      const officialsData = data.match?.officials
      let ref1 = {}, ref2 = {}, scorer = {}, asstScorer = {}

      if (Array.isArray(officialsData)) {
        // Array format: [{ role: '1st referee', firstName, lastName, country, dob }, ...]
        ref1 = officialsData.find(o => o.role === '1st referee' || o.role === 'ref1') || {}
        ref2 = officialsData.find(o => o.role === '2nd referee' || o.role === 'ref2') || {}
        scorer = officialsData.find(o => o.role === 'scorer') || {}
        asstScorer = officialsData.find(o => o.role === 'assistant scorer' || o.role === 'asstScorer') || {}
      } else if (officialsData) {
        // Object format: { ref1: {...}, ref2: {...}, scorer: {...}, asstScorer: {...} }
        ref1 = officialsData.ref1 || {}
        ref2 = officialsData.ref2 || {}
        scorer = officialsData.scorer || {}
        asstScorer = officialsData.asstScorer || {}
      }

      setEditedOfficials({
        ref1: { firstName: ref1.firstName || ref1.first_name || '', lastName: ref1.lastName || ref1.last_name || '', country: ref1.country || '', dob: ref1.dob || '' },
        ref2: { firstName: ref2.firstName || ref2.first_name || '', lastName: ref2.lastName || ref2.last_name || '', country: ref2.country || '', dob: ref2.dob || '' },
        scorer: { firstName: scorer.firstName || scorer.first_name || '', lastName: scorer.lastName || scorer.last_name || '', dob: scorer.dob || '' },
        asstScorer: { firstName: asstScorer.firstName || asstScorer.first_name || '', lastName: asstScorer.lastName || asstScorer.last_name || '', dob: asstScorer.dob || '' }
      })
    }
  }, [data])

  // Record a change for audit
  const recordChange = useCallback((category, field, before, after, description) => {
    const change = {
      ts: new Date().toISOString(),
      category,
      field,
      before,
      after,
      description
    }
    setChanges(prev => [...prev, change])
    return change
  }, [])

  // ==================== SET FUNCTIONS ====================
  const updateSetScore = useCallback((setId, field, value) => {
    setEditedSets(prev => prev.map(s => {
      if (s.id === setId) {
        const oldValue = s[field]
        const newValue = parseInt(value, 10) || 0
        if (oldValue !== newValue) {
          recordChange('set', field, oldValue, newValue, `Set ${s.index} ${field}: ${oldValue} → ${newValue}`)
        }
        return { ...s, [field]: newValue }
      }
      return s
    }))
  }, [recordChange])

  // ==================== MATCH INFO FUNCTIONS ====================
  const updateMatchInfo = useCallback((field, value) => {
    setEditedMatch(prev => {
      if (!prev) return prev
      const oldValue = prev[field]
      if (oldValue !== value) {
        recordChange('match', field, oldValue, value, `Match ${field}: ${oldValue || '(empty)'} → ${value || '(empty)'}`)
      }
      return { ...prev, [field]: value }
    })
  }, [recordChange])

  // ==================== TEAM FUNCTIONS ====================
  const updateTeam = useCallback((field, value, isTeam1) => {
    const setter = isTeam1 ? setEditedTeam1 : setEditedTeam2
    const teamLabel = isTeam1 ? 'team1' : 'team2'
    setter(prev => {
      if (!prev) return prev
      const oldValue = prev[field]
      if (oldValue !== value) {
        recordChange('team', field, oldValue, value, `${teamLabel} team ${field}: ${oldValue || '(empty)'} → ${value || '(empty)'}`)
      }
      return { ...prev, [field]: value }
    })
  }, [recordChange])

  // Swap which team is A and which is B: only the designation changes (the
  // labels), as the scoring screen's "Swap team A ↔ B" and OpenVolley's. Team
  // IDs, players, set scores and events are keyed by team1 / team2 and stay as
  // they are; the A/B-labelled fields (serve flags, the set 3 toss, the court
  // sides) move with the designation so the first server and each team's side
  // stay the same (coinToss_beach swapTeamDesignation). It swapped the team
  // 1 / team 2 data instead: the cloud got each team's name, players and
  // points under the other team.
  // (recordChange outside the state updater: React calls an updater twice in
  // StrictMode, which logged the swap twice)
  const swapTeamDesignation = useCallback(() => {
    if (!editedMatch) return
    const patch = swapTeamDesignationPatch(editedMatch)
    recordChange('match', 'teamDesignation', `A=${editedMatch.coinTossTeamA || 'team1'}`, `A=${patch.coinTossTeamA}`, 'Swapped team A/B designation')
    setEditedMatch({ ...editedMatch, ...patch, _designationSwapped: !editedMatch._designationSwapped })
  }, [editedMatch, recordChange])

  // ==================== PLAYER FUNCTIONS ====================
  const updatePlayer = useCallback((playerId, field, value, isTeam1) => {
    const setter = isTeam1 ? setEditedTeam1Players : setEditedTeam2Players
    setter(prev => prev.map(p => {
      if (p.id === playerId) {
        const oldValue = p[field]
        if (oldValue !== value) {
          recordChange('player', field, oldValue, value, `Player #${p.number} ${field}: ${oldValue || '(empty)'} → ${value || '(empty)'}`)
        }
        return { ...p, [field]: value }
      }
      return p
    }))
  }, [recordChange])

  const addPlayer = useCallback((isTeam1) => {
    const setter = isTeam1 ? setEditedTeam1Players : setEditedTeam2Players
    const team = isTeam1 ? editedTeam1 : editedTeam2
    const teamLabel = isTeam1 ? 'team1' : 'team2'
    const newPlayer = {
      id: `new_${Date.now()}`,
      teamId: team?.id,
      number: 0,
      name: '',
      isCaptain: false,
      isNew: true
    }
    recordChange('player', 'add', null, newPlayer, `Added new player to ${teamLabel} team`)
    setter(prev => [...prev, newPlayer])
  }, [editedTeam1, editedTeam2, recordChange])

  const removePlayer = useCallback((playerId, isTeam1) => {
    const setter = isTeam1 ? setEditedTeam1Players : setEditedTeam2Players
    const players = isTeam1 ? editedTeam1Players : editedTeam2Players
    const player = players.find(p => p.id === playerId)
    if (player) {
      recordChange('player', 'remove', player, null, `Removed player #${player.number} ${player.name}`)
      if (!String(playerId).startsWith('new_')) {
        setDeletedPlayerIds(prev => [...prev, playerId])
      }
      setter(prev => prev.filter(p => p.id !== playerId))
    }
  }, [editedTeam1Players, editedTeam2Players, recordChange])

  // ==================== EVENT FUNCTIONS ====================
  const deleteEvent = useCallback((eventId) => {
    const event = allEvents.find(e => e.id === eventId)
    if (event) {
      recordChange('event', 'delete', JSON.stringify(event), null, `Deleted event: ${event.type} (seq: ${event.seq})`)
      setDeletedEventIds(prev => [...prev, eventId])
      setAllEvents(prev => prev.filter(e => e.id !== eventId))
    }
  }, [allEvents, recordChange])

  const addTimeout = useCallback((team, setIndex, scoreA, scoreB) => {
    const newEvent = {
      id: `new_${Date.now()}`,
      matchId,
      type: 'timeout',
      setIndex,
      payload: { team },
      stateSnapshot: { scoreA, scoreB },
      ts: new Date().toISOString(),
      seq: Math.max(...allEvents.map(e => e.seq || 0), 0) + 1,
      isNew: true
    }
    recordChange('event', 'add', null, newEvent, `Added ${team} timeout in set ${setIndex}`)
    setNewEvents(prev => [...prev, newEvent])
    setAllEvents(prev => [...prev, newEvent].sort((a, b) => (a.seq || 0) - (b.seq || 0)))
  }, [matchId, allEvents, recordChange])

  const addSanction = useCallback((team, setIndex, sanctionType, playerType, playerNumber, scoreA, scoreB, role = null) => {
    const newEvent = {
      id: `new_${Date.now()}`,
      matchId,
      type: 'sanction',
      setIndex,
      payload: { team, type: sanctionType, sanctionType, playerType, playerNumber, role },
      stateSnapshot: { scoreA, scoreB },
      ts: new Date().toISOString(),
      seq: Math.max(...allEvents.map(e => e.seq || 0), 0) + 1,
      isNew: true
    }
    const targetDesc = playerType === 'player' ? `#${playerNumber}` : (role || playerType)
    recordChange('event', 'add', null, newEvent, `Added ${sanctionType} to ${team} ${playerType} ${targetDesc}`)
    setNewEvents(prev => [...prev, newEvent])
    setAllEvents(prev => [...prev, newEvent].sort((a, b) => (a.seq || 0) - (b.seq || 0)))
  }, [matchId, allEvents, recordChange])

  // Handle adding sanction from modal
  const handleAddSanctionSubmit = useCallback(() => {
    if (!showAddSanction) return
    const { team, playerNumber, playerType, role } = showAddSanction
    const { type, setIndex, scoreA, scoreB } = newSanctionData
    addSanction(team, setIndex, type, playerType, playerNumber, scoreA, scoreB, role)
    setShowAddSanction(null)
    setNewSanctionData({ type: 'warning', setIndex: 1, scoreA: 0, scoreB: 0 })
  }, [showAddSanction, newSanctionData, addSanction])

  // Handle editing sanction
  const handleEditSanctionSubmit = useCallback(() => {
    if (!editingSanction) return
    setAllEvents(prev => prev.map(e => {
      if (e.id === editingSanction.id) {
        const newPayload = { ...e.payload, type: editingSanction.type, sanctionType: editingSanction.type }
        const newSnapshot = { scoreA: editingSanction.scoreA, scoreB: editingSanction.scoreB }
        recordChange('event', 'sanction', JSON.stringify(e), JSON.stringify({ ...e, payload: newPayload, setIndex: editingSanction.setIndex, stateSnapshot: newSnapshot }), `Modified sanction`)
        return { ...e, payload: newPayload, setIndex: editingSanction.setIndex, stateSnapshot: newSnapshot, isModified: true }
      }
      return e
    }))
    setEditingSanction(null)
  }, [editingSanction, recordChange])

  // Handle adding timeout from modal
  const handleAddTimeoutSubmit = useCallback(() => {
    const { team, setIndex, scoreA, scoreB } = newTimeoutData
    addTimeout(team, setIndex, scoreA, scoreB)
    setShowAddTimeout(false)
    setNewTimeoutData({ team: 'team1', setIndex: 1, scoreA: 0, scoreB: 0 })
  }, [newTimeoutData, addTimeout])

  const updateEventPayload = useCallback((eventId, field, value) => {
    setAllEvents(prev => prev.map(e => {
      if (e.id === eventId) {
        const oldValue = e.payload?.[field]
        if (oldValue !== value) {
          recordChange('event', field, oldValue, value, `Event ${e.type} ${field}: ${oldValue} → ${value}`)
        }
        return { ...e, payload: { ...e.payload, [field]: value }, isModified: true }
      }
      return e
    }))
  }, [recordChange])

  // ==================== OFFICIALS FUNCTIONS ====================
  const updateOfficial = useCallback((role, field, value) => {
    setEditedOfficials(prev => {
      const oldValue = prev[role]?.[field]
      if (oldValue !== value) {
        recordChange('official', `${role}.${field}`, oldValue, value, `${role} ${field}: ${oldValue || '(empty)'} → ${value || '(empty)'}`)
      }
      return { ...prev, [role]: { ...prev[role], [field]: value } }
    })
  }, [recordChange])

  // ==================== SAVE FUNCTION ====================
  // Teams, players and match info. Every event deleted or edited by the save
  // is recorded as a manual adjustment in the event history
  // (db_beach/eventHistory_beach); scores, time-outs and sanctions are
  // corrected in the Corrections tab, one by one.
  const handleSave = async () => withActivityContext({ reason: 'manual_adjustment', actionId: randomUuid() }, async () => {
    if (changes.length === 0) {
      showAlert(t('manualAdjustmentsEditor.noChanges', 'No changes to save'), 'info')
      return
    }

    setSaving(true)
    try {
      // Set scores are not written here: the Corrections tab counts them from
      // the points (a typed score here could overwrite a correction)

      // Update teams in IndexedDB
      if (editedTeam1?.id) {
        await db.teams.update(editedTeam1.id, {
          name: editedTeam1.name,
          shortName: editedTeam1.shortName,
          color: editedTeam1.color
        })
      }
      if (editedTeam2?.id) {
        await db.teams.update(editedTeam2.id, {
          name: editedTeam2.name,
          shortName: editedTeam2.shortName,
          color: editedTeam2.color
        })
      }

      // Update match in IndexedDB
      if (editedMatch) {
        const existingChanges = editedMatch.manualChanges || []
        await db.matches.update(matchId, {
          hall: editedMatch.hall,
          city: editedMatch.city,
          league: editedMatch.league,
          championshipType: editedMatch.championshipType,
          gameN: editedMatch.gameN,
          status: editedMatch.status,
          scheduledAt: editedMatch.scheduledAt,
          match_type_2: editedMatch.match_type_2,
          coinTossTeamA: editedMatch.coinTossTeamA,
          coinTossTeamB: editedMatch.coinTossTeamB,
          // A/B-labelled fields move together with the designation (Swap A/B)
          ...(editedMatch._designationSwapped ? {
            firstServe: editedMatch.firstServe,
            coinTossServeA: editedMatch.coinTossServeA,
            coinTossServeB: editedMatch.coinTossServeB,
            set3FirstServe: editedMatch.set3FirstServe ?? null,
            set3LeftTeam: editedMatch.set3LeftTeam ?? null,
            setLeftTeamOverrides: editedMatch.setLeftTeamOverrides
          } : {}),
          officials: editedOfficials,
          manualChanges: [...existingChanges, ...changes]
        })
      }

      // Update existing players in IndexedDB
      for (const player of [...editedTeam1Players, ...editedTeam2Players]) {
        if (!String(player.id).startsWith('new_')) {
          await db.players.update(player.id, {
            name: player.name,
            number: player.number,
            isCaptain: player.isCaptain
          })
        }
      }

      // Add new players
      for (const player of [...editedTeam1Players, ...editedTeam2Players]) {
        if (player.isNew) {
          await db.players.add({
            teamId: player.teamId,
            name: player.name,
            number: player.number,
            isCaptain: player.isCaptain,
            createdAt: new Date().toISOString()
          })
        }
      }

      // Delete removed players
      for (const playerId of deletedPlayerIds) {
        await db.players.delete(playerId)
      }

      // Delete removed events
      for (const eventId of deletedEventIds) {
        if (!String(eventId).startsWith('new_')) {
          await db.events.delete(eventId)
        }
      }

      // Add new events
      for (const event of newEvents) {
        await db.events.add({
          matchId: event.matchId,
          type: event.type,
          setIndex: event.setIndex,
          payload: event.payload,
          stateSnapshot: event.stateSnapshot,
          ts: event.ts,
          seq: event.seq
        })
      }

      // Update modified events
      for (const event of allEvents) {
        if (event.isModified && !String(event.id).startsWith('new_')) {
          await db.events.update(event.id, {
            payload: event.payload
          })
        }
      }

      // Queue for the cloud (also while offline / signed out)
      if (editedMatch?.seed_key) {
        await syncToSupabase()
      }

      showAlert(t('manualAdjustmentsEditor.saved', 'Changes saved successfully'), 'success')
      if (onSave) onSave(changes)
      if (onClose) onClose()
    } catch (error) {
      console.error('Error saving changes:', error)
      showAlert(t('manualAdjustmentsEditor.saveError', 'Error saving changes: ') + error.message, 'error')
    } finally {
      setSaving(false)
    }
  })

  // Queue the changes for the cloud (the sync queue sends them)
  const syncToSupabase = async () => {
    if (!editedMatch?.seed_key || editedMatch.test) return

    try {
      // Build set results for Supabase
      const setResults = editedSets.map(s => ({
        index: s.index,
        team1_points: s.team1Points,
        team2_points: s.team2Points,
        finished: s.finished
      }))

      // Build players arrays for Supabase
      const playersTeam1 = editedTeam1Players.map(p => ({
        number: p.number,
        first_name: p.firstName || p.name?.split(' ')[0] || '',
        last_name: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
        is_captain: p.isCaptain || false
      }))

      const playersTeam2 = editedTeam2Players.map(p => ({
        number: p.number,
        first_name: p.firstName || p.name?.split(' ')[0] || '',
        last_name: p.lastName || p.name?.split(' ').slice(1).join(' ') || '',
        is_captain: p.isCaptain || false
      }))

      // Build teams for Supabase
      const team1Data = editedTeam1 ? {
        name: editedTeam1.name,
        short_name: editedTeam1.shortName,
        color: editedTeam1.color
      } : null

      const team2Data = editedTeam2 ? {
        name: editedTeam2.name,
        short_name: editedTeam2.shortName,
        color: editedTeam2.color
      } : null

      // Through the sync queue (not a direct write): signed out or offline it
      // waits and retries, so the cloud record follows the local scoresheet.
      // The queue merges the JSONB columns (team1_data, officials, ...).
      await db.sync_queue.add({
        resource: 'match',
        action: 'update',
        payload: {
          id: editedMatch.seed_key,
          match_info: {
            hall: editedMatch.hall || '',
            city: editedMatch.city || '',
            league: editedMatch.league || '',
            championship_type: editedMatch.championshipType || ''
          },
          set_results: setResults,
          players_team1: playersTeam1,
          players_team2: playersTeam2,
          team1_data: team1Data,
          team2_data: team2Data,
          officials: editedOfficials,
          // the first server the swap kept, in the cloud coin toss
          ...(editedMatch._designationSwapped ? { coin_toss: coinTossCloud(editedMatch) } : {}),
          manual_changes: [...(editedMatch.manualChanges || []), ...changes]
        },
        ts: new Date().toISOString(),
        status: 'queued'
      })

    } catch (error) {
      console.error('Queueing the cloud update failed:', error)
    }
  }

  // ==================== RENDER HELPERS ====================
  const getEventsByType = (type) => allEvents.filter(e => e.type === type && !deletedEventIds.includes(e.id))
  const timeoutEvents = getEventsByType('timeout')
  const sanctionEvents = getEventsByType('sanction')

  // Get sanctions for a specific player
  const getPlayerSanctions = (playerNumber, team) => {
    return sanctionEvents.filter(e =>
      e.payload?.playerNumber === playerNumber &&
      e.payload?.team === team &&
      e.payload?.playerType === 'player'
    )
  }

  if (!data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ov-text-muted)' }}>
        {t('common.loading', 'Loading...')}
      </div>
    )
  }

  // Team A as edited (the team cards are team 1 / team 2)
  const teamAIsTeam1 = (editedMatch?.coinTossTeamA || 'team1') === 'team1'

  const tabs = [
    { id: 'corrections', label: t('corrections.title', 'Corrections') },
    { id: 'teams', label: t('manualAdjustmentsEditor.tabTeams', 'Teams & Players') },
    { id: 'info', label: t('manualAdjustmentsEditor.tabInfo', 'Match Info') }
  ]
  // An approved / final match is read-only here: reopen it at the match end first
  const closed = ['approved', 'final'].includes(data.match?.status) || data.match?.approved === true

  // The scoresheet window follows a correction at once
  const notifyScoresheet = () => {
    try {
      const channel = new BroadcastChannel('escoresheet-updates')
      channel.postMessage({ type: 'MANUAL_ADJUSTMENT', matchId, reason: 'correction' })
      channel.close()
    } catch { /* no BroadcastChannel */ }
  }

  // The scheduled date and time as the fields show them (local time)
  const scheduledLocal = localDateTime(editedMatch?.scheduledAt)

  // volleyui on inline styles (the --ov-* tokens): white fields with a stone
  // border, cards on the stone page, outline buttons, the red outline delete.
  const inputStyle = {
    padding: '8px 12px',
    minHeight: '40px',
    fontSize: '14px',
    background: 'var(--ov-card)',
    border: '1px solid var(--ov-hairline-strong)',
    borderRadius: 'var(--ov-radius)',
    color: 'var(--ov-text)'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    fontWeight: 500,
    color: 'var(--ov-text-secondary)'
  }

  const cardStyle = {
    padding: '16px',
    background: 'var(--ov-card)',
    border: '1px solid var(--ov-hairline-soft)',
    boxShadow: 'var(--ov-shadow-card)',
    borderRadius: 'var(--ov-radius-xl)',
    marginBottom: '16px'
  }

  const buttonStyle = {
    padding: '8px 16px',
    minHeight: '40px',
    fontSize: '13px',
    fontWeight: 600,
    background: 'var(--ov-card)',
    color: 'var(--ov-text-body)',
    border: '1px solid var(--ov-hairline-strong)',
    borderRadius: 'var(--ov-radius)',
    cursor: 'pointer'
  }

  const deleteButtonStyle = {
    padding: '6px 12px',
    minHeight: '36px',
    fontSize: '12px',
    fontWeight: 600,
    background: 'var(--ov-card)',
    color: 'var(--ov-danger-text)',
    border: '1px solid #fecaca',
    borderRadius: 'var(--ov-radius)',
    cursor: 'pointer'
  }

  return (
    <div
      className="ov-kit legacy-light fixed inset-0 overflow-auto bg-gradient-to-b from-stone-50 to-stone-100 text-stone-800"
      style={{ zIndex: 1000 }}
      data-testid="manual-adjustments"
    >
      {/* Header: the task page's title, Cancel and the emerald Save */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-4 py-3 sm:px-6">
        <h1 className="m-0 text-xl font-bold tracking-tight text-stone-900">
          {t('manualAdjustmentsEditor.title', 'Manual adjustments')}
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="xl" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="positive" size="xl" onClick={handleSave} disabled={saving || changes.length === 0} loading={saving}>
            {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')} {changes.length > 0 && <span className="tabular-nums">({changes.length})</span>}
          </Button>
        </div>
      </div>

      {/* Sections: a segmented control, not tabs */}
      <div className="border-b border-stone-200 bg-white/60 px-4 py-3 sm:px-6">
        <SegmentedControl
          className="max-w-2xl grid-cols-3"
          ariaLabel={t('manualAdjustmentsEditor.title', 'Manual adjustments')}
          options={tabs.map(tab => ({ value: tab.id, label: tab.label }))}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Content */}
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
        {/* ==================== CORRECTIONS TAB ==================== */}
        {/* Scores, time-outs, sanctions, remarks: planned, previewed and saved
            one by one (components_beach/corrections), never typed in */}
        {activeTab === 'corrections' && (
          <div style={{ maxWidth: '960px', margin: '0 auto' }}>
            <CorrectionsPanel
              mode="review"
              matchId={matchId}
              events={data.events}
              match={data.match}
              sets={data.sets}
              team1Team={data.team1}
              team2Team={data.team2}
              team1Players={data.team1Players}
              team2Players={data.team2Players}
              readOnly={closed}
              hooks={{ notifyScoresheetUpdate: notifyScoresheet }}
            />
          </div>
        )}

        {/* ==================== TEAMS & PLAYERS TAB ==================== */}
        {activeTab === 'teams' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))', gap: '24px' }}>
              {/* Team 1 Team */}
              <div>
                {/* Team Info */}
                <div style={cardStyle}>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--ov-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: editedTeam1?.color || '#888', display: 'inline-block' }} />
                    {/* the designation as edited: "Swap A/B" changes it, the cards stay team 1 / team 2 */}
                    {teamAIsTeam1
                      ? t('manualAdjustmentsEditor.teamATeam1', 'Team A (Team 1)')
                      : t('manualAdjustmentsEditor.teamBTeam1', 'Team B (Team 1)')}
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.name', 'Name')}</label>
                      <input
                        type="text"
                        value={editedTeam1?.name || ''}
                        onChange={(e) => updateTeam('name', e.target.value, true)}
                        style={{ ...inputStyle, width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.shortNameMax8', 'Short Name (max 8)')}</label>
                      <input
                        type="text"
                        maxLength={8}
                        value={editedTeam1?.shortName || ''}
                        onChange={(e) => updateTeam('shortName', e.target.value.toUpperCase(), true)}
                        style={{ ...inputStyle, width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.color', 'Color')}</label>
                      <select
                        value={editedTeam1?.color || '#3b82f6'}
                        onChange={(e) => updateTeam('color', e.target.value, true)}
                        style={{ ...inputStyle, width: '100%', background: 'var(--ov-card)' }}
                      >
                        {isOtherColour(editedTeam1?.color) && (
                          <option value={editedTeam1.color} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>
                            {otherColourLabel(t, editedTeam1.color)} ■
                          </option>
                        )}
                        {TEAM_COLORS.map(c => (
                          <option key={c.value} value={c.value} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>
                            {t(`manualAdjustmentsEditor.colors.${c.key}`, c.key)} ■
                          </option>
                        ))}
                      </select>
                      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '4px', background: editedTeam1?.color || '#3b82f6', border: '1px solid var(--ov-hairline-strong)' }} />
                        <span style={{ fontSize: '11px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.selected', 'Selected')}</span>
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.swapTeams', 'Swap Teams')}</label>
                      <button onClick={swapTeamDesignation} style={buttonStyle}>{t('manualAdjustmentsEditor.swapAB', 'Swap A/B')}</button>
                    </div>
                  </div>
                </div>

                {/* Players */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ov-text)' }}>{t('manualAdjustmentsEditor.players', 'Players')}</h3>
                    <button onClick={() => addPlayer(true)} style={buttonStyle}>{t('manualAdjustmentsEditor.addPlayer', '+ Add Player')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                    {editedTeam1Players.map(player => {
                      const playerSanctions = getPlayerSanctions(player.number, 'team1')
                      return (
                        <div key={player.id} style={{ padding: '10px', background: 'var(--ov-sunken)', borderRadius: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 1fr 90px', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={player.number}
                              onChange={(e) => updatePlayer(player.id, 'number', parseInt(e.target.value, 10) || 0, true)}
                              placeholder="#"
                              style={{ ...inputStyle, textAlign: 'center', padding: '6px' }}
                            />
                            <input
                              type="text"
                              value={player.firstName || ''}
                              onChange={(e) => updatePlayer(player.id, 'firstName', e.target.value, true)}
                              placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                              style={{ ...inputStyle, padding: '6px 8px' }}
                            />
                            <input
                              type="text"
                              value={player.lastName || ''}
                              onChange={(e) => updatePlayer(player.id, 'lastName', e.target.value, true)}
                              placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                              style={{ ...inputStyle, padding: '6px 8px' }}
                            />
                            <DateField
                              size="bare"
                              // 90px column: typed only (DD.MM.YYYY)
                              calendar={false}
                              value={toISODate(player.dob)}
                              onChange={(v) => updatePlayer(player.id, 'dob', v, true)}
                              aria-label={`#${player.number} ${t('roster.dateOfBirth')}`}
                              style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={player.isCaptain || false} onChange={(e) => updatePlayer(player.id, 'isCaptain', e.target.checked, true)} />
                              {t('manualAdjustmentsEditor.captain', 'Captain')}
                            </label>
                            <button onClick={() => removePlayer(player.id, true)} style={{ ...deleteButtonStyle, padding: '4px 8px', marginLeft: 'auto' }}>{t('manualAdjustmentsEditor.remove', 'Remove')}</button>
                          </div>
                          {/* Player sanctions (read-only): corrected in the Corrections tab */}
                          {playerSanctions.length > 0 && (
                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--ov-sunken-strong)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {playerSanctions.map(s => (
                                <span key={s.id} style={{ fontSize: '11px', color: 'var(--ov-danger-text)', background: 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {sanctionLabel(s.payload?.type, t)} ({t('manualAdjustmentsEditor.setN', { n: s.setIndex })})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>


              </div>

              {/* team2 Team */}
              <div>
                {/* Team Info */}
                <div style={cardStyle}>
                  <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--ov-text)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: editedTeam2?.color || '#888', display: 'inline-block' }} />
                    {teamAIsTeam1
                      ? t('manualAdjustmentsEditor.teamBTeam2', 'Team B (Team 2)')
                      : t('manualAdjustmentsEditor.teamATeam2', 'Team A (Team 2)')}
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.name', 'Name')}</label>
                      <input
                        type="text"
                        value={editedTeam2?.name || ''}
                        onChange={(e) => updateTeam('name', e.target.value, false)}
                        style={{ ...inputStyle, width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.shortNameMax8', 'Short Name (max 8)')}</label>
                      <input
                        type="text"
                        maxLength={8}
                        value={editedTeam2?.shortName || ''}
                        onChange={(e) => updateTeam('shortName', e.target.value.toUpperCase(), false)}
                        style={{ ...inputStyle, width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>{t('manualAdjustmentsEditor.color', 'Color')}</label>
                      <select
                        value={editedTeam2?.color || '#ef4444'}
                        onChange={(e) => updateTeam('color', e.target.value, false)}
                        style={{ ...inputStyle, width: '100%', background: 'var(--ov-card)' }}
                      >
                        {isOtherColour(editedTeam2?.color) && (
                          <option value={editedTeam2.color} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>
                            {otherColourLabel(t, editedTeam2.color)} ■
                          </option>
                        )}
                        {TEAM_COLORS.map(c => (
                          <option key={c.value} value={c.value} style={{ background: 'var(--ov-card)', color: 'var(--ov-text)' }}>
                            {t(`manualAdjustmentsEditor.colors.${c.key}`, c.key)} ■
                          </option>
                        ))}
                      </select>
                      <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '4px', background: editedTeam2?.color || '#ef4444', border: '1px solid var(--ov-hairline-strong)' }} />
                        <span style={{ fontSize: '11px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.selected', 'Selected')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Players */}
                <div style={cardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ov-text)' }}>{t('manualAdjustmentsEditor.players', 'Players')}</h3>
                    <button onClick={() => addPlayer(false)} style={buttonStyle}>{t('manualAdjustmentsEditor.addPlayer', '+ Add Player')}</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
                    {editedTeam2Players.map(player => {
                      const playerSanctions = getPlayerSanctions(player.number, 'team2')
                      return (
                        <div key={player.id} style={{ padding: '10px', background: 'var(--ov-sunken)', borderRadius: '6px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '45px 1fr 1fr 90px', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              value={player.number}
                              onChange={(e) => updatePlayer(player.id, 'number', parseInt(e.target.value, 10) || 0, false)}
                              placeholder="#"
                              style={{ ...inputStyle, textAlign: 'center', padding: '6px' }}
                            />
                            <input
                              type="text"
                              value={player.firstName || ''}
                              onChange={(e) => updatePlayer(player.id, 'firstName', e.target.value, false)}
                              placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                              style={{ ...inputStyle, padding: '6px 8px' }}
                            />
                            <input
                              type="text"
                              value={player.lastName || ''}
                              onChange={(e) => updatePlayer(player.id, 'lastName', e.target.value, false)}
                              placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                              style={{ ...inputStyle, padding: '6px 8px' }}
                            />
                            <DateField
                              size="bare"
                              // 90px column: typed only (DD.MM.YYYY)
                              calendar={false}
                              value={toISODate(player.dob)}
                              onChange={(v) => updatePlayer(player.id, 'dob', v, false)}
                              aria-label={`#${player.number} ${t('roster.dateOfBirth')}`}
                              style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', cursor: 'pointer' }}>
                              <input type="checkbox" checked={player.isCaptain || false} onChange={(e) => updatePlayer(player.id, 'isCaptain', e.target.checked, false)} />
                              {t('manualAdjustmentsEditor.captain', 'Captain')}
                            </label>
                            <button onClick={() => removePlayer(player.id, false)} style={{ ...deleteButtonStyle, padding: '4px 8px', marginLeft: 'auto' }}>{t('manualAdjustmentsEditor.remove', 'Remove')}</button>
                          </div>
                          {/* Player sanctions (read-only): corrected in the Corrections tab */}
                          {playerSanctions.length > 0 && (
                            <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--ov-sunken-strong)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              {playerSanctions.map(s => (
                                <span key={s.id} style={{ fontSize: '11px', color: 'var(--ov-danger-text)', background: 'rgba(239,68,68,0.12)', padding: '2px 6px', borderRadius: '4px' }}>
                                  {sanctionLabel(s.payload?.type, t)} ({t('manualAdjustmentsEditor.setN', { n: s.setIndex })})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>


              </div>
            </div>
          </div>
        )}

        {/* ==================== MATCH INFO TAB ==================== */}
        {activeTab === 'info' && editedMatch && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {/* Match Details */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--ov-text)' }}>
                {t('manualAdjustmentsEditor.matchDetails', 'Match Details')}
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.hall', 'Hall')}</label>
                  <input
                    type="text"
                    value={editedMatch.hall || ''}
                    onChange={(e) => updateMatchInfo('hall', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.city', 'City')}</label>
                  <input
                    type="text"
                    value={editedMatch.city || ''}
                    onChange={(e) => updateMatchInfo('city', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.league', 'League')}</label>
                  <input
                    type="text"
                    value={editedMatch.league || ''}
                    onChange={(e) => updateMatchInfo('league', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.championshipType', 'Championship Type')}</label>
                  <input
                    type="text"
                    value={editedMatch.championshipType || ''}
                    onChange={(e) => updateMatchInfo('championshipType', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.gameNumber', 'Game Number')}</label>
                  <input
                    type="text"
                    value={editedMatch.gameN || editedMatch.gameNumber || ''}
                    onChange={(e) => updateMatchInfo('gameN', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.status', 'Status')}</label>
                  <select
                    value={editedMatch.status || 'ended'}
                    onChange={(e) => updateMatchInfo('status', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  >
                    <option value="setup">{t('manualAdjustmentsEditor.statusSetup', 'Setup')}</option>
                    <option value="live">{t('manualAdjustmentsEditor.statusLive', 'Live')}</option>
                    <option value="ended">{t('manualAdjustmentsEditor.statusEnded', 'Ended')}</option>
                    <option value="approved">{t('manualAdjustmentsEditor.statusApproved', 'Approved')}</option>
                    <option value="final">{t('manualAdjustmentsEditor.statusFinal', 'Final')}</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>{t('manualAdjustmentsEditor.matchTypeGender', 'Match Type (Gender)')}</label>
                  <select
                    value={editedMatch.match_type_2 || 'M'}
                    onChange={(e) => updateMatchInfo('match_type_2', e.target.value)}
                    style={{ ...inputStyle, width: '100%' }}
                  >
                    <option value="M">{t('manualAdjustmentsEditor.genderMen', 'Men')}</option>
                    <option value="W">{t('manualAdjustmentsEditor.genderWomen', 'Women')}</option>
                    <option value="X">{t('manualAdjustmentsEditor.genderMixed', 'Mixed')}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ma-scheduled-date" style={labelStyle}>{t('manualAdjustmentsEditor.scheduledDate', 'Scheduled Date')}</label>
                  <DateField
                    id="ma-scheduled-date"
                    size="bare"
                    value={scheduledLocal.date}
                    onChange={(v) => {
                      if (scheduledLocal.time) scheduledTimeRef.current = scheduledLocal.time
                      if (v) {
                        updateMatchInfo('scheduledAt', new Date(`${v}T${scheduledLocal.time || scheduledTimeRef.current || '00:00'}:00`).toISOString())
                      } else {
                        updateMatchInfo('scheduledAt', null)
                      }
                    }}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <label htmlFor="ma-scheduled-time" style={labelStyle}>{t('manualAdjustmentsEditor.scheduledTime', 'Scheduled Time (24h)')}</label>
                  <TimeField
                    id="ma-scheduled-time"
                    size="bare"
                    // a scheduled match always has a time: no Clear, and half-typed text changes nothing
                    required
                    value={scheduledLocal.time}
                    onChange={(v) => {
                      if (!v) return
                      scheduledTimeRef.current = v
                      updateMatchInfo('scheduledAt', new Date(`${scheduledLocal.date || localDateTime(new Date()).date}T${v}:00`).toISOString())
                    }}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>
            </div>

            {/* Match Officials */}
            <div style={cardStyle}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--ov-text)' }}>
                {t('manualAdjustmentsEditor.matchOfficials', 'Match Officials')}
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* 1st Referee */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.firstReferee', '1st Referee')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                      value={editedOfficials.ref1.firstName}
                      onChange={(e) => updateOfficial('ref1', 'firstName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                      value={editedOfficials.ref1.lastName}
                      onChange={(e) => updateOfficial('ref1', 'lastName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.country', 'Country')}
                      value={editedOfficials.ref1.country}
                      onChange={(e) => updateOfficial('ref1', 'country', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <DateField
                      size="bare"
                      value={toISODate(editedOfficials.ref1.dob)}
                      onChange={(v) => updateOfficial('ref1', 'dob', v)}
                      aria-label={`${t('manualAdjustmentsEditor.firstReferee', '1st referee')} ${t('roster.dateOfBirth')}`}
                      style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                    />
                  </div>
                </div>

                {/* 2nd Referee */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.secondReferee', '2nd Referee')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 100px', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                      value={editedOfficials.ref2.firstName}
                      onChange={(e) => updateOfficial('ref2', 'firstName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                      value={editedOfficials.ref2.lastName}
                      onChange={(e) => updateOfficial('ref2', 'lastName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.country', 'Country')}
                      value={editedOfficials.ref2.country}
                      onChange={(e) => updateOfficial('ref2', 'country', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <DateField
                      size="bare"
                      value={toISODate(editedOfficials.ref2.dob)}
                      onChange={(v) => updateOfficial('ref2', 'dob', v)}
                      aria-label={`${t('manualAdjustmentsEditor.secondReferee', '2nd referee')} ${t('roster.dateOfBirth')}`}
                      style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                    />
                  </div>
                </div>

                {/* Scorer */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.scorer', 'Scorer')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                      value={editedOfficials.scorer.firstName}
                      onChange={(e) => updateOfficial('scorer', 'firstName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                      value={editedOfficials.scorer.lastName}
                      onChange={(e) => updateOfficial('scorer', 'lastName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <DateField
                      size="bare"
                      value={toISODate(editedOfficials.scorer.dob)}
                      onChange={(v) => updateOfficial('scorer', 'dob', v)}
                      aria-label={`${t('manualAdjustmentsEditor.scorer', 'Scorer')} ${t('roster.dateOfBirth')}`}
                      style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                    />
                  </div>
                </div>

                {/* Assistant Scorer */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', color: 'var(--ov-text-secondary)' }}>{t('manualAdjustmentsEditor.assistantScorer', 'Assistant Scorer')}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: '8px' }}>
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.firstName', 'First Name')}
                      value={editedOfficials.asstScorer.firstName}
                      onChange={(e) => updateOfficial('asstScorer', 'firstName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <input
                      type="text"
                      placeholder={t('manualAdjustmentsEditor.lastName', 'Last Name')}
                      value={editedOfficials.asstScorer.lastName}
                      onChange={(e) => updateOfficial('asstScorer', 'lastName', e.target.value)}
                      style={{ ...inputStyle, padding: '6px 8px' }}
                    />
                    <DateField
                      size="bare"
                      value={toISODate(editedOfficials.asstScorer.dob)}
                      onChange={(v) => updateOfficial('asstScorer', 'dob', v)}
                      aria-label={`${t('manualAdjustmentsEditor.assistantScorer', 'Assistant scorer')} ${t('roster.dateOfBirth')}`}
                      style={{ ...inputStyle, padding: '4px', fontSize: '11px' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Changes Log */}
        {changes.length > 0 && (
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(251, 191, 36, 0.1)', borderRadius: '8px', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: 'var(--ov-warning-text)' }}>
              {t('manualAdjustmentsEditor.pendingChanges', 'Pending Changes')} ({changes.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
              {changes.map((change, i) => (
                <div key={i} style={{ fontSize: '12px', color: 'var(--ov-text-secondary)' }}>
                  • {change.description}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
