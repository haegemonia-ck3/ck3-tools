import type { CalendarConfig } from '@shared/types'

const DATE_RE = /^(\d{1,4})\.([1-9]\d?)\.([1-9]\d?)$/
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

/** Validates a CK3-style date string: {year}.{month}.{day}, no leading zeros, real calendar dates only. */
export function isValidCK3Date(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month > 12) return false
  const maxDay = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]
  return day <= maxDay
}

// Deliberately laxer than DATE_RE: converted years should still show for the
// tolerated typos in real mod files ("3220.1.1.", "3212.1", a bare "3220").
const YEAR_RE = /^(\d{1,4})(?:\.|$)/

/** Era-style year under an offset calendar, with no year zero: 3220 → "780 BC", 4000 → "1 AD". */
export function formatCalendarYear(year: number, calendar: CalendarConfig): string {
  return year < calendar.epochYear
    ? `${calendar.epochYear - year} ${calendar.beforeLabel}`
    : `${year - calendar.epochYear + 1} ${calendar.afterLabel}`
}

/**
 * Converted display year for a raw CK3 date string, or null when the mod has
 * no calendar config or the year can't be read. Display-only — raw dates stay
 * the editable source of truth.
 */
export function formatCalendarDate(
  value: string | null,
  calendar: CalendarConfig | null
): string | null {
  if (!calendar || !value) return null
  const m = YEAR_RE.exec(value.trim())
  return m ? formatCalendarYear(Number(m[1]), calendar) : null
}

export type CalendarEra = 'before' | 'after'

export interface CalendarInputValue {
  /** The date with its year rewritten era-relative: raw "3220.1.1" → "780.1.1" */
  text: string
  era: CalendarEra
}

// Splits the year off a date-ish string, keeping the rest (".1.1", a trailing
// typo dot, …) verbatim so converting there and back is lossless.
const LEADING_YEAR_RE = /^(\d{1,4})([\s\S]*)$/

/** Raw file date → era-relative editing form, or null when no year can be read. */
export function toCalendarInput(value: string, calendar: CalendarConfig): CalendarInputValue | null {
  const m = LEADING_YEAR_RE.exec(value.trim())
  if (!m) return null
  const year = Number(m[1])
  return year < calendar.epochYear
    ? { text: `${calendar.epochYear - year}${m[2]}`, era: 'before' }
    : { text: `${year - calendar.epochYear + 1}${m[2]}`, era: 'after' }
}

/**
 * Era-relative text back to a raw file date. Null when no year can be read or
 * the year doesn't fit the raw 0–9999 range (e.g. a "before" year beyond the
 * epoch) — callers should drop the edit rather than store something misread.
 */
export function fromCalendarInput(
  text: string,
  era: CalendarEra,
  calendar: CalendarConfig
): string | null {
  const m = LEADING_YEAR_RE.exec(text.trim())
  if (!m) return null
  const year = Number(m[1])
  const raw = era === 'before' ? calendar.epochYear - year : calendar.epochYear + year - 1
  if (raw < 0 || raw > 9999) return null
  return `${raw}${m[2]}`
}
