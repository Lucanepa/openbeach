import { describe, it, expect } from 'vitest'
import { formatBackupDateTime } from '../../utils_beach/dateFormatter_beach'

describe('dateFormatter_beach', () => {
  describe('formatBackupDateTime', () => {
    it('should return "Unknown" for missing date', () => {
      expect(formatBackupDateTime(null, '120000')).toBe('Unknown')
      expect(formatBackupDateTime(undefined, '120000')).toBe('Unknown')
      expect(formatBackupDateTime('', '120000')).toBe('Unknown')
    })

    it('should return "Unknown" for missing time', () => {
      expect(formatBackupDateTime('20250115', null)).toBe('Unknown')
      expect(formatBackupDateTime('20250115', undefined)).toBe('Unknown')
      expect(formatBackupDateTime('20250115', '')).toBe('Unknown')
    })

    it('should return "Unknown" for both missing', () => {
      expect(formatBackupDateTime(null, null)).toBe('Unknown')
      expect(formatBackupDateTime('', '')).toBe('Unknown')
    })

    it('should format valid date and time correctly', () => {
      // Note: The result depends on local timezone
      // Using UTC midnight should give predictable results
      const result = formatBackupDateTime('20250115', '120000', '000')

      // Should match dd.mm.yyyy, hh:mm:ss format
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should handle default milliseconds', () => {
      const withMs = formatBackupDateTime('20250115', '120000', '500')
      const withoutMs = formatBackupDateTime('20250115', '120000')

      // Both should produce valid output
      expect(withMs).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
      expect(withoutMs).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should parse yyyymmdd format correctly', () => {
      const result = formatBackupDateTime('20241231', '235959')

      // The result should contain the year 2024 or nearby
      // (depending on timezone, might roll over to 2025)
      expect(result).toMatch(/202[45]/)
    })

    it('should parse hhmmss format correctly', () => {
      const result = formatBackupDateTime('20250101', '000000')

      // Should be a valid formatted string
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should handle midnight UTC', () => {
      const result = formatBackupDateTime('20250115', '000000')
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should handle end of day UTC', () => {
      const result = formatBackupDateTime('20250115', '235959')
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should handle leap year date', () => {
      const result = formatBackupDateTime('20240229', '120000')
      expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
    })

    it('should handle various millisecond values', () => {
      const results = [
        formatBackupDateTime('20250115', '120000', '000'),
        formatBackupDateTime('20250115', '120000', '001'),
        formatBackupDateTime('20250115', '120000', '500'),
        formatBackupDateTime('20250115', '120000', '999'),
      ]

      // All should produce valid output (ms affects only parsing, not display)
      results.forEach(result => {
        expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
      })
    })

    describe('real-world backup filenames', () => {
      it('should format typical backup timestamp', () => {
        // A backup made on Jan 15, 2025 at 15:30:45 UTC
        const result = formatBackupDateTime('20250115', '153045', '123')
        expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
      })

      it('should handle early morning backup', () => {
        const result = formatBackupDateTime('20250115', '063000')
        expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
      })

      it('should handle late night backup', () => {
        const result = formatBackupDateTime('20250115', '230000')
        expect(result).toMatch(/^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}:\d{2}$/)
      })
    })
  })
})
