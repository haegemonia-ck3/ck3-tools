import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, sep } from 'path'
import { scanBlocks } from './pdx'
import type { ReferenceData } from '@shared/types'

/**
 * How CK3 layers mod content over the base game, at the granularity we need:
 * - A mod file with the same relative path as a game file replaces it entirely.
 * - A `replace_path` in the .mod descriptor removes the whole game folder from
 *   loading — only the mod's files (if any) exist under that path.
 * Cross-file merging beyond that (same key in two files) doesn't matter for
 * collecting ids: we union keys from every effective file.
 */
export function effectiveFiles(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  relDir: string
): string[] {
  const files = new Map<string, string>() // file name -> full path
  const normalizedRel = relDir.replace(/\\/g, '/').toLowerCase()
  const replaced = replacePaths.some((rp) => {
    const nrp = rp.replace(/\\/g, '/').toLowerCase()
    return normalizedRel === nrp || normalizedRel.startsWith(nrp + '/')
  })
  const dirs: string[] = []
  if (gameDir && !replaced) dirs.push(join(gameDir, ...relDir.split('/')))
  if (modPath) dirs.push(join(modPath, ...relDir.split('/')))
  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir)) {
      if (!entry.toLowerCase().endsWith('.txt')) continue
      files.set(entry, dir + sep + entry)
    }
  }
  return [...files.values()]
}

function topLevelKeys(path: string): string[] {
  try {
    return scanBlocks(readFileSync(path, 'utf-8')).map((b) => b.key)
  } catch {
    return []
  }
}

function listCultures(gameDir: string | null, modPath: string | null, replacePaths: string[]): string[] {
  const keys = new Set<string>()
  for (const file of effectiveFiles(gameDir, modPath, replacePaths, 'common/culture/cultures')) {
    for (const key of topLevelKeys(file)) keys.add(key)
  }
  return [...keys].sort()
}

function listFaiths(gameDir: string | null, modPath: string | null, replacePaths: string[]): string[] {
  const keys = new Set<string>()
  for (const file of effectiveFiles(gameDir, modPath, replacePaths, 'common/religion/religion_types')) {
    try {
      const text = readFileSync(file, 'utf-8')
      for (const religion of scanBlocks(text)) {
        const body = text.slice(religion.bodyStart, religion.bodyEnd)
        for (const sub of scanBlocks(body)) {
          if (sub.key !== 'faiths') continue
          for (const faith of scanBlocks(body.slice(sub.bodyStart, sub.bodyEnd))) {
            keys.add(faith.key)
          }
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return [...keys].sort()
}

function listTraits(gameDir: string | null, modPath: string | null, replacePaths: string[]): string[] {
  const keys = new Set<string>()
  for (const file of effectiveFiles(gameDir, modPath, replacePaths, 'common/traits')) {
    for (const key of topLevelKeys(file)) keys.add(key)
  }
  return [...keys].sort()
}

export function getReferenceData(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): ReferenceData {
  return {
    cultures: listCultures(gameDir, modPath, replacePaths),
    faiths: listFaiths(gameDir, modPath, replacePaths),
    traits: listTraits(gameDir, modPath, replacePaths)
  }
}
