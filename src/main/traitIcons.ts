import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { scanBlocks, scanScalars } from './pdx'
import { effectiveFiles } from './refdata'
import { ddsToPngDataUrl } from './dds'

const ICON_REL_DIR = 'gfx/interface/icons/traits'

/**
 * Trait definitions may name a custom icon file (`icon = reveler.dds`);
 * otherwise the icon is `<trait_key>.dds`. Dynamic icons (an `icon = { … }`
 * trigger block) fall back to the default name.
 */
function iconFileNames(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): Map<string, string> {
  const names = new Map<string, string>()
  for (const file of effectiveFiles(gameDir, modPath, replacePaths, 'common/traits')) {
    try {
      const text = readFileSync(file, 'utf-8')
      for (const block of scanBlocks(text)) {
        const icon = scanScalars(text.slice(block.bodyStart, block.bodyEnd)).get('icon')
        if (icon) names.set(block.key, icon)
      }
    } catch {
      // skip unreadable files
    }
  }
  return names
}

// path -> data URL (or null for undecodable); reset when the mod context changes
let cacheKey = ''
const iconCache = new Map<string, string | null>()
let namesCache: Map<string, string> | null = null

export function getTraitIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  traits: string[]
): Record<string, string | null> {
  const key = `${gameDir}|${modPath}`
  if (key !== cacheKey) {
    cacheKey = key
    iconCache.clear()
    namesCache = null
  }
  namesCache ??= iconFileNames(gameDir, modPath, replacePaths)

  const result: Record<string, string | null> = {}
  const replaced = replacePaths.some((rp) => {
    const nrp = rp.replace(/\\/g, '/').toLowerCase()
    return ICON_REL_DIR === nrp || ICON_REL_DIR.startsWith(nrp + '/')
  })
  for (const trait of traits) {
    if (iconCache.has(trait)) {
      result[trait] = iconCache.get(trait)!
      continue
    }
    const fileName = namesCache.get(trait) ?? `${trait}.dds`
    const candidates: string[] = []
    if (modPath) candidates.push(join(modPath, ...ICON_REL_DIR.split('/'), fileName))
    if (gameDir && !replaced) candidates.push(join(gameDir, ...ICON_REL_DIR.split('/'), fileName))
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
    iconCache.set(trait, url)
    result[trait] = url
  }
  return result
}
