import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ddsToPngDataUrl } from './dds'

/**
 * The game's monochrome silhouette icons, addressed by bare name — gender
 * (`male`, `female`) and sexuality (`heterosexual`, …) among them. They are
 * black on transparent, so the renderer tints them rather than drawing them
 * directly.
 */
const FLAT_ICON_DIR = 'gfx/interface/icons/flat_icons'

// "<relDir>/<file>" -> data URL (or null); reset when the mod context changes
let cacheKey = ''
const iconCache = new Map<string, string | null>()

/** True when the mod's `replace_path` list takes over `relDir`, hiding game files. */
function isReplaced(replacePaths: string[], relDir: string): boolean {
  return replacePaths.some((rp) => {
    const nrp = rp.replace(/\\/g, '/').toLowerCase()
    return relDir === nrp || relDir.startsWith(nrp + '/')
  })
}

/**
 * Resolve `<relDir>/<fileName>` DDS icons to PNG data URLs, mod files winning
 * over game files. `files` maps result keys to file names; a null value means
 * "no icon" — missing, or a DDS variant the decoder doesn't handle.
 */
export function resolveIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  relDir: string,
  files: Map<string, string>
): Record<string, string | null> {
  const key = `${gameDir}|${modPath}`
  if (key !== cacheKey) {
    cacheKey = key
    iconCache.clear()
  }
  const replaced = isReplaced(replacePaths, relDir)

  const result: Record<string, string | null> = {}
  for (const [name, fileName] of files) {
    // Cached by file rather than by key, so two traits sharing an icon decode once
    const cacheId = `${relDir}/${fileName}`
    if (iconCache.has(cacheId)) {
      result[name] = iconCache.get(cacheId)!
      continue
    }
    const candidates: string[] = []
    if (modPath) candidates.push(join(modPath, ...relDir.split('/'), fileName))
    if (gameDir && !replaced) candidates.push(join(gameDir, ...relDir.split('/'), fileName))
    let url: string | null = null
    for (const candidate of candidates) {
      if (!existsSync(candidate)) continue
      try {
        url = ddsToPngDataUrl(readFileSync(candidate))
      } catch {
        url = null
      }
      if (url) break
    }
    iconCache.set(cacheId, url)
    result[name] = url
  }
  return result
}

/**
 * Flat icons are named after the value they depict, so unlike traits there is
 * no definition file remapping the file name.
 */
export function getFlatIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  names: string[]
): Record<string, string | null> {
  return resolveIcons(
    gameDir,
    modPath,
    replacePaths,
    FLAT_ICON_DIR,
    new Map(names.map((n) => [n, `${n}.dds`]))
  )
}
