// Small pure helpers of the PDF score sheet (eScoresheet_beach.tsx).
// @ts-ignore - JS module
import { officialsList as sharedOfficialsList } from '../../src_beach/utils_beach/officials_beach.js';

/**
 * Capitalises each word, Unicode-aware: "müller" -> "Müller". The old
 * /\b\w/ treated "ü" as a word break and printed "MüLler" (video 07:24).
 * Only the first letter of a word changes; the rest stays as typed.
 */
export const capitalizeWords = (str: string) =>
  (str || '').replace(/(^|[\s\-'’/(])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

/**
 * A team name without a country code baked into it ("Müller/Weber (CHE)" ->
 * "Müller/Weber"): the sheet prints the country in its own box, so it
 * appeared twice (video 02:40, 07:24).
 */
export function cleanTeamName(name: string | null | undefined, country?: string | null) {
  let n = (name || '').trim();
  const c = (country || '').trim();
  if (c) {
    const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    n = n.replace(new RegExp(`\\s*\\(\\s*${esc}\\s*\\)\\s*$`, 'i'), '');
  }
  return n.trim();
}

/**
 * Minutes from start to end, or null when it cannot be a real duration: a
 * missing time, an end before the start, or longer than `maxMinutes` (a set
 * start left at the scheduled date gave "827890'", video 07:04).
 */
export function plausibleMinutes(start: string | number | Date | null | undefined, end: string | number | Date | null | undefined, maxMinutes = 180): number | null {
  if (start == null || end == null || start === '' || end === '') return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  const minutes = Math.round((e - s) / 60000);
  return minutes <= maxMinutes ? minutes : null;
}

/**
 * A match's officials as one list of { role, firstName, lastName, country,
 * dob, ... }: Match Setup keeps an array; an older manual adjustment saved an
 * object keyed ref1 / ref2 / scorer / asstScorer (and its cloud copy a merge
 * of both). The sheet read only the array, so after a manual adjustment its
 * APPROVAL box printed no official at all. The app's one reader of both
 * shapes (src_beach/utils_beach/officials_beach.js).
 */
export function officialsList(officials: unknown): any[] {
  return sharedOfficialsList(officials);
}
