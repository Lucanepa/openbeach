/**
 * One-time clean-up of the dates of birth this device still keeps (owner
 * decision 19.11.2026: the licence number is the identity; past sheets lose
 * their birthdates too). Runs once at start-up, in the background:
 *   - the cached profile (localStorage cachedProfile) and the cached saved
 *     teams lose their dob key;
 *   - every match that is over (ended, final, approved) loses the dates in
 *     its people: the players of its two teams, its officials and the
 *     correction-log entries of a dob. Licences stay as they are;
 *   - the device's referee and scorer lists lose their dates too.
 * A match still in progress (in setup, at the coin toss, being scored) is
 * left alone: its sheet is not done yet and the scorer may have typed a
 * date on purpose. Its draft in match_setup is left alone as well.
 * Never throws and never blocks the start (main_beach.jsx does not await
 * it); the flag is set only when every step ran.
 */

import { db as defaultDb } from './db_beach'
import { isDateValue, withoutDate } from '../utils_beach/idValue_beach'

export const DOB_CLEANUP_FLAG = 'ob-dob-cleanup-v1'
export const FINISHED_STATUSES = ['ended', 'final', 'approved']

/** Is the match still being set up or scored (left alone by the clean-up)? */
export function isMatchInProgress(match) {
  return !FINISHED_STATUSES.includes(match?.status)
}

/** A person without a date value; the same object when nothing changes. */
export function scrubPerson(person) {
  if (!person || typeof person !== 'object' || !isDateValue(person.dob)) return person
  return { ...person, dob: withoutDate(person.dob) }
}

/** A person row without its dob key at all (saved teams, the profile). */
export function dropDob(person) {
  if (!person || typeof person !== 'object' || !('dob' in person)) return person
  const { dob: _dob, ...rest } = person
  return rest
}

const DATE_IN_TEXT = /\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/g

/** A correction-log entry of a dob without its dates (in before, after and the sentence). */
export function scrubManualChange(change) {
  if (!change || typeof change !== 'object') return change
  const field = String(change.field ?? '')
  if (field !== 'dob' && !field.endsWith('.dob')) return change
  const next = { ...change, before: withoutDate(change.before), after: withoutDate(change.after) }
  if (typeof change.description === 'string') next.description = change.description.replace(DATE_IN_TEXT, '–')
  return next
}

const changedList = (before, after) => after.some((p, i) => p !== before[i])

/**
 * The match row's people without dates: a patch for db.matches.update, or
 * null when there is nothing to change.
 */
export function matchPatch(match) {
  const patch = {}
  if (Array.isArray(match?.officials)) {
    const officials = match.officials.map(scrubPerson)
    if (changedList(match.officials, officials)) patch.officials = officials
  } else if (match?.officials && typeof match.officials === 'object') {
    // Manual adjustments keep the officials as { ref1, ref2, scorer, asstScorer }
    const entries = Object.entries(match.officials)
    const scrubbed = entries.map(([role, o]) => [role, scrubPerson(o)])
    if (scrubbed.some(([, o], i) => o !== entries[i][1])) patch.officials = Object.fromEntries(scrubbed)
  }
  if (Array.isArray(match?.manualChanges)) {
    const changes = match.manualChanges.map(scrubManualChange)
    if (changedList(match.manualChanges, changes)) patch.manualChanges = changes
  }
  return Object.keys(patch).length ? patch : null
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** The cached profile without its dob (true when it had one). */
export function cleanCachedProfile(storage = globalThis.localStorage) {
  const cached = readJson(storage, 'cachedProfile')
  if (!cached || typeof cached !== 'object' || !('dob' in cached)) return false
  try {
    storage.setItem('cachedProfile', JSON.stringify(dropDob(cached)))
    return true
  } catch {
    return false
  }
}

/**
 * Run every step once. Counts what changed (no names, no values).
 * @returns {Promise<{matches: number, players: number, savedTeams: number, directory: number, profile: boolean}>}
 */
export async function cleanDeviceBirthdates({ db = defaultDb, storage = globalThis.localStorage } = {}) {
  const counts = { matches: 0, players: 0, savedTeams: 0, directory: 0, profile: false }
  counts.profile = cleanCachedProfile(storage)

  await db.transaction('rw', db.saved_teams, async () => {
    await db.saved_teams.toCollection().modify(row => {
      const players = Array.isArray(row.players) ? row.players.map(dropDob) : row.players
      const staff = Array.isArray(row.staff) ? row.staff.map(dropDob) : row.staff
      const changed = (Array.isArray(row.players) && changedList(row.players, players)) ||
        (Array.isArray(row.staff) && changedList(row.staff, staff))
      if (!changed) return
      row.players = players
      row.staff = staff
      counts.savedTeams++
    })
  })

  await db.transaction('rw', db.matches, db.players, async () => {
    const matches = await db.matches.toArray()
    // A team of a match in progress is never touched, even when an ended
    // match shares it (test seeds)
    const busyTeams = new Set()
    for (const m of matches) {
      if (isMatchInProgress(m)) for (const id of [m.team1Id, m.team2Id]) if (id != null) busyTeams.add(id)
    }
    const doneTeams = new Set()
    for (const m of matches) {
      if (isMatchInProgress(m)) continue
      const patch = matchPatch(m)
      if (patch) {
        await db.matches.update(m.id, patch)
        counts.matches++
      }
      for (const id of [m.team1Id, m.team2Id]) if (id != null && !busyTeams.has(id)) doneTeams.add(id)
    }
    if (doneTeams.size) {
      await db.players.where('teamId').anyOf([...doneTeams]).modify(p => {
        if (!isDateValue(p.dob)) return
        p.dob = withoutDate(p.dob)
        counts.players++
      })
    }
  })

  await db.transaction('rw', db.referees, db.scorers, async () => {
    for (const table of [db.referees, db.scorers]) {
      await table.toCollection().modify(p => {
        if (!isDateValue(p.dob)) return
        p.dob = withoutDate(p.dob)
        counts.directory++
      })
    }
  })

  return counts
}

/**
 * The start-up call: once per device (the flag), never throws, never awaited
 * by the start. A failed run tries again at the next start.
 * @returns {Promise<object|null>} the counts, or null when skipped or failed
 */
export async function runDobCleanupOnce({ db = defaultDb, storage = globalThis.localStorage } = {}) {
  try {
    if (storage?.getItem(DOB_CLEANUP_FLAG)) return null
  } catch {
    // storage blocked: run anyway (every step is idempotent)
  }
  try {
    const counts = await cleanDeviceBirthdates({ db, storage })
    try { storage?.setItem(DOB_CLEANUP_FLAG, new Date().toISOString()) } catch { /* storage blocked */ }
    if (counts.matches || counts.players || counts.savedTeams || counts.directory || counts.profile) {
      console.info('[dobCleanup] dates of birth removed:', JSON.stringify(counts))
    }
    return counts
  } catch (e) {
    console.warn('[dobCleanup] skipped:', e?.message)
    return null
  }
}
