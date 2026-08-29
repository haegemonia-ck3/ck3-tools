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
