import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { decodeDds, encodePng } from './dds'
import { STAT_KEYS } from './characters'
import type { CharacterStats } from '@shared/types'

const ICON_REL_DIR = 'gfx/interface/icons'

/**
 * The six skills are engine constants, not moddable data — there is no
 * `common/…` folder defining them — so their icon sources are fixed too.
 * Per `gui/texticons.gui`, five of them are frames of a horizontal strip
 * (`icon_skills.dds`, one frame per sixth of its width, the last frame
 * unused) while prowess has its own file. A mod can still override either
 * file, so both are resolved through the usual mod-over-game layering.
 */
const STRIP_FRAMES = 6
const STRIP_ORDER: (keyof CharacterStats)[] = [
  'diplomacy',
  'martial',
  'stewardship',
  'intrigue',
  'learning'
]
const OWN_FILE: Partial<Record<keyof CharacterStats, string>> = { prowess: 'icon_prowess.dds' }

/** Candidate paths for `gfx/interface/icons/<name>`, mod first. */
function candidates(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  name: string
): string[] {
  const replaced = replacePaths.some((rp) => {
    const nrp = rp.replace(/\\/g, '/').toLowerCase()
    return ICON_REL_DIR === nrp || ICON_REL_DIR.startsWith(nrp + '/')
  })
  const paths: string[] = []
  if (modPath) paths.push(join(modPath, ...ICON_REL_DIR.split('/'), name))
  if (gameDir && !replaced) paths.push(join(gameDir, ...ICON_REL_DIR.split('/'), name))
  return paths
}

/** Decodes the first readable candidate, taking frame `frame` of the strip if given. */
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

// The set is tiny and fixed, so one entry keyed by mod context suffices
let cacheKey = ''
let cached: Record<string, string | null> | null = null

export function getSkillIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): Record<string, string | null> {
  const key = `${gameDir}|${modPath}`
  if (key === cacheKey && cached) return cached
  const result: Record<string, string | null> = {}
  for (const skill of STAT_KEYS) {
    const own = OWN_FILE[skill]
    result[skill] = own
      ? iconUrl(candidates(gameDir, modPath, replacePaths, own), null)
      : iconUrl(
          candidates(gameDir, modPath, replacePaths, 'icon_skills.dds'),
          STRIP_ORDER.indexOf(skill)
        )
  }
  cacheKey = key
  cached = result
  return result
}
