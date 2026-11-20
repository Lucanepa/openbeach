/**
 * A match's officials in one shape (2026-11-20).
 *
 * The app keeps them as Match Setup's list:
 *   [{ role: '1st referee', firstName, lastName, country, dob }, ...,
 *    { role: 'line judge 1', name }, ...]
 * Manual adjustments saved an object { ref1, ref2, scorer, asstScorer }
 * instead: the line judges were gone, the Scoreboard's officials.find(...)
 * threw on it, Match Setup showed no official at all (and saved none), and
 * the cloud copy merged it into the list it had ({ 0: ..., 1: ..., ref1: ... }).
 * Manual adjustments saves the list now; matches saved before keep the
 * object, so every reader goes through officialsList / findOfficial.
 */
import { cleanIdValue, idValueForSync } from './idValue_beach'

/** The object form's keys and the roles the list gives them. */
export const OFFICIAL_KEY_ROLES = Object.freeze({
  ref1: '1st referee',
  ref2: '2nd referee',
  scorer: 'scorer',
  asstScorer: 'assistant scorer'
})

// Role spellings seen in stored matches, by the role the list uses
const ROLE_ALIASES = {
  '1st referee': ['1st referee', 'ref1', '1st_referee', 'referee 1', 'first referee'],
  '2nd referee': ['2nd referee', 'ref2', '2nd_referee', 'referee 2', 'second referee'],
  scorer: ['scorer'],
  'assistant scorer': ['assistant scorer', 'asstscorer', 'assistant_scorer', 'asst scorer', 'asst. scorer']
}
const ROLE_OF_ALIAS = Object.fromEntries(
  Object.entries(ROLE_ALIASES).flatMap(([role, aliases]) => aliases.map(a => [a, role]))
)

/** A role as the list names it ('1st Referee', 'ref1' -> '1st referee'); other roles lower-cased. */
export function officialRole(role) {
  const r = String(role ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  return ROLE_OF_ALIAS[r] || r
}

const isEntry = (o) => !!o && typeof o === 'object' && !Array.isArray(o)

const PERSON_FIELDS = ['firstName', 'lastName', 'first_name', 'last_name', 'name', 'dob', 'country']
/** Anything typed in for an official (the object form kept all four roles, empty ones too). */
const hasPerson = (o) => PERSON_FIELDS.some(k => String(o?.[k] ?? '').trim() !== '')

/**
 * The officials as Match Setup's list, whatever the match stored: the list
 * as it is (without holes), the object form with the list's roles (empty
 * officials left out), and the cloud's merge of both: the list's entries
 * under "0", "1", ... with the object form's officials in place of the
 * same roles (they are the later edit). Anything else: no officials.
 */
export function officialsList(officials) {
  if (Array.isArray(officials)) return officials.filter(isEntry)
  if (!isEntry(officials)) return []
  const list = Object.keys(officials)
    .filter(k => /^\d+$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .map(k => officials[k])
    .filter(isEntry)
  for (const [key, role] of Object.entries(OFFICIAL_KEY_ROLES)) {
    const o = officials[key]
    if (!isEntry(o)) continue
    const at = list.findIndex(x => officialRole(x.role) === role)
    const rest = list.filter(x => officialRole(x.role) !== role)
    const entry = hasPerson(o) ? [{ ...o, role }] : []
    if (at < 0) list.splice(0, list.length, ...rest, ...entry)
    else list.splice(0, list.length, ...rest.slice(0, at), ...entry, ...rest.slice(at))
  }
  return list
}

/** The official of a role ('1st referee', 'ref1', 'line judge 2', ...), or null. */
export function findOfficial(officials, role) {
  const want = officialRole(role)
  return officialsList(officials).find(o => officialRole(o.role) === want) || null
}

/** An official's name: "First Last" (or a line judge's one name field). */
export function officialFullName(o) {
  if (!o) return ''
  const full = `${o.firstName || o.first_name || ''} ${o.lastName || o.last_name || ''}`.trim().replace(/\s+/g, ' ')
  return full || String(o.name || '').trim()
}

const MAIN_ROLES = Object.values(OFFICIAL_KEY_ROLES)
const filled = (v) => String(v ?? '').trim() !== ''

/**
 * The officials Manual adjustments saves: Match Setup's list with the edits
 * of the four main officials (`edited`: { ref1, ref2, scorer, asstScorer },
 * each { firstName, lastName, country?, dob }). The line judges and any other
 * official stay as stored, and so do the fields the screen does not edit (the
 * scorers' country). An official without a name is left out, as Match Setup
 * does. `cloud`: the cloud copy's spelling (first_name / last_name, a date
 * value as YYYY-MM-DD), as Match Setup sends it.
 */
export function officialsWithEdits(stored, edited, { cloud = false } = {}) {
  const list = officialsList(stored)
  const out = []
  for (const [key, role] of Object.entries(OFFICIAL_KEY_ROLES)) {
    const e = edited?.[key] || {}
    const { first_name, last_name, ...base } = list.find(o => officialRole(o.role) === role) || {}
    const firstName = e.firstName ?? base.firstName ?? first_name ?? ''
    const lastName = e.lastName ?? base.lastName ?? last_name ?? ''
    if (!filled(firstName) && !filled(lastName)) continue
    const country = ('country' in e ? e.country : base.country) || null
    const dob = 'dob' in e ? e.dob : base.dob
    out.push(cloud
      ? { role, first_name: firstName, last_name: lastName, country, dob: idValueForSync(dob) }
      : { ...base, role, firstName, lastName, country, dob: cleanIdValue(dob) || null })
  }
  return [...out, ...list.filter(o => !MAIN_ROLES.includes(officialRole(o.role)))]
}
