import { describe, expect, it } from 'vitest'
import {
  dateSortKey,
  emptyDateRange,
  formatCalendarDate,
  formatCalendarYear,
  fromCalendarInput,
  isEmptyDateRange,
  isValidCK3Date,
  matchesDateRange,
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

describe('dateSortKey', () => {
  it('orders dates numerically, not lexically', () => {
    expect(dateSortKey('900.1.1', 'start')!).toBeLessThan(dateSortKey('2410.1.1', 'start')!)
    expect(dateSortKey('3220.2.1', 'start')!).toBeLessThan(dateSortKey('3220.10.1', 'start')!)
  })

  it('fills a missing month and day from the requested edge', () => {
    expect(dateSortKey('3220', 'start')).toBe(dateSortKey('3220.1.1', 'start'))
    expect(dateSortKey('3220', 'end')).toBe(dateSortKey('3220.12.31', 'start'))
    expect(dateSortKey('3220.5', 'end')).toBe(dateSortKey('3220.5.31', 'start'))
  })

  it('tolerates the typos real mod files carry', () => {
    expect(dateSortKey('3220.1.1.', 'start')).toBe(dateSortKey('3220.1.1', 'start'))
    expect(dateSortKey(' 3212.1 ', 'start')).toBe(dateSortKey('3212.1.1', 'start'))
  })

  it('returns null when no year can be read', () => {
    expect(dateSortKey('', 'start')).toBeNull()
    expect(dateSortKey('yes', 'start')).toBeNull()
  })
})

describe('isEmptyDateRange', () => {
  it('treats a fresh range as empty', () => {
    expect(isEmptyDateRange(emptyDateRange())).toBe(true)
    expect(isEmptyDateRange(emptyDateRange('between'))).toBe(true)
  })

  it('ignores the bound a mode does not use', () => {
    expect(isEmptyDateRange({ mode: 'before', from: '3220', to: '' })).toBe(true)
    expect(isEmptyDateRange({ mode: 'after', from: '', to: '3220' })).toBe(true)
    expect(isEmptyDateRange({ mode: 'before', from: '', to: '3220' })).toBe(false)
    expect(isEmptyDateRange({ mode: 'after', from: '3220', to: '' })).toBe(false)
  })

  it('accepts a one-sided between', () => {
    expect(isEmptyDateRange({ mode: 'between', from: '3220', to: '' })).toBe(false)
  })
})

describe('matchesDateRange', () => {
  it('keeps every row while the range is empty', () => {
    expect(matchesDateRange('3220.1.1', emptyDateRange())).toBe(true)
    expect(matchesDateRange(null, emptyDateRange())).toBe(true)
  })

  it('drops rows with no date once a bound is set', () => {
    expect(matchesDateRange(null, { mode: 'before', from: '', to: '3220' })).toBe(false)
  })

  it('excludes a bare year whole from before and after', () => {
    const before = { mode: 'before', from: '', to: '3220' } as const
    expect(matchesDateRange('3219.12.31', before)).toBe(true)
    expect(matchesDateRange('3220.1.1', before)).toBe(false)
    expect(matchesDateRange('3220.12.31', before)).toBe(false)

    const after = { mode: 'after', from: '3220', to: '' } as const
    expect(matchesDateRange('3220.1.1', after)).toBe(false)
    expect(matchesDateRange('3220.12.31', after)).toBe(false)
    expect(matchesDateRange('3221.1.1', after)).toBe(true)
  })

  it('compares a fully specified bound exactly', () => {
    expect(matchesDateRange('3220.5.2', { mode: 'before', from: '', to: '3220.5.3' })).toBe(true)
    expect(matchesDateRange('3220.5.3', { mode: 'before', from: '', to: '3220.5.3' })).toBe(false)
    expect(matchesDateRange('3220.5.4', { mode: 'after', from: '3220.5.3', to: '' })).toBe(true)
    expect(matchesDateRange('3220.5.3', { mode: 'after', from: '3220.5.3', to: '' })).toBe(false)
  })

  it('includes both bare-year bounds whole in between', () => {
    const range = { mode: 'between', from: '3220', to: '3230' } as const
    expect(matchesDateRange('3219.12.31', range)).toBe(false)
    expect(matchesDateRange('3220.1.1', range)).toBe(true)
    expect(matchesDateRange('3230.12.31', range)).toBe(true)
    expect(matchesDateRange('3231.1.1', range)).toBe(false)
  })

  it('leaves a one-sided between unconstrained on the open end', () => {
    expect(matchesDateRange('9999.1.1', { mode: 'between', from: '3220', to: '' })).toBe(true)
    expect(matchesDateRange('1.1.1', { mode: 'between', from: '', to: '3220' })).toBe(true)
  })

  it('matches nothing when the bounds are backwards', () => {
    expect(matchesDateRange('3225.1.1', { mode: 'between', from: '3230', to: '3220' })).toBe(false)
  })
})
