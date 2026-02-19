import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database module
const mockDb = {
  matches: {
    get: vi.fn(),
    update: vi.fn()
  }
}

vi.mock('../../db_beach/db_beach', () => ({
  db: mockDb
}))

import {
  generateSessionId,
  getSessionId,
  checkMatchSession,
  lockMatchSession,
  unlockMatchSession,
  verifyGamePin
} from '../../utils_beach/sessionManager_beach'

describe('sessionManager_beach', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.getItem.mockReturnValue(null)
    window.localStorage.setItem.mockImplementation(() => {})
  })

  describe('generateSessionId', () => {
    it('should return cached session from localStorage if available', () => {
      window.localStorage.getItem.mockReturnValue('cached-session-id')
      const result = generateSessionId()
      expect(result).toBe('cached-session-id')
    })

    it('should generate new session ID when none cached', () => {
      window.localStorage.getItem.mockReturnValue(null)
      const result = generateSessionId()
      expect(typeof result).toBe('string')
      expect(result.length).toBeGreaterThan(0)
    })

    it('should store generated session ID in localStorage', () => {
      window.localStorage.getItem.mockReturnValue(null)
      const result = generateSessionId()
      expect(window.localStorage.setItem).toHaveBeenCalledWith('escoresheet_session_id', result)
    })

    it('should generate session ID with multiple parts separated by dashes', () => {
      window.localStorage.getItem.mockReturnValue(null)
      const result = generateSessionId()
      const parts = result.split('-')
      expect(parts.length).toBe(3)
    })
  })

  describe('getSessionId', () => {
    it('should delegate to generateSessionId', () => {
      window.localStorage.getItem.mockReturnValue('test-session')
      expect(getSessionId()).toBe('test-session')
    })
  })

  describe('checkMatchSession', () => {
    it('should return unlocked for null matchId', async () => {
      const result = await checkMatchSession(null)
      expect(result).toEqual({ locked: false, sessionId: null, isCurrentSession: false })
    })

    it('should return unlocked for undefined matchId', async () => {
      const result = await checkMatchSession(undefined)
      expect(result).toEqual({ locked: false, sessionId: null, isCurrentSession: false })
    })

    it('should return unlocked when match not found', async () => {
      mockDb.matches.get.mockResolvedValue(null)
      const result = await checkMatchSession('match-1')
      expect(result).toEqual({ locked: false, sessionId: null, isCurrentSession: false })
    })

    it('should return unlocked when match has no sessionId', async () => {
      mockDb.matches.get.mockResolvedValue({ id: 'match-1' })
      const result = await checkMatchSession('match-1')
      expect(result).toEqual({ locked: false, sessionId: null, isCurrentSession: false })
    })

    it('should return isCurrentSession when match sessionId matches current', async () => {
      window.localStorage.getItem.mockReturnValue('my-session')
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', sessionId: 'my-session' })
      const result = await checkMatchSession('match-1')
      expect(result.locked).toBe(false)
      expect(result.isCurrentSession).toBe(true)
      expect(result.sessionId).toBe('my-session')
    })

    it('should return locked when match sessionId differs from current', async () => {
      window.localStorage.getItem.mockReturnValue('my-session')
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', sessionId: 'other-session' })
      const result = await checkMatchSession('match-1')
      expect(result.locked).toBe(true)
      expect(result.isCurrentSession).toBe(false)
      expect(result.sessionId).toBe('other-session')
    })

    it('should return unlocked on database error', async () => {
      mockDb.matches.get.mockRejectedValue(new Error('DB error'))
      const result = await checkMatchSession('match-1')
      expect(result).toEqual({ locked: false, sessionId: null, isCurrentSession: false })
    })
  })

  describe('lockMatchSession', () => {
    it('should return false for null matchId', async () => {
      expect(await lockMatchSession(null)).toBe(false)
    })

    it('should update match with current session ID', async () => {
      window.localStorage.getItem.mockReturnValue('my-session')
      mockDb.matches.update.mockResolvedValue(1)
      const result = await lockMatchSession('match-1')
      expect(result).toBe(true)
      expect(mockDb.matches.update).toHaveBeenCalledWith('match-1', { sessionId: 'my-session' })
    })

    it('should return false on database error', async () => {
      window.localStorage.getItem.mockReturnValue('my-session')
      mockDb.matches.update.mockRejectedValue(new Error('DB error'))
      const result = await lockMatchSession('match-1')
      expect(result).toBe(false)
    })
  })

  describe('unlockMatchSession', () => {
    it('should return false for null matchId', async () => {
      expect(await unlockMatchSession(null)).toBe(false)
    })

    it('should update match with null sessionId', async () => {
      mockDb.matches.update.mockResolvedValue(1)
      const result = await unlockMatchSession('match-1')
      expect(result).toBe(true)
      expect(mockDb.matches.update).toHaveBeenCalledWith('match-1', { sessionId: null })
    })

    it('should return false on database error', async () => {
      mockDb.matches.update.mockRejectedValue(new Error('DB error'))
      const result = await unlockMatchSession('match-1')
      expect(result).toBe(false)
    })
  })

  describe('verifyGamePin', () => {
    it('should return false for null matchId', async () => {
      expect(await verifyGamePin(null, '1234')).toBe(false)
    })

    it('should return false when match not found', async () => {
      mockDb.matches.get.mockResolvedValue(null)
      expect(await verifyGamePin('match-1', '1234')).toBe(false)
    })

    it('should return false for test matches', async () => {
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', test: true, gamePin: '1234' })
      expect(await verifyGamePin('match-1', '1234')).toBe(false)
    })

    it('should return true when match has no gamePin (backward compatibility)', async () => {
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', test: false })
      expect(await verifyGamePin('match-1', '1234')).toBe(true)
    })

    it('should return true for correct pin', async () => {
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', test: false, gamePin: '5678' })
      expect(await verifyGamePin('match-1', '5678')).toBe(true)
    })

    it('should return false for incorrect pin', async () => {
      mockDb.matches.get.mockResolvedValue({ id: 'match-1', test: false, gamePin: '5678' })
      expect(await verifyGamePin('match-1', '1234')).toBe(false)
    })

    it('should return false on database error', async () => {
      mockDb.matches.get.mockRejectedValue(new Error('DB error'))
      expect(await verifyGamePin('match-1', '1234')).toBe(false)
    })
  })
})
