import { existsSync, readFileSync } from 'fs'
import { decodeDds, encodePng } from './dds'
import { assetCandidates } from './icons'
import type { CharacterStats } from '@shared/types'

const ICON_REL_DIR = 'gfx/interface/icons'

/**
 * The six skills are engine constants, not moddable data — there is no
 * `common/…` folder defining them — so their icon sources are fixed too.
 * Per `gui/texticons.gui`, five of them are frames of a horizontal strip
 * (`icon_skills.dds`, one frame per sixth of its width, the last unused)
 * while prowess has its own file. A mod can still override either file, so
 * both go through the usual mod-over-game layering.
 */
const STRIP_FILE = 'icon_skills.dds'
const STRIP_FRAMES = 6
const STRIP_ORDER: (keyof CharacterStats)[] = [
  'diplomacy',
  'martial',
  'stewardship',
  'intrigue',
  'learning'
]
const OWN_FILE: Partial<Record<string, string>> = { prowess: 'icon_prowess.dds' }

/** Decodes the first readable candidate, cropping to frame `frame` of the strip if given. */
function iconUrl(paths: string[], frame: number | null): string | null {
  for (const path of paths) {
    if (!existsSync(path)) continue
    try {
      const decoded = decodeDds(readFileSync(path))
      if (!decoded) continue
      const { width, height, rgba } = decoded
      if (frame === null) {
        return `data:image/png;base64,${encodePng(width, height, rgba).toString('base64')}`
      }
      const fw = Math.floor(width / STRIP_FRAMES)
      if (fw === 0) continue
      const x0 = frame * fw
      const out = Buffer.alloc(fw * height * 4)
      for (let y = 0; y < height; y++) {
        rgba.copy(out, y * fw * 4, (y * width + x0) * 4, (y * width + x0 + fw) * 4)
      }
      return `data:image/png;base64,${encodePng(fw, height, out).toString('base64')}`
    } catch {
      // unreadable or undecodable — try the next candidate
    }
  }
  return null
}

// skill -> data URL (or null for no icon); reset when the mod context changes
let cacheKey = ''
const iconCache = new Map<string, string | null>()

export function getSkillIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  skills: string[]
): Record<string, string | null> {
  const key = `${gameDir}|${modPath}`
  if (key !== cacheKey) {
    cacheKey = key
    iconCache.clear()
  }
  const result: Record<string, string | null> = {}
  for (const skill of skills) {
    if (!iconCache.has(skill)) {
      const own = OWN_FILE[skill]
      const frame = own ? null : STRIP_ORDER.indexOf(skill as keyof CharacterStats)
      const paths =
        frame !== null && frame < 0
          ? [] // not a skill we know an icon for
          : assetCandidates(gameDir, modPath, replacePaths, ICON_REL_DIR, own ?? STRIP_FILE)
      iconCache.set(skill, iconUrl(paths, frame))
    }
    result[skill] = iconCache.get(skill)!
  }
  return result
}
