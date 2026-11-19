import { readSheet } from 'read-excel-file/browser'
import { licenceOf } from './idValue_beach'

/**
 * Parse a CSV string into an array of arrays (rows of cells).
 */
function parseCsvText(text) {
  const rows = []
  let row = []
  let cell = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { cell += ch }
    } else {
      if (ch === '"') { inQuote = true }
      else if (ch === ',') { row.push(cell); cell = '' }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        if (ch === '\r') i++
        row.push(cell); cell = ''
        if (row.some(c => c !== '')) rows.push(row)
        row = []
      } else { cell += ch }
    }
  }
  row.push(cell)
  if (row.some(c => c !== '')) rows.push(row)
  return rows
}

/**
 * Parse an Excel file (.xlsx) or CSV file into an array of row objects.
 */
export async function parseExcel(file) {
  const ext = file.name.toLowerCase().split('.').pop()

  let rawRows
  if (ext === 'csv') {
    const text = await file.text()
    rawRows = parseCsvText(text)
  } else {
    // the first sheet's rows (read-excel-file 8+: the default export reads
    // every sheet)
    rawRows = await readSheet(file)
  }

  if (rawRows.length < 2) return []
  const headers = rawRows[0].map(h => String(h ?? ''))
  return rawRows.slice(1).map(row => {
    const obj = {}
    headers.forEach((h, i) => {
      obj[h] = row[i] ?? ''
    })
    return obj
  })
}

/**
 * Normalize a column header for fuzzy matching.
 * Lowercase, strip non-alphanumeric, collapse spaces.
 */
function norm(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Find a value from a row by trying multiple possible column names.
 */
function findCol(row, normalizedRow, ...candidates) {
  for (const c of candidates) {
    const key = norm(c)
    if (normalizedRow[key] !== undefined) return normalizedRow[key]
  }
  // Direct key match as fallback
  for (const c of candidates) {
    if (row[c] !== undefined) return row[c]
  }
  return ''
}

/**
 * Build a normalized key map from a row for fast lookup.
 */
function buildNormalizedMap(row) {
  const map = {}
  for (const key of Object.keys(row)) {
    map[norm(key)] = row[key]
  }
  return map
}

/**
 * Format a date value from Excel into ISO date string.
 */
function formatDate(val) {
  if (!val) return null
  if (val instanceof Date) {
    return val.toISOString()
  }
  // Try parsing string dates in common formats
  const str = String(val).trim()
  // DD.MM.YYYY or DD/MM/YYYY
  const dmy = str.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/)
  if (dmy) {
    return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])).toISOString()
  }
  // YYYY-MM-DD
  const ymd = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (ymd) {
    return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3])).toISOString()
  }
  // Try native Date parse
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d.toISOString()
  return null
}

/**
 * Combine date and time values into a single ISO string.
 */
function combineDateTime(dateVal, timeVal) {
  const dateStr = formatDate(dateVal)
  if (!dateStr) return null

  if (timeVal) {
    const timeStr = String(timeVal).trim()
    // HH:MM or HH:MM:SS
    const tm = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (tm) {
      const d = new Date(dateStr)
      d.setUTCHours(+tm[1], +tm[2], tm[3] ? +tm[3] : 0)
      return d.toISOString()
    }
    // Excel might return a Date object for time
    if (timeVal instanceof Date) {
      const d = new Date(dateStr)
      d.setUTCHours(timeVal.getHours(), timeVal.getMinutes(), timeVal.getSeconds())
      return d.toISOString()
    }
  }
  return dateStr
}

/**
 * A licence cell: its digits (a number cell is read as one). A date (a
 * birthdate in the licence column, or a date cell) is never imported.
 */
function importLicence(val) {
  if (val == null || val === '' || val instanceof Date) return ''
  return licenceOf(typeof val === 'number' ? String(Math.trunc(val)) : val)
}

/**
 * Map a single Excel row to a beach_competition_matches record. The value
 * beside a person's name is the licence (columns "T1 Player 1 Licence",
 * "1st Referee Licence", ...), never a date of birth.
 */
export function mapExcelRowToCompMatch(row, userId) {
  const n = buildNormalizedMap(row)

  const competition = findCol(row, n, 'Competition', 'Competition Name', 'Event', 'Tournament', 'League')
  const gameN = findCol(row, n, 'Game #', 'Game', 'Match #', 'Match Number', 'Game Number', 'game_n', 'No')
  const dateVal = findCol(row, n, 'Date', 'Match Date')
  const timeVal = findCol(row, n, 'Time', 'Match Time', 'Start Time')
  const site = findCol(row, n, 'Site', 'City', 'Location', 'Venue')
  const beach = findCol(row, n, 'Beach', 'Hall', 'Facility')
  const court = findCol(row, n, 'Court', 'Court Number')
  const gender = findCol(row, n, 'Gender', 'Category', 'Type')
  const phase = findCol(row, n, 'Phase', 'Draw')
  const round = findCol(row, n, 'Round', 'Stage')
  const hasCoach = findCol(row, n, 'Has Coach', 'Coach')

  // Team 1
  const t1Name = findCol(row, n, 'Team 1 Name', 'Team 1', 'Team1', 'Home Team')
  const t1Short = findCol(row, n, 'Team 1 Short', 'T1 Short', 'Team1 Short')
  const t1Country = findCol(row, n, 'Team 1 Country', 'T1 Country', 'Team1 Country')
  const t1P1Num = findCol(row, n, 'T1 Player 1 #', 'T1 P1 #', 'Team1 Player1 Number', 'T1P1Num')
  const t1P1Last = findCol(row, n, 'T1 Player 1 Last', 'T1 P1 Last Name', 'Team1 Player1 Last', 'T1P1Last')
  const t1P1First = findCol(row, n, 'T1 Player 1 First', 'T1 P1 First Name', 'Team1 Player1 First', 'T1P1First')
  const t1P1Lic = findCol(row, n, 'T1 Player 1 Licence', 'T1 P1 Licence', 'Team1 Player1 Licence', 'T1P1Licence', 'T1 Player 1 License', 'T1P1License')
  const t1P2Num = findCol(row, n, 'T1 Player 2 #', 'T1 P2 #', 'Team1 Player2 Number', 'T1P2Num')
  const t1P2Last = findCol(row, n, 'T1 Player 2 Last', 'T1 P2 Last Name', 'Team1 Player2 Last', 'T1P2Last')
  const t1P2First = findCol(row, n, 'T1 Player 2 First', 'T1 P2 First Name', 'Team1 Player2 First', 'T1P2First')
  const t1P2Lic = findCol(row, n, 'T1 Player 2 Licence', 'T1 P2 Licence', 'Team1 Player2 Licence', 'T1P2Licence', 'T1 Player 2 License', 'T1P2License')

  // Team 2
  const t2Name = findCol(row, n, 'Team 2 Name', 'Team 2', 'Team2', 'Away Team')
  const t2Short = findCol(row, n, 'Team 2 Short', 'T2 Short', 'Team2 Short')
  const t2Country = findCol(row, n, 'Team 2 Country', 'T2 Country', 'Team2 Country')
  const t2P1Num = findCol(row, n, 'T2 Player 1 #', 'T2 P1 #', 'Team2 Player1 Number', 'T2P1Num')
  const t2P1Last = findCol(row, n, 'T2 Player 1 Last', 'T2 P1 Last Name', 'Team2 Player1 Last', 'T2P1Last')
  const t2P1First = findCol(row, n, 'T2 Player 1 First', 'T2 P1 First Name', 'Team2 Player1 First', 'T2P1First')
  const t2P1Lic = findCol(row, n, 'T2 Player 1 Licence', 'T2 P1 Licence', 'Team2 Player1 Licence', 'T2P1Licence', 'T2 Player 1 License', 'T2P1License')
  const t2P2Num = findCol(row, n, 'T2 Player 2 #', 'T2 P2 #', 'Team2 Player2 Number', 'T2P2Num')
  const t2P2Last = findCol(row, n, 'T2 Player 2 Last', 'T2 P2 Last Name', 'Team2 Player2 Last', 'T2P2Last')
  const t2P2First = findCol(row, n, 'T2 Player 2 First', 'T2 P2 First Name', 'Team2 Player2 First', 'T2P2First')
  const t2P2Lic = findCol(row, n, 'T2 Player 2 Licence', 'T2 P2 Licence', 'Team2 Player2 Licence', 'T2P2Licence', 'T2 Player 2 License', 'T2P2License')

  // Officials
  const ref1Last = findCol(row, n, '1st Referee Last', '1st Ref Last', 'Ref1 Last', '1stRefLast')
  const ref1First = findCol(row, n, '1st Referee First', '1st Ref First', 'Ref1 First', '1stRefFirst')
  const ref1Lic = findCol(row, n, '1st Referee Licence', '1st Ref Licence', 'Ref1 Licence', '1stRefLicence', '1st Referee License', 'Ref1 License')
  const ref2Last = findCol(row, n, '2nd Referee Last', '2nd Ref Last', 'Ref2 Last', '2ndRefLast')
  const ref2First = findCol(row, n, '2nd Referee First', '2nd Ref First', 'Ref2 First', '2ndRefFirst')
  const ref2Lic = findCol(row, n, '2nd Referee Licence', '2nd Ref Licence', 'Ref2 Licence', '2ndRefLicence', '2nd Referee License', 'Ref2 License')
  const scorerLast = findCol(row, n, 'Scorer Last', 'Scorer Last Name', 'ScorerLast')
  const scorerFirst = findCol(row, n, 'Scorer First', 'Scorer First Name', 'ScorerFirst')
  const scorerLic = findCol(row, n, 'Scorer Licence', 'ScorerLicence', 'Scorer License', 'ScorerLicense')

  // Normalize gender
  const genderNorm = norm(gender)
  let genderVal = ''
  if (genderNorm.includes('men') && !genderNorm.includes('women')) genderVal = 'men'
  else if (genderNorm.includes('women') || genderNorm.includes('female')) genderVal = 'women'
  else if (genderNorm === 'm') genderVal = 'men'
  else if (genderNorm === 'w' || genderNorm === 'f') genderVal = 'women'
  else genderVal = String(gender || '').toLowerCase()

  // Normalize phase
  const phaseNorm = norm(phase)
  let phaseVal = ''
  if (phaseNorm.includes('main')) phaseVal = 'main'
  else if (phaseNorm.includes('qual')) phaseVal = 'qualification'
  else phaseVal = String(phase || '').toLowerCase()

  // Normalize round
  const roundNorm = norm(round)
  let roundVal = ''
  if (roundNorm.includes('pool')) roundVal = 'pool'
  else if (roundNorm.includes('winner')) roundVal = 'winner'
  else if (roundNorm.includes('class')) roundVal = 'class'
  else if (roundNorm.includes('semi')) roundVal = 'semifinals'
  else if (roundNorm.includes('final') && !roundNorm.includes('semi')) roundVal = 'finals'
  else roundVal = String(round || '').toLowerCase()

  // Build players arrays
  // `dob` is the value beside the name: the licence (OpenVolley's Swiss sheet keeps it there too)
  const buildPlayer = (num, first, last, lic) => {
    if (!first && !last && !num) return null
    return {
      number: num ? parseInt(num, 10) || '' : '',
      first_name: String(first || ''),
      last_name: String(last || ''),
      dob: importLicence(lic),
      is_captain: false
    }
  }

  const playersTeam1 = [buildPlayer(t1P1Num, t1P1First, t1P1Last, t1P1Lic), buildPlayer(t1P2Num, t1P2First, t1P2Last, t1P2Lic)].filter(Boolean)
  const playersTeam2 = [buildPlayer(t2P1Num, t2P1First, t2P1Last, t2P1Lic), buildPlayer(t2P2Num, t2P2First, t2P2Last, t2P2Lic)].filter(Boolean)

  // Infer team name from player last names if not provided
  const inferName = (players) => {
    const names = players.map(p => p?.last_name).filter(Boolean)
    return names.length > 0 ? names.join('/') : ''
  }

  // Build officials array
  const DEFAULT_COUNTRY = 'CHE'
  const officials = []
  if (ref1First || ref1Last) officials.push({ role: '1st referee', firstName: String(ref1First || ''), lastName: String(ref1Last || ''), country: DEFAULT_COUNTRY, dob: importLicence(ref1Lic) })
  if (ref2First || ref2Last) officials.push({ role: '2nd referee', firstName: String(ref2First || ''), lastName: String(ref2Last || ''), country: DEFAULT_COUNTRY, dob: importLicence(ref2Lic) })
  if (scorerFirst || scorerLast) officials.push({ role: 'scorer', firstName: String(scorerFirst || ''), lastName: String(scorerLast || ''), country: DEFAULT_COUNTRY, dob: importLicence(scorerLic) })

  // Build has_coach boolean
  const hasCoachVal = hasCoach === true || norm(hasCoach) === 'yes' || norm(hasCoach) === 'true' || hasCoach === 1

  return {
    competition_name: String(competition || ''),
    game_n: gameN ? parseInt(gameN, 10) || null : null,
    scheduled_at: combineDateTime(dateVal, timeVal),
    match_info: {
      site: String(site || ''),
      beach: String(beach || ''),
      court: String(court || ''),
      gender: genderVal,
      phase: phaseVal,
      round: roundVal,
      has_coach: hasCoachVal
    },
    team1_data: {
      name: String(t1Name || inferName(playersTeam1)),
      short_name: '',
      country: String(t1Country || DEFAULT_COUNTRY)
    },
    team2_data: {
      name: String(t2Name || inferName(playersTeam2)),
      short_name: '',
      country: String(t2Country || DEFAULT_COUNTRY)
    },
    players_team1: playersTeam1,
    players_team2: playersTeam2,
    officials,
    status: 'template',
    created_by: userId || null,
    sport_type: 'beach'
  }
}

/**
 * Validate a mapped competition match record.
 * Returns an array of error strings (empty if valid).
 */
export function validateCompMatch(match, index) {
  const errors = []
  const prefix = `Row ${index + 1}`

  if (!match.competition_name) errors.push(`${prefix}: Competition name is required`)
  if (!match.match_info?.gender) errors.push(`${prefix}: Gender is required`)
  if (!match.match_info?.phase) errors.push(`${prefix}: Phase is required`)
  if (!match.match_info?.round) errors.push(`${prefix}: Round is required`)

  return errors
}
