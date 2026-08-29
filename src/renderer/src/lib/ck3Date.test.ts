import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatCalendarYear, isValidCK3Date } from './ck3Date'
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
