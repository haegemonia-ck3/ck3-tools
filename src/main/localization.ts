import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { Dirent } from 'fs'

/** Every .yml under `dir`, recursively. Missing directories yield nothing. */
export function ymlFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (d: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.toLowerCase().endsWith('.yml')) files.push(full)
    }
  }
  if (existsSync(dir)) walk(dir)
  return files
}

// `key:0 "Value"` — leading space optional (real files have entries at column
// 0), any version digit count; the greedy group ends at the LAST quote on the
// line so trailing comments after the closing quote are dropped
const LOC_LINE = /^\s*([A-Za-z0-9_.\-']+):\d*\s*"(.*)"/

export function parseLocFile(
  path: string,
  into: Map<string, string>,
  wanted?: (key: string) => boolean
): void {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
    const m = line.match(LOC_LINE)
    if (m && (wanted === undefined || wanted(m[1]))) into.set(m[1], m[2])
  }
}

/**
 * Localization key -> display text, mod entries layered over the game's.
 *
 * `gameSubdir` narrows the game-side scan to one folder of
 * `localization/english`; pass null to walk the whole tree (~1200 files, and
 * the only way to catch keys the DLC folders scatter around). `wanted` keeps
 * only the keys the caller will ask for, so a full-tree scan doesn't retain
 * a quarter-million entries.
 *
 * Only English is read: these names are editor labels, not game output.
 */
export function readLocalization(
  gameDir: string | null,
  modPath: string | null,
  gameSubdir: string | null,
  wanted?: (key: string) => boolean
): Map<string, string> {
  const loc = new Map<string, string>()
  if (gameDir) {
    const root = join(gameDir, 'localization', 'english')
    for (const file of ymlFiles(gameSubdir === null ? root : join(root, gameSubdir))) {
      parseLocFile(file, loc, wanted)
    }
  }
  if (modPath) {
    // Mods lay localization out however they like, so every .yml under the
    // mod's localization folder is fair game — filtered to English by path.
    const root = join(modPath, 'localization')
    for (const file of ymlFiles(root)) {
      if (file.slice(root.length).toLowerCase().includes('english')) parseLocFile(file, loc, wanted)
    }
  }
  return loc
}
