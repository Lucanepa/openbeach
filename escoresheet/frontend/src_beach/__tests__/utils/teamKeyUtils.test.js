import { describe, it, expect } from 'vitest'
import {
  normalizeTeamKey,
  isTeam1,
  isTeam2,
  getOppositeTeam,
  normalizeEventTeam
} from '../../utils_beach/teamKeyUtils_beach'

describe('teamKeyUtils_beach', () => {
  describe('normalizeTeamKey', () => {
    it('should return team1 for team1', () => {
      expect(normalizeTeamKey('team1')).toBe('team1')
    })

    it('should return team2 for team2', () => {
      expect(normalizeTeamKey('team2')).toBe('team2')
    })

    it('should pass through unknown values unchanged', () => {
      expect(normalizeTeamKey('teamA')).toBe('teamA')
      expect(normalizeTeamKey('home')).toBe('home')
      expect(normalizeTeamKey('away')).toBe('away')
      expect(normalizeTeamKey('')).toBe('')
    })

    it('should handle null and undefined', () => {
      expect(normalizeTeamKey(null)).toBe(null)
      expect(normalizeTeamKey(undefined)).toBe(undefined)
    })
  })

  describe('isTeam1', () => {
    it('should return true for team1', () => {
      expect(isTeam1('team1')).toBe(true)
    })

    it('should return false for team2', () => {
      expect(isTeam1('team2')).toBe(false)
    })

    it('should return false for other values', () => {
      expect(isTeam1('home')).toBe(false)
      expect(isTeam1('')).toBe(false)
      expect(isTeam1(null)).toBe(false)
      expect(isTeam1(undefined)).toBe(false)
    })
  })

  describe('isTeam2', () => {
    it('should return true for team2', () => {
      expect(isTeam2('team2')).toBe(true)
    })

    it('should return false for team1', () => {
      expect(isTeam2('team1')).toBe(false)
    })

    it('should return false for other values', () => {
      expect(isTeam2('away')).toBe(false)
      expect(isTeam2('')).toBe(false)
      expect(isTeam2(null)).toBe(false)
      expect(isTeam2(undefined)).toBe(false)
    })
  })

  describe('getOppositeTeam', () => {
    it('should return team2 for team1', () => {
      expect(getOppositeTeam('team1')).toBe('team2')
    })

    it('should return team1 for team2', () => {
      expect(getOppositeTeam('team2')).toBe('team1')
    })

    it('should return team1 for unknown values (default branch)', () => {
      expect(getOppositeTeam('other')).toBe('team1')
    })
  })

  describe('normalizeEventTeam', () => {
    it('should normalize team key in event payload', () => {
      const event = { type: 'score', payload: { team: 'team1', points: 1 } }
      const result = normalizeEventTeam(event)
      expect(result.payload.team).toBe('team1')
      expect(result.payload.points).toBe(1)
      expect(result.type).toBe('score')
    })

    it('should preserve other event properties', () => {
      const event = { id: 1, type: 'score', payload: { team: 'team2', player: 'A' } }
      const result = normalizeEventTeam(event)
      expect(result.id).toBe(1)
      expect(result.type).toBe('score')
      expect(result.payload.team).toBe('team2')
      expect(result.payload.player).toBe('A')
    })

    it('should return event unchanged if no payload', () => {
      const event = { type: 'timeout' }
      expect(normalizeEventTeam(event)).toEqual(event)
    })

    it('should return event unchanged if no team in payload', () => {
      const event = { type: 'timeout', payload: { duration: 30 } }
      expect(normalizeEventTeam(event)).toEqual(event)
    })

    it('should return null/undefined events as-is', () => {
      expect(normalizeEventTeam(null)).toBe(null)
      expect(normalizeEventTeam(undefined)).toBe(undefined)
    })

    it('should not mutate the original event', () => {
      const event = { type: 'score', payload: { team: 'team1', points: 1 } }
      const result = normalizeEventTeam(event)
      expect(result).not.toBe(event)
      expect(result.payload).not.toBe(event.payload)
    })
  })
})
