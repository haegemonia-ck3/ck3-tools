import { describe, expect, it } from 'vitest'
import {
  formatCalendarDate,
  formatCalendarYear,
  fromCalendarInput,
  isValidCK3Date,
  toCalendarInput
} from './ck3Date'
import type { CalendarConfig } from '@shared/types'

describe('isValidCK3Date', () => {
  it('accepts well-formed dates', () => {
    expect(isValidCK3Date('1.1.1')).toBe(true)
    expect(isValidCK3Date('9999.12.31')).toBe(true)
    expect(isValidCK3Date('867.1.1')).toBe(true)
    expect(isValidCK3Date('1200.2.28')).toBe(true)
  })

  it('accepts Feb 29 on leap years', () => {
    expect(isValidCK3Date('2000.2.29')).toBe(true) // divisible by 400
    expect(isValidCK3Date('1996.2.29')).toBe(true) // divisible by 4, not 100
  })

  it('rejects Feb 29 on non-leap years', () => {
    expect(isValidCK3Date('1900.2.29')).toBe(false) // divisible by 100, not 400
    expect(isValidCK3Date('1997.2.29')).toBe(false) // not divisible by 4
  })

  it('rejects a month greater than 12', () => {
    expect(isValidCK3Date('1200.13.1')).toBe(false)
  })

  it('rejects a day beyond the month\'s length', () => {
    expect(isValidCK3Date('1200.4.31')).toBe(false) // April has 30 days
    expect(isValidCK3Date('1200.1.32')).toBe(false)
  })

  it('rejects a leading zero on month or day', () => {
    expect(isValidCK3Date('1200.01.1')).toBe(false)
    expect(isValidCK3Date('1200.1.01')).toBe(false)
  })

  it('rejects a month or day of zero', () => {
    expect(isValidCK3Date('1200.0.1')).toBe(false)
    expect(isValidCK3Date('1200.1.0')).toBe(false)
  })

  it('rejects a year with more than 4 digits', () => {
    expect(isValidCK3Date('12345.1.1')).toBe(false)
  })

  it('rejects a missing day', () => {
    expect(isValidCK3Date('1200.1')).toBe(false)
  })

  it('rejects malformed or non-numeric input', () => {
    expect(isValidCK3Date('')).toBe(false)
    expect(isValidCK3Date('abc')).toBe(false)
    expect(isValidCK3Date('1200.1.1.1')).toBe(false)
    expect(isValidCK3Date('1200-1-1')).toBe(false)
  })
})

// Hegemonia's convention: year 0 is 4000 BC, no year zero (3999 → 1 BC, 4000 → 1 AD)
const bcAd: CalendarConfig = { epochYear: 4000, beforeLabel: 'BC', afterLabel: 'AD' }

describe('formatCalendarYear', () => {
  it('converts years before the epoch', () => {
    expect(formatCalendarYear(3220, bcAd)).toBe('780 BC')
    expect(formatCalendarYear(0, bcAd)).toBe('4000 BC')
  })

  it('crosses the epoch with no year zero', () => {
    expect(formatCalendarYear(3999, bcAd)).toBe('1 BC')
    expect(formatCalendarYear(4000, bcAd)).toBe('1 AD')
    expect(formatCalendarYear(4780, bcAd)).toBe('781 AD')
  })

  it('honors custom era labels', () => {
    const custom: CalendarConfig = { epochYear: 100, beforeLabel: 'BF', afterLabel: 'AF' }
    expect(formatCalendarYear(88, custom)).toBe('12 BF')
  })
})

describe('formatCalendarDate', () => {
  it('reads the year from a full date', () => {
    expect(formatCalendarDate('3220.1.1', bcAd)).toBe('780 BC')
  })

  it('tolerates the typo forms found in real mod files', () => {
    expect(formatCalendarDate('3220.1.1.', bcAd)).toBe('780 BC')
    expect(formatCalendarDate('3212.1', bcAd)).toBe('788 BC')
    expect(formatCalendarDate('3220', bcAd)).toBe('780 BC')
  })

  it('returns null without a calendar or a readable year', () => {
    expect(formatCalendarDate('3220.1.1', null)).toBeNull()
    expect(formatCalendarDate(null, bcAd)).toBeNull()
    expect(formatCalendarDate('', bcAd)).toBeNull()
    expect(formatCalendarDate('abc', bcAd)).toBeNull()
  })
})

describe('toCalendarInput / fromCalendarInput', () => {
  it('rewrites the year era-relative, keeping the rest of the date verbatim', () => {
    expect(toCalendarInput('3220.1.1', bcAd)).toEqual({ text: '780.1.1', era: 'before' })
    expect(toCalendarInput('4779.6.3', bcAd)).toEqual({ text: '780.6.3', era: 'after' })
    // typo forms round-trip untouched past the year
    expect(toCalendarInput('3220.1.1.', bcAd)).toEqual({ text: '780.1.1.', era: 'before' })
    expect(toCalendarInput('3212.1', bcAd)).toEqual({ text: '788.1', era: 'before' })
  })

  it('converts era-relative text back to raw file dates', () => {
    expect(fromCalendarInput('780.1.1', 'before', bcAd)).toBe('3220.1.1')
    expect(fromCalendarInput('780.1.1', 'after', bcAd)).toBe('4779.1.1')
    expect(fromCalendarInput('1.1.1', 'before', bcAd)).toBe('3999.1.1')
    expect(fromCalendarInput('1.1.1', 'after', bcAd)).toBe('4000.1.1')
  })

  it('round-trips through both directions', () => {
    for (const raw of ['3220.1.1', '3999.12.31', '4000.1.1', '4780.2.2', '3220.1.1.', '3212.1']) {
      const converted = toCalendarInput(raw, bcAd)!
      expect(fromCalendarInput(converted.text, converted.era, bcAd)).toBe(raw)
    }
  })

  it('rejects input it cannot faithfully represent', () => {
    expect(toCalendarInput('abc', bcAd)).toBeNull()
    expect(fromCalendarInput('abc', 'before', bcAd)).toBeNull()
    expect(fromCalendarInput('', 'before', bcAd)).toBeNull()
    // a "before" year past the epoch would need a negative raw year
    expect(fromCalendarInput('4001.1.1', 'before', bcAd)).toBeNull()
    // and an "after" year past 9999 - epoch overflows the 4-digit raw year
    expect(fromCalendarInput('6001.1.1', 'after', bcAd)).toBeNull()
  })
})
