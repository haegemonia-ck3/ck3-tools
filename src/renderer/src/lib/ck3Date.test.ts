import { describe, expect, it } from 'vitest'
import { isValidCK3Date } from './ck3Date'

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
