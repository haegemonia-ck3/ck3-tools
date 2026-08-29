import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { CharacterSummary } from '@shared/types'

/**
 * Minimal Paradox-script block scanner. CK3 history files are `key = { … }`
 * blocks nested arbitrarily; we only need keys/values at a given depth, so a
 * brace-counting walk is enough — no full AST.
 */

/** Strip # comments (line-based; # inside quoted strings is not used in history files). */
function stripComments(text: string): string {
  return text.replace(/#[^\r\n]*/g, '')
}

interface Block {
  key: string
  body: string
}

/** Extract `key = { … }` blocks at depth 0 of the given text. */
function topLevelBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const re = /([A-Za-z0-9_.\-]+)\s*=\s*\{/g
  let m: RegExpExecArray | null
  let searchFrom = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index < searchFrom) continue
    // Walk to the matching close brace
    let depth = 1
    let i = re.lastIndex
    while (i < text.length && depth > 0) {
      const c = text[i]
      if (c === '{') depth++
      else if (c === '}') depth--
      i++
    }
    blocks.push({ key: m[1], body: text.slice(re.lastIndex, i - 1) })
    searchFrom = i
    re.lastIndex = i
  }
  return blocks
}

/** Extract scalar `key = value` pairs at depth 0 of a block body. */
function topLevelScalars(body: string): Map<string, string> {
  const scalars = new Map<string, string>()
  let depth = 0
  for (const line of body.split('\n')) {
    if (depth === 0) {
      const m = line.match(/^\s*([A-Za-z0-9_.\-]+)\s*=\s*("([^"]*)"|[^\s{}]+)/)
      // Only take pairs whose value is not a block opener
      if (m && !line.slice(m.index! + m[0].length).trimStart().startsWith('{') && m[2] !== '{') {
        if (!scalars.has(m[1])) scalars.set(m[1], m[3] ?? m[2])
      }
    }
    for (const c of line) {
      if (c === '{') depth++
      else if (c === '}') depth = Math.max(0, depth - 1)
    }
  }
  return scalars
}

// Tolerates typos that appear in real mod files: a trailing dot ("3220.1.1.")
// and a missing day part ("3212.1")
const DATE_KEY = /^\d+\.\d+(\.\d+)?\.?$/

function parseCharactersFile(text: string, file: string): CharacterSummary[] {
  const clean = stripComments(text)
  const characters: CharacterSummary[] = []
  for (const block of topLevelBlocks(clean)) {
    const scalars = topLevelScalars(block.body)
    let birth: string | null = null
    for (const sub of topLevelBlocks(block.body)) {
      if (DATE_KEY.test(sub.key) && /\bbirth\s*=/.test(sub.body)) {
        birth = sub.key.replace(/\.$/, '')
        break
      }
    }
    characters.push({
      id: block.key,
      name: scalars.get('name') ?? null,
      dynasty: scalars.get('dynasty') ?? scalars.get('dynasty_house') ?? null,
      birth,
      file
    })
  }
  return characters
}

export function listCharacters(modPath: string): CharacterSummary[] {
  const dir = join(modPath, 'history', 'characters')
  if (!existsSync(dir)) return []
  const characters: CharacterSummary[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.txt')) continue
    try {
      characters.push(...parseCharactersFile(readFileSync(join(dir, entry), 'utf-8'), entry))
    } catch {
      // skip unreadable files
    }
  }
  return characters.sort((a, b) => {
    const na = Number(a.id)
    const nb = Number(b.id)
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
    return a.id.localeCompare(b.id)
  })
}
