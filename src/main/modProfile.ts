import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { CalendarConfig, ModProfile } from '@shared/types'

/** Optional per-mod config file at the mod's content root. */
export const MOD_PROFILE_FILE = 'ck3-tools.json'

function parseCalendar(raw: unknown): CalendarConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const obj = raw as Record<string, unknown>
  const epochYear = obj.epochYear
  if (typeof epochYear !== 'number' || !Number.isInteger(epochYear) || epochYear <= 0) return null
  return {
    epochYear,
    beforeLabel: typeof obj.beforeLabel === 'string' ? obj.beforeLabel : 'BC',
    afterLabel: typeof obj.afterLabel === 'string' ? obj.afterLabel : 'AD'
  }
}

/**
 * Read a mod's `ck3-tools.json`. Mod-authored content, so parsing is lenient:
 * anything missing or malformed degrades to null rather than erroring.
 */
export function readModProfile(modPath: string | null): ModProfile | null {
  if (!modPath) return null
  const file = join(modPath, MOD_PROFILE_FILE)
  if (!existsSync(file)) return null
  try {
    const raw: unknown = JSON.parse(readFileSync(file, 'utf-8'))
    if (typeof raw !== 'object' || raw === null) return null
    return { calendar: parseCalendar((raw as Record<string, unknown>).calendar) }
  } catch {
    return null
  }
}
