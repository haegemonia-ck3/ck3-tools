import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { resolveIcons } from './icons'

const ICON_REL_DIR = 'gfx/interface/icons/faith'

/**
 * Faith icons, addressed by the bare name a faith's `icon =` line gives
 * (`icon = rabbinism` -> `rabbinism.dds`). Unlike traits there is no definition
 * file remapping the name — the value IS the file stem.
 */
export function getFaithIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  icons: string[]
): Record<string, string | null> {
  return resolveIcons(
    gameDir,
    modPath,
    replacePaths,
    ICON_REL_DIR,
    new Map(icons.map((i) => [i, i.toLowerCase().endsWith('.dds') ? i : `${i}.dds`]))
  )
}

/**
 * Every icon name available to a faith: the stems of the .dds files in the
 * mod's icon folder and the game's, mod-side first so a name it overrides
 * still appears once. Feeds the icon picker, which is otherwise a bare text
 * field over a folder the user can't see.
 */
export function listFaithIcons(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): string[] {
  const replaced = replacePaths.some((rp) => {
    const nrp = rp.replace(/\\/g, '/').toLowerCase()
    return ICON_REL_DIR === nrp || ICON_REL_DIR.startsWith(nrp + '/')
  })
  const dirs: string[] = []
  if (modPath) dirs.push(join(modPath, ...ICON_REL_DIR.split('/')))
  if (gameDir && !replaced) dirs.push(join(gameDir, ...ICON_REL_DIR.split('/')))

  const names = new Set<string>()
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    try {
      for (const entry of readdirSync(dir)) {
        if (entry.toLowerCase().endsWith('.dds')) names.add(entry.slice(0, -4))
      }
    } catch {
      // skip unreadable folders
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}
