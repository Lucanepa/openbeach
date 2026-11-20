// The value beside a person's name on a beach sheet (owner 19.11.2026): a
// licence number by default, a date of birth when it has a separator. The
// same rule as OpenVolley's Swiss sheet.
import { describe, it, expect, beforeEach } from 'vitest'
import { useMemoryLocalStorage } from '../helpers/memoryStorage'
import {
  isDateValue, normalizeDateValue, isPlaceholderValue, licenceOf, cleanIdValue, displayIdValue,
  typedIdValue, isJanuaryFirstDate, withoutDate, idValueForSync, ACCOUNT_LICENCE, readManageLicence, LICENCE_OPTION_KEY
} from '../../utils_beach/idValue_beach'

describe('isDateValue', () => {
  it('a date has a separator (., / or -) or is ISO', () => {
    for (const v of ['14.03.2008', '14/03/2008', '14-03-2008', '4.3.08', '2008-03-14', '2008-03-14T00:00:00.000Z', ' 14.03.2008 ']) {
      expect(isDateValue(v), v).toBe(true)
    }
  })
  it('digits, text and empties are not dates', () => {
    for (const v of ['123456', '1403200', '', null, undefined, 'abc', '12.3', '14.03', 123456]) {
      expect(isDateValue(v), String(v)).toBe(false)
    }
  })
})

describe('normalizeDateValue', () => {
  it('every date form becomes dd.mm.yyyy', () => {
    expect(normalizeDateValue('14.03.2008')).toBe('14.03.2008')
    expect(normalizeDateValue('14/03/2008')).toBe('14.03.2008')
    expect(normalizeDateValue('14-03-2008')).toBe('14.03.2008')
    expect(normalizeDateValue('4.3.2008')).toBe('04.03.2008')
    expect(normalizeDateValue('2008-03-14')).toBe('14.03.2008')
    expect(normalizeDateValue('2008-03-14T00:00:00.000Z')).toBe('14.03.2008')
  })
  it('a two-digit year: this century up to this year, the last one after it', () => {
    expect(normalizeDateValue('14.03.08')).toBe('14.03.2008')
    expect(normalizeDateValue('14.03.95')).toBe('14.03.1995')
  })
  it('not a date: empty', () => {
    expect(normalizeDateValue('123456')).toBe('')
    expect(normalizeDateValue(null)).toBe('')
  })
})

describe('licenceOf / cleanIdValue', () => {
  it('a licence keeps its digits, at most 10', () => {
    expect(licenceOf('123456')).toBe('123456')
    expect(licenceOf(' 12 34 56 ')).toBe('123456')
    expect(licenceOf('CH-12345')).toBe('12345')
    expect(licenceOf('123456789012')).toBe('1234567890')
    expect(licenceOf(98765)).toBe('98765')
  })
  it('a date is never a licence', () => {
    expect(licenceOf('14.03.2008')).toBe('')
    expect(licenceOf('2008-03-14')).toBe('')
  })
  it('cleanIdValue: a date as dd.mm.yyyy, a licence as digits, the 01.01.1900 placeholder as nothing', () => {
    expect(cleanIdValue('14/03/2008')).toBe('14.03.2008')
    expect(cleanIdValue('2008-03-14')).toBe('14.03.2008')
    expect(cleanIdValue('123456')).toBe('123456')
    expect(cleanIdValue('01.01.1900')).toBe('')
    expect(cleanIdValue('01/01/1900')).toBe('')
    expect(cleanIdValue('1900-01-01')).toBe('')
    expect(cleanIdValue('')).toBe('')
    expect(cleanIdValue(null)).toBe('')
    expect(cleanIdValue('abc')).toBe('')
  })
  it('isPlaceholderValue knows the placeholder in every form', () => {
    expect(isPlaceholderValue('01.01.1900')).toBe(true)
    expect(isPlaceholderValue('1900-01-01')).toBe(true)
    expect(isPlaceholderValue('1.1.1900')).toBe(true)
    expect(isPlaceholderValue('01.01.1990')).toBe(false)
    expect(isPlaceholderValue('19000101')).toBe(false)
    expect(isPlaceholderValue('')).toBe(false)
  })
})

describe('displayIdValue', () => {
  it('prints a licence verbatim and a date as dd.mm.yyyy', () => {
    expect(displayIdValue('123456')).toBe('123456')
    expect(displayIdValue('2008-03-14')).toBe('14.03.2008')
    expect(displayIdValue('14/03/2008')).toBe('14.03.2008')
    expect(displayIdValue('01.01.1900')).toBe('')
    expect(displayIdValue(null)).toBe('')
  })
})

describe('typedIdValue', () => {
  it('keeps digits and the date separators, 10 characters at most', () => {
    expect(typedIdValue('14.03.2008')).toBe('14.03.2008')
    expect(typedIdValue('12 34a5')).toBe('12345')
    expect(typedIdValue('12345678901234')).toBe('1234567890')
    expect(typedIdValue(null)).toBe('')
  })
})

describe('isJanuaryFirstDate', () => {
  it('a 1 January date (an import error, often), never a licence or the placeholder', () => {
    expect(isJanuaryFirstDate('01.01.2001')).toBe(true)
    expect(isJanuaryFirstDate('2001-01-01')).toBe(true)
    expect(isJanuaryFirstDate('01.01.1900')).toBe(false)
    expect(isJanuaryFirstDate('0101200')).toBe(false)
    expect(isJanuaryFirstDate('02.01.2001')).toBe(false)
  })
})

describe('withoutDate', () => {
  it('blanks a date and keeps a licence exactly as it is', () => {
    expect(withoutDate('14.03.2008')).toBe('')
    expect(withoutDate('2008-03-14')).toBe('')
    expect(withoutDate('01.01.1900')).toBe('')
    expect(withoutDate('123456')).toBe('123456')
    expect(withoutDate(' 0042 ')).toBe(' 0042 ')
    expect(withoutDate(null)).toBe(null)
    expect(withoutDate('')).toBe('')
  })
})

describe('idValueForSync', () => {
  it('the cloud copy: a licence verbatim, a date as YYYY-MM-DD, empty as null', () => {
    expect(idValueForSync('123456')).toBe('123456')
    expect(idValueForSync('14.03.2008')).toBe('2008-03-14')
    expect(idValueForSync('2008-03-14')).toBe('2008-03-14')
    expect(idValueForSync('01.01.1900')).toBe(null)
    expect(idValueForSync('')).toBe(null)
  })
})

describe('account licence', () => {
  it('4 to 7 digits', () => {
    expect(ACCOUNT_LICENCE.test('1234')).toBe(true)
    expect(ACCOUNT_LICENCE.test('1234567')).toBe(true)
    expect(ACCOUNT_LICENCE.test('123')).toBe(false)
    expect(ACCOUNT_LICENCE.test('12345678')).toBe(false)
    expect(ACCOUNT_LICENCE.test('12a4')).toBe(false)
  })
})

describe('the licence column setting', () => {
  beforeEach(() => { useMemoryLocalStorage() })
  it('keeps its first key, so a scorer who had dates of birth on keeps the column', () => {
    expect(LICENCE_OPTION_KEY).toBe('manageDob')
    localStorage.setItem('manageDob', 'true')
    expect(readManageLicence()).toBe(true)
  })

  // Owner 20.11.2026: "Licence numbers" on by default. Only the Options
  // switch writes the key (the old default off was never stored), so no key
  // is a device that never chose; 'false' is a scorer who turned it off.
  it('is on for a new install or a device that never touched the switch', () => {
    expect(localStorage.getItem('manageDob')).toBeNull()
    expect(readManageLicence()).toBe(true)
  })

  it('keeps a scorer\'s own choice: off stays off, on stays on', () => {
    localStorage.setItem('manageDob', 'false')
    expect(readManageLicence()).toBe(false)
    localStorage.setItem('manageDob', 'true')
    expect(readManageLicence()).toBe(true)
  })

  it('is on when the storage cannot be read (a private window)', () => {
    localStorage.getItem.mockImplementation(() => { throw new Error('SecurityError') })
    expect(readManageLicence()).toBe(true)
  })
})
