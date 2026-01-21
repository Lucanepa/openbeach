import { describe, it, expect } from 'vitest'
import { sanitizeForFilename, sanitizeSimple } from '../../utils_beach/stringUtils_beach'

describe('stringUtils_beach', () => {
  describe('sanitizeForFilename', () => {
    describe('basic functionality', () => {
      it('should return empty string for null/undefined input', () => {
        expect(sanitizeForFilename(null)).toBe('')
        expect(sanitizeForFilename(undefined)).toBe('')
        expect(sanitizeForFilename('')).toBe('')
      })

      it('should pass through simple alphanumeric strings', () => {
        expect(sanitizeForFilename('HelloWorld')).toBe('HelloWorld')
        expect(sanitizeForFilename('Test123')).toBe('Test123')
      })

      it('should replace spaces with underscores by default', () => {
        expect(sanitizeForFilename('Hello World')).toBe('Hello_World')
        expect(sanitizeForFilename('Test File Name')).toBe('Test_File_Name')
      })

      it('should collapse multiple spaces into single underscore', () => {
        expect(sanitizeForFilename('Hello    World')).toBe('Hello_World')
      })
    })

    describe('German umlaut handling', () => {
      it('should convert lowercase umlauts to two-letter equivalents', () => {
        expect(sanitizeForFilename('über')).toBe('ueber')
        expect(sanitizeForFilename('öffnen')).toBe('oeffnen')
        expect(sanitizeForFilename('ändern')).toBe('aendern')
      })

      it('should convert uppercase umlauts to two-letter equivalents', () => {
        expect(sanitizeForFilename('Über')).toBe('Ueber')
        expect(sanitizeForFilename('Österreich')).toBe('Oesterreich')
        expect(sanitizeForFilename('Änderung')).toBe('Aenderung')
      })

      it('should convert ß to ss', () => {
        expect(sanitizeForFilename('Straße')).toBe('Strasse')
        expect(sanitizeForFilename('Fußball')).toBe('Fussball')
      })

      it('should handle mixed umlauts correctly', () => {
        expect(sanitizeForFilename('Müller Straße')).toBe('Mueller_Strasse')
        expect(sanitizeForFilename('Günther Öztürk')).toBe('Guenther_Oeztuerk')
      })
    })

    describe('accent handling', () => {
      it('should remove French accents', () => {
        expect(sanitizeForFilename('café')).toBe('cafe')
        expect(sanitizeForFilename('résumé')).toBe('resume')
        expect(sanitizeForFilename('naïve')).toBe('naive')
        expect(sanitizeForFilename('Côte d\'Azur')).toBe('Cote_dAzur')
      })

      it('should remove Spanish accents', () => {
        expect(sanitizeForFilename('señor')).toBe('senor')
        expect(sanitizeForFilename('España')).toBe('Espana')
        expect(sanitizeForFilename('niño')).toBe('nino')
      })

      it('should remove Italian accents', () => {
        expect(sanitizeForFilename('città')).toBe('citta')
        expect(sanitizeForFilename('perché')).toBe('perche')
      })

      it('should handle Scandinavian characters', () => {
        // Note: ö is converted to oe (German umlaut)
        expect(sanitizeForFilename('Malmö')).toBe('Malmoe')
        // Note: ø is a separate character (not a combining accent) so it's removed entirely
        expect(sanitizeForFilename('København')).toBe('Kbenhavn')
      })
    })

    describe('special character handling', () => {
      it('should remove special characters', () => {
        expect(sanitizeForFilename('Hello!World')).toBe('HelloWorld')
        expect(sanitizeForFilename('Test@File#Name')).toBe('TestFileName')
        expect(sanitizeForFilename('File$%^&*()')).toBe('File')
      })

      it('should keep hyphens', () => {
        expect(sanitizeForFilename('hello-world')).toBe('hello-world')
      })

      it('should remove leading/trailing underscores and hyphens', () => {
        expect(sanitizeForFilename('_hello_')).toBe('hello')
        expect(sanitizeForFilename('-world-')).toBe('world')
        expect(sanitizeForFilename('__test__')).toBe('test')
      })

      it('should collapse multiple underscores/hyphens', () => {
        expect(sanitizeForFilename('hello---world')).toBe('hello_world')
        expect(sanitizeForFilename('test___file')).toBe('test_file')
      })
    })

    describe('options', () => {
      it('should respect keepSpacesAsUnderscores=false', () => {
        expect(sanitizeForFilename('Hello World', { keepSpacesAsUnderscores: false })).toBe('HelloWorld')
      })

      it('should respect maxLength option', () => {
        expect(sanitizeForFilename('ThisIsAVeryLongFilename', { maxLength: 10 })).toBe('ThisIsAVer')
        expect(sanitizeForFilename('Hello World', { maxLength: 5 })).toBe('Hello')
      })

      it('should not end with underscore after truncation', () => {
        expect(sanitizeForFilename('Hello World Test', { maxLength: 12 })).toBe('Hello_World')
      })
    })

    describe('edge cases', () => {
      it('should handle strings that become empty after sanitization', () => {
        expect(sanitizeForFilename('!!!@@@###')).toBe('')
        expect(sanitizeForFilename('___')).toBe('')
      })

      it('should handle very long strings', () => {
        const longStr = 'a'.repeat(1000)
        expect(sanitizeForFilename(longStr, { maxLength: 100 })).toBe('a'.repeat(100))
      })

      it('should handle real-world team names', () => {
        expect(sanitizeForFilename('FC Zürich')).toBe('FC_Zuerich')
        expect(sanitizeForFilename('Borussia Mönchengladbach')).toBe('Borussia_Moenchengladbach')
        expect(sanitizeForFilename('São Paulo FC')).toBe('Sao_Paulo_FC')
      })

      it('should handle real-world player names', () => {
        expect(sanitizeForFilename('José García')).toBe('Jose_Garcia')
        // Note: ð (eth) is removed as it's not a combining character, it's a separate letter
        expect(sanitizeForFilename('Björk Guðmundsdóttir')).toBe('Bjoerk_Gumundsdottir')
        expect(sanitizeForFilename('François Müller')).toBe('Francois_Mueller')
      })
    })
  })

  describe('sanitizeSimple', () => {
    describe('basic functionality', () => {
      it('should return empty string for null/undefined input', () => {
        expect(sanitizeSimple(null)).toBe('')
        expect(sanitizeSimple(undefined)).toBe('')
        expect(sanitizeSimple('')).toBe('')
      })

      it('should convert to uppercase', () => {
        expect(sanitizeSimple('hello')).toBe('HELLO')
        expect(sanitizeSimple('World')).toBe('WORLD')
      })

      it('should remove spaces entirely', () => {
        expect(sanitizeSimple('Hello World')).toBe('HELLOWORLD')
      })
    })

    describe('umlaut handling (uppercase conversion)', () => {
      it('should convert umlauts to uppercase equivalents', () => {
        expect(sanitizeSimple('über')).toBe('UEBER')
        expect(sanitizeSimple('öffnen')).toBe('OEFFNEN')
        expect(sanitizeSimple('ändern')).toBe('AENDERN')
        expect(sanitizeSimple('ß')).toBe('SS')
      })

      it('should handle mixed case umlauts', () => {
        expect(sanitizeSimple('Über')).toBe('UEBER')
        expect(sanitizeSimple('ÜBER')).toBe('UEBER')
      })
    })

    describe('maxLength handling', () => {
      it('should respect default maxLength of 15', () => {
        expect(sanitizeSimple('ThisIsAVeryLongStringThatShouldBeTruncated')).toBe('THISISAVERYLONG')
        expect(sanitizeSimple('a'.repeat(20))).toBe('A'.repeat(15))
      })

      it('should respect custom maxLength', () => {
        expect(sanitizeSimple('HelloWorld', 5)).toBe('HELLO')
        expect(sanitizeSimple('Test', 10)).toBe('TEST')
      })

      it('should handle maxLength of 0 (unlimited)', () => {
        const longStr = 'a'.repeat(100)
        expect(sanitizeSimple(longStr, 0)).toBe('A'.repeat(100))
      })
    })

    describe('special characters', () => {
      it('should remove all non-alphanumeric characters', () => {
        expect(sanitizeSimple('Hello-World')).toBe('HELLOWORLD')
        expect(sanitizeSimple('Test_File')).toBe('TESTFILE')
        expect(sanitizeSimple('Name@123!')).toBe('NAME123')
      })
    })

    describe('edge cases', () => {
      it('should handle strings that become empty', () => {
        expect(sanitizeSimple('---')).toBe('')
        expect(sanitizeSimple('!!!')).toBe('')
      })

      it('should handle real-world player names', () => {
        expect(sanitizeSimple('Müller')).toBe('MUELLER')
        expect(sanitizeSimple('García')).toBe('GARCIA')
        expect(sanitizeSimple('Björk')).toBe('BJOERK')
      })
    })
  })
})
