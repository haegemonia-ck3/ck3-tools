import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, sep } from 'path'
import { scanBlocks } from './pdx'
import type { RefKind, RefLocation, ReferenceData } from '@shared/types'

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

function listDynasties(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): string[] {
  const keys = new Set<string>()
  for (const relDir of ['common/dynasties', 'common/dynasty_houses']) {
    for (const file of effectiveFiles(gameDir, modPath, replacePaths, relDir)) {
      for (const key of topLevelKeys(file)) keys.add(key)
    }
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
    traits: listTraits(gameDir, modPath, replacePaths),
    dynasties: listDynasties(gameDir, modPath, replacePaths)
  }
}

/** Directories a given kind of reference data is defined in */
const KIND_DIRS: Record<RefKind, string[]> = {
  culture: ['common/culture/cultures'],
  faith: ['common/religion/religion_types'],
  trait: ['common/traits'],
  dynasty: ['common/dynasties', 'common/dynasty_houses']
}

function lineOf(text: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') line++
  }
  return line
}

/** Offset of `id`'s definition within the file, or null. Faiths are nested two levels deep. */
function findDefinition(text: string, kind: RefKind, id: string): number | null {
  if (kind === 'faith') {
    for (const religion of scanBlocks(text)) {
      const body = text.slice(religion.bodyStart, religion.bodyEnd)
      for (const sub of scanBlocks(body)) {
        if (sub.key !== 'faiths') continue
        for (const faith of scanBlocks(body.slice(sub.bodyStart, sub.bodyEnd))) {
          if (faith.key === id) return religion.bodyStart + sub.bodyStart + faith.start
        }
      }
    }
    return null
  }
  const block = scanBlocks(text).find((b) => b.key === id)
  return block ? block.start : null
}

/**
 * Find where a reference id is defined, preferring a mod definition over the
 * base game's when both exist (matching how CK3 layers content).
 */
export function locateRef(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  kind: RefKind,
  id: string
): RefLocation | null {
  let gameHit: RefLocation | null = null
  for (const relDir of KIND_DIRS[kind]) {
    for (const file of effectiveFiles(gameDir, modPath, replacePaths, relDir)) {
      let text: string
      try {
        text = readFileSync(file, 'utf-8')
      } catch {
        continue
      }
      const offset = findDefinition(text, kind, id)
      if (offset === null) continue
      const inMod = modPath !== null && file.startsWith(modPath + sep)
      const hit = { path: file, line: lineOf(text, offset), inMod }
      if (inMod) return hit
      gameHit ??= hit
    }
  }
  return gameHit
}
