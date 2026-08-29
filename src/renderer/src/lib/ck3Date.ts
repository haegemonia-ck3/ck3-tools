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

// Deliberately lenient, like YEAR_RE: month and day are optional and trailing
// junk is ignored, so the typos real mod files carry ("3220.1.1.", "3212.1", a
// bare "3220") still compare sensibly.
const LENIENT_DATE_RE = /^(\d{1,4})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?/

/** Which end of an under-specified date to fill in: "3220" is all of year 3220. */
export type DateEdge = 'start' | 'end'

/**
 * Sortable number for a lenient CK3 date (year*10000 + month*100 + day), or
 * null when no year can be read. Missing parts are filled from `edge`, so a
 * bare "3220" is 3220.1.1 as a lower bound and 3220.12.31 as an upper one.
 */
export function dateSortKey(value: string, edge: DateEdge): number | null {
  const m = LENIENT_DATE_RE.exec(value.trim())
  if (!m) return null
  const month = m[2] !== undefined ? Number(m[2]) : edge === 'end' ? 12 : 1
  const day = m[3] !== undefined ? Number(m[3]) : edge === 'end' ? 31 : 1
  return Number(m[1]) * 10000 + month * 100 + day
}

export type DateRangeMode = 'before' | 'after' | 'between'

/**
 * A date-range filter. `from` is the lower bound and `to` the upper one, so a
 * mode switch keeps whichever bound still applies. Bounds are always raw file
 * dates — the era input converts on the way in and out.
 */
export interface DateRangeFilter {
  mode: DateRangeMode
  from: string
  to: string
}

export const emptyDateRange = (mode: DateRangeMode = 'before'): DateRangeFilter => ({
  mode,
  from: '',
  to: ''
})

/** True when the filter constrains nothing and should be dropped rather than stored. */
export function isEmptyDateRange(filter: DateRangeFilter): boolean {
  const from = dateSortKey(filter.from, 'start')
  const to = dateSortKey(filter.to, 'end')
  if (filter.mode === 'before') return to === null
  if (filter.mode === 'after') return from === null
  return from === null && to === null
}

/**
 * Whether a raw date falls in the range. An under-specified bound covers its
 * whole span: "before 3220" excludes all of 3220, "after 3220" starts at 3221,
 * and "between 3220 and 3230" spans both years end to end. A row with no date
 * never matches — an unknown birth can't be shown to be before anything.
 */
export function matchesDateRange(value: string | null, filter: DateRangeFilter): boolean {
  if (isEmptyDateRange(filter)) return true
  if (value === null) return false
  const key = dateSortKey(value, 'start')
  if (key === null) return false
  // Each bound is filled at the edge that pushes it away from the kept range,
  // so a bare year is excluded whole by before/after and included whole by
  // between.
  if (filter.mode === 'before') {
    const to = dateSortKey(filter.to, 'start')
    return to === null || key < to
  }
  if (filter.mode === 'after') {
    const from = dateSortKey(filter.from, 'end')
    return from === null || key > from
  }
  const from = dateSortKey(filter.from, 'start')
  const to = dateSortKey(filter.to, 'end')
  return (from === null || key >= from) && (to === null || key <= to)
}
