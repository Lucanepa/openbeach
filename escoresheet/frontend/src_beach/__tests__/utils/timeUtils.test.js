import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatTimeLocal,
  formatDateTimeLocal,
  parseLocalToISO,
  parseLocalDateTimeToISO,
  splitLocalDateTime,
  roundToMinute,
} from '../../utils_beach/timeUtils_beach'

describe('timeUtils_beach', () => {
  // Store original Date and timezone
  const RealDate = Date

  describe('formatTimeLocal', () => {
    it('should return empty string for null/undefined input', () => {
      expect(formatTimeLocal(null)).toBe('')
      expect(formatTimeLocal(undefined)).toBe('')
      expect(formatTimeLocal('')).toBe('')
    })

    it('should return empty string for invalid date', () => {
      expect(formatTimeLocal('invalid-date')).toBe('')
      expect(formatTimeLocal('not-a-date')).toBe('')
    })

    it('should format UTC time to local HH:MM', () => {
      // Create a known UTC time
      const utcTime = '2024-01-15T12:30:00Z'
      const result = formatTimeLocal(utcTime)

      // Result should be in HH:MM format
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })

    it('should pad single-digit hours and minutes', () => {
      // Midnight UTC
      const midnight = '2024-01-15T00:05:00Z'
      const result = formatTimeLocal(midnight)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
      // Should have leading zeros
      expect(result.split(':').every(part => part.length === 2)).toBe(true)
    })

    it('should handle midnight correctly', () => {
      const midnight = '2024-01-15T00:00:00Z'
      const result = formatTimeLocal(midnight)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })

    it('should handle end of day', () => {
      const endOfDay = '2024-01-15T23:59:00Z'
      const result = formatTimeLocal(endOfDay)
      expect(result).toMatch(/^\d{2}:\d{2}$/)
    })
  })

  describe('formatDateTimeLocal', () => {
    it('should return empty string for null/undefined input', () => {
      expect(formatDateTimeLocal(null)).toBe('')
      expect(formatDateTimeLocal(undefined)).toBe('')
      expect(formatDateTimeLocal('')).toBe('')
    })

    it('should return empty string for invalid date', () => {
      expect(formatDateTimeLocal('invalid')).toBe('')
    })

    it('should format UTC to local datetime-local format', () => {
      const utcTime = '2024-01-15T14:30:00Z'
      const result = formatDateTimeLocal(utcTime)

      // Should match YYYY-MM-DDTHH:MM format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('should handle date boundaries correctly', () => {
      // Just before midnight UTC
      const justBeforeMidnight = '2024-01-15T23:59:00Z'
      const result = formatDateTimeLocal(justBeforeMidnight)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('should handle leap year dates', () => {
      const leapDay = '2024-02-29T12:00:00Z'
      const result = formatDateTimeLocal(leapDay)
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })
  })

  describe('parseLocalToISO', () => {
    it('should return null for null/undefined input', () => {
      expect(parseLocalToISO(null)).toBe(null)
      expect(parseLocalToISO(undefined)).toBe(null)
      expect(parseLocalToISO('')).toBe(null)
    })

    it('should return null for invalid datetime', () => {
      expect(parseLocalToISO('invalid')).toBe(null)
      expect(parseLocalToISO('not-a-date')).toBe(null)
    })

    it('should parse local datetime-local format to ISO', () => {
      const localDateTime = '2024-01-15T14:30'
      const result = parseLocalToISO(localDateTime)

      // Should be a valid ISO string with Z suffix
      expect(result).toBeTruthy()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should create valid Date from result', () => {
      const localDateTime = '2024-01-15T14:30'
      const result = parseLocalToISO(localDateTime)
      const date = new Date(result)
      expect(date.getTime()).not.toBeNaN()
    })
  })

  describe('parseLocalDateTimeToISO', () => {
    it('should return null for null date', () => {
      expect(parseLocalDateTimeToISO(null)).toBe(null)
      expect(parseLocalDateTimeToISO('')).toBe(null)
    })

    it('should parse date and time to ISO', () => {
      const result = parseLocalDateTimeToISO('2024-01-15', '14:30')

      expect(result).toBeTruthy()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should default to 00:00 if time not provided', () => {
      const result = parseLocalDateTimeToISO('2024-01-15')

      expect(result).toBeTruthy()
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })

    it('should handle leap year correctly', () => {
      const result = parseLocalDateTimeToISO('2024-02-29', '12:00')
      expect(result).toBeTruthy()
    })

    it('should return null for invalid date', () => {
      expect(parseLocalDateTimeToISO('invalid-date', '12:00')).toBe(null)
    })
  })

  describe('splitLocalDateTime', () => {
    it('should return empty values for null/undefined input', () => {
      expect(splitLocalDateTime(null)).toEqual({ date: '', time: '' })
      expect(splitLocalDateTime(undefined)).toEqual({ date: '', time: '' })
      expect(splitLocalDateTime('')).toEqual({ date: '', time: '' })
    })

    it('should return empty values for invalid date', () => {
      expect(splitLocalDateTime('invalid')).toEqual({ date: '', time: '' })
    })

    it('should split ISO string into date and time', () => {
      const isoString = '2024-01-15T14:30:00Z'
      const result = splitLocalDateTime(isoString)

      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(result.time).toMatch(/^\d{2}:\d{2}$/)
    })

    it('should handle midnight UTC', () => {
      const midnight = '2024-01-15T00:00:00Z'
      const result = splitLocalDateTime(midnight)

      expect(result.date).toBeTruthy()
      expect(result.time).toBeTruthy()
    })

    it('should round-trip with parseLocalDateTimeToISO', () => {
      const originalISO = '2024-01-15T12:00:00.000Z'
      const split = splitLocalDateTime(originalISO)
      const reconverted = parseLocalDateTimeToISO(split.date, split.time)

      // Both should represent the same moment in time
      const originalDate = new Date(originalISO)
      const reconvertedDate = new Date(reconverted)

      // Allow for same minute (since we're dealing with seconds precision)
      expect(Math.abs(originalDate.getTime() - reconvertedDate.getTime())).toBeLessThan(60000)
    })
  })

  describe('roundToMinute', () => {
    it('should return null for null/undefined input', () => {
      expect(roundToMinute(null)).toBe(null)
      expect(roundToMinute(undefined)).toBe(null)
      expect(roundToMinute('')).toBe(null)
    })

    it('should return null for invalid date', () => {
      expect(roundToMinute('invalid')).toBe(null)
    })

    it('should zero out seconds and milliseconds', () => {
      const withSeconds = '2024-01-15T14:30:45.123Z'
      const result = roundToMinute(withSeconds)

      expect(result).toBe('2024-01-15T14:30:00.000Z')
    })

    it('should keep minutes and hours unchanged', () => {
      const original = '2024-01-15T14:30:59.999Z'
      const result = roundToMinute(original)

      expect(result).toBe('2024-01-15T14:30:00.000Z')
    })

    it('should handle already-rounded times', () => {
      const alreadyRounded = '2024-01-15T14:30:00.000Z'
      const result = roundToMinute(alreadyRounded)

      expect(result).toBe(alreadyRounded)
    })

    it('should handle edge cases at hour boundary', () => {
      const result = roundToMinute('2024-01-15T14:59:59.999Z')
      expect(result).toBe('2024-01-15T14:59:00.000Z')
    })

    it('should handle midnight', () => {
      const result = roundToMinute('2024-01-15T00:00:30.500Z')
      expect(result).toBe('2024-01-15T00:00:00.000Z')
    })
  })

  describe('timezone consistency', () => {
    it('should maintain consistency between format and parse operations', () => {
      // This tests the fundamental promise: parse(format(x)) ≈ x
      const originalISO = '2024-06-15T14:30:00.000Z' // Summer time
      const formatted = formatDateTimeLocal(originalISO)
      const parsed = parseLocalToISO(formatted)

      const originalDate = new Date(originalISO)
      const parsedDate = new Date(parsed)

      // Should be within the same minute
      expect(Math.abs(originalDate.getTime() - parsedDate.getTime())).toBeLessThan(60000)
    })

    it('should handle winter time dates', () => {
      const winterISO = '2024-01-15T14:30:00.000Z'
      const formatted = formatDateTimeLocal(winterISO)
      expect(formatted).toBeTruthy()
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })

    it('should handle summer time dates', () => {
      const summerISO = '2024-07-15T14:30:00.000Z'
      const formatted = formatDateTimeLocal(summerISO)
      expect(formatted).toBeTruthy()
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    })
  })
})
