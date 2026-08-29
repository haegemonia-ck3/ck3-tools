import { app } from 'electron'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import type { DetectionResult, DirValidation, ModInfo } from '@shared/types'

// ---------- Validation ----------

/** A CK3 game data dir must contain these top-level folders. */
const GAME_DIR_MARKERS = ['common', 'events', 'localization', 'map_data']

export function validateGameDir(dir: string): DirValidation {
  if (!dir || !existsSync(dir)) {
    return { valid: false, reason: 'Directory does not exist' }
  }
  // Allow pointing at the install root and silently accept its `game` child
  const missing = GAME_DIR_MARKERS.filter((m) => !existsSync(join(dir, m)))
  if (missing.length === 0) return { valid: true, reason: null }
  return {
    valid: false,
    reason: `Not a CK3 game directory (missing: ${missing.join(', ')})`
  }
}

/** If the user picked the install root, resolve to its `game` subfolder. */
export function normalizeGameDir(dir: string): string {
  if (!validateGameDir(dir).valid && validateGameDir(join(dir, 'game')).valid) {
    return join(dir, 'game')
  }
  return dir
}

export function validateModDir(dir: string): DirValidation {
  if (!dir || !existsSync(dir)) {
    return { valid: false, reason: 'Directory does not exist' }
  }
  return { valid: true, reason: null }
}

// ---------- Steam / game dir detection ----------

function steamRootCandidates(): string[] {
  const candidates: string[] = []
  // Registry is the most reliable source on Windows
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'reg',
        ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
        { encoding: 'utf-8' }
      )
      const match = out.match(/SteamPath\s+REG_SZ\s+(.+)/)
      if (match) candidates.push(match[1].trim().replace(/\//g, '\\'))
    } catch {
      // registry key absent — fall through to default paths
    }
    candidates.push('C:\\Program Files (x86)\\Steam', 'C:\\Program Files\\Steam')
  } else if (process.platform === 'darwin') {
    candidates.push(join(app.getPath('home'), 'Library/Application Support/Steam'))
  } else {
    candidates.push(
      join(app.getPath('home'), '.steam/steam'),
      join(app.getPath('home'), '.local/share/Steam')
    )
  }
  return [...new Set(candidates)].filter((p) => existsSync(p))
}

/** Parse steamapps/libraryfolders.vdf to find every Steam library on the machine. */
function steamLibraries(): string[] {
  const libs = new Set<string>()
  for (const root of steamRootCandidates()) {
    libs.add(root)
    const vdf = join(root, 'steamapps', 'libraryfolders.vdf')
    if (!existsSync(vdf)) continue
    try {
      const text = readFileSync(vdf, 'utf-8')
      for (const m of text.matchAll(/"path"\s+"([^"]+)"/g)) {
        libs.add(m[1].replace(/\\\\/g, '\\'))
      }
    } catch {
      // unreadable vdf — ignore this library file
    }
  }
  return [...libs]
}

export function detectGameDir(): string | null {
  for (const lib of steamLibraries()) {
    const candidate = join(lib, 'steamapps', 'common', 'Crusader Kings III', 'game')
    if (validateGameDir(candidate).valid) return candidate
  }
  return null
}

// ---------- Mod dir detection ----------

export function detectModDir(): string | null {
  const candidates = [
    join(app.getPath('documents'), 'Paradox Interactive', 'Crusader Kings III', 'mod'),
    // Fallback in case Documents is redirected (e.g. OneDrive) but Paradox wrote to the raw profile path
    join(app.getPath('home'), 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod')
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  return null
}

export function detectPaths(): DetectionResult {
  return { gameDir: detectGameDir(), modDir: detectModDir() }
}

// ---------- Mod descriptor parsing ----------

/**
 * Parse a Paradox .mod descriptor. Format is line-based:
 *   key="value"            (replace_path may repeat)
 *   tags={ "A" "B" }       (possibly spanning multiple lines)
 */
function parseModDescriptor(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  for (const m of text.matchAll(/^\s*(\w+)\s*=\s*"([^"]*)"/gm)) {
    ;(result[m[1]] ??= []).push(m[2])
  }
  const tagsMatch = text.match(/tags\s*=\s*\{([\s\S]*?)\}/)
  if (tagsMatch) {
    result.tags = [...tagsMatch[1].matchAll(/"([^"]*)"/g)].map((m) => m[1])
  }
  return result
}

/**
 * A mod is "local" (editable) if its content folder lives inside the user's mod
 * directory. Workshop subscriptions point into steamapps/workshop/content and are
 * out of scope. Note: a local mod may still carry a remote_file_id if its author
 * uploaded it to the Workshop, so the id alone doesn't distinguish the two.
 */
function isLocalMod(modPath: string | null, modDir: string): boolean {
  if (!modPath) return false
  const normalize = (p: string): string =>
    p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  return normalize(modPath).startsWith(normalize(modDir) + '\\')
}

export function listMods(modDir: string): ModInfo[] {
  if (!modDir || !existsSync(modDir)) return []
  const mods: ModInfo[] = []
  for (const entry of readdirSync(modDir)) {
    if (!entry.toLowerCase().endsWith('.mod')) continue
    try {
      const parsed = parseModDescriptor(readFileSync(join(modDir, entry), 'utf-8'))
      const modPath = parsed.path?.[0] ?? null
      if (!isLocalMod(modPath, modDir)) continue
      mods.push({
        file: entry,
        name: parsed.name?.[0] ?? entry.replace(/\.mod$/i, ''),
        version: parsed.version?.[0] ?? null,
        supportedVersion: parsed.supported_version?.[0] ?? null,
        tags: parsed.tags ?? [],
        path: modPath,
        replacePaths: parsed.replace_path ?? [],
        pathExists: modPath ? existsSync(modPath) : false
      })
    } catch {
      // skip unreadable descriptors
    }
  }
  return mods.sort((a, b) => a.name.localeCompare(b.name))
}
