/**
 * Team Key Utilities
 *
 * This module provides utilities for normalizing team keys between
 * legacy 'home'/'team2' format and the new 'team1'/'team2' format.
 *
 * Beach volleyball uses Team 1/Team 2 terminology, not Home/team2.
 */

/**
 * Normalize a team key from legacy format to new format.
 * - 'home' → 'team1'
 * - 'team2' → 'team2'
 * - Other values pass through unchanged
 *
 * @param {string} teamKey - The team key to normalize
 * @returns {string} The normalized team key
 */
export function normalizeTeamKey(teamKey) {
  if (teamKey === 'home') return 'team1'
  if (teamKey === 'team2') return 'team2'
  return teamKey
}

/**
 * Check if a team key refers to Team 1 (accepts both old and new formats).
 *
 * @param {string} teamKey - The team key to check
 * @returns {boolean} True if the team key refers to Team 1
 */
export function isTeam1(teamKey) {
  return teamKey === 'home' || teamKey === 'team1'
}

/**
 * Check if a team key refers to Team 2 (accepts both old and new formats).
 *
 * @param {string} teamKey - The team key to check
 * @returns {boolean} True if the team key refers to Team 2
 */
export function isTeam2(teamKey) {
  return teamKey === 'team2' || teamKey === 'team2'
}

/**
 * Get the opposite team key.
 *
 * @param {string} teamKey - The team key
 * @returns {string} The opposite team key ('team1' ↔ 'team2')
 */
export function getOppositeTeam(teamKey) {
  const normalized = normalizeTeamKey(teamKey)
  return normalized === 'team1' ? 'team2' : 'team1'
}

/**
 * Normalize an event payload's team field.
 * Used when reading legacy events from the database.
 *
 * @param {Object} event - The event object
 * @returns {Object} The event with normalized team key
 */
export function normalizeEventTeam(event) {
  if (!event?.payload?.team) return event
  return {
    ...event,
    payload: {
      ...event.payload,
      team: normalizeTeamKey(event.payload.team)
    }
  }
}
