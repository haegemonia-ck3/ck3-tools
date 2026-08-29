import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { endOfBodyIndex, eolSuffix, makeEditor, refresh, setScalar, SCALAR_LINE } from './lineEditor'
import { annotateLines, scanBlocks, scanRepeatedScalar, scanScalars } from './pdx'
import type { LineEditor } from './lineEditor'
import type { CharacterDetail, CharacterStats, CharacterSummary, SaveResult } from '@shared/types'

// Tolerates typos that appear in real mod files: a trailing dot ("3220.1.1.")
// and a missing day part ("3212.1")
export const DATE_KEY = /^\d+\.\d+(\.\d+)?\.?$/

export const STAT_KEYS = [
  'diplomacy',
  'martial',
  'stewardship',
  'intrigue',
  'learning',
  'prowess'
] as const

function charactersDir(modPath: string): string {
  return join(modPath, 'history', 'characters')
}

/** Comment-safe test for a statement inside a date block body. */
function hasStatement(subBody: string, statement: string): boolean {
  for (const { text } of annotateLines(subBody)) {
    const code = text.split('#')[0]
    if (new RegExp(`(^|[\\s{])${statement}\\s*=`).test(code)) return true
  }
  return false
}

function findDateBlocks(body: string, statement: 'birth' | 'death') {
  return scanBlocks(body).filter(
    (sub) => DATE_KEY.test(sub.key) && hasStatement(body.slice(sub.bodyStart, sub.bodyEnd), statement)
  )
}

function cleanDate(key: string): string {
  return key.replace(/\.$/, '')
}

function parseBlockDetail(body: string, id: string, file: string): CharacterDetail {
  const scalars = scanScalars(body)
  const stats = {} as CharacterStats
  for (const key of STAT_KEYS) {
    const v = scalars.get(key)
    const n = v !== undefined ? Number(v) : NaN
    stats[key] = Number.isNaN(n) ? null : n
  }
  const birthBlock = findDateBlocks(body, 'birth')[0] ?? null
  const deathBlock = findDateBlocks(body, 'death')[0] ?? null
  return {
    id,
    file,
    name: scalars.get('name') ?? null,
    dynasty: scalars.get('dynasty') ?? scalars.get('dynasty_house') ?? null,
    birth: birthBlock ? cleanDate(birthBlock.key) : null,
    death: deathBlock ? cleanDate(deathBlock.key) : null,
    culture: scalars.get('culture') ?? null,
    faith: scalars.get('faith') ?? scalars.get('religion') ?? null,
    father: scalars.get('father') ?? null,
    mother: scalars.get('mother') ?? null,
    traits: scanRepeatedScalar(body, 'trait'),
    stats
  }
}

export function listCharacters(modPath: string): CharacterSummary[] {
  const dir = charactersDir(modPath)
  if (!existsSync(dir)) return []
  const characters: CharacterSummary[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.txt')) continue
    try {
      const text = readFileSync(join(dir, entry), 'utf-8')
      for (const block of scanBlocks(text)) {
        const detail = parseBlockDetail(text.slice(block.bodyStart, block.bodyEnd), block.key, entry)
        characters.push({
          id: detail.id,
          name: detail.name,
          dynasty: detail.dynasty,
          birth: detail.birth,
          file: entry
        })
      }
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

export function getCharacter(modPath: string, file: string, id: string): CharacterDetail | null {
  const path = join(charactersDir(modPath), file)
  if (!existsSync(path)) return null
  const text = readFileSync(path, 'utf-8')
  const block = scanBlocks(text).find((b) => b.key === id)
  if (!block) return null
  return parseBlockDetail(text.slice(block.bodyStart, block.bodyEnd), id, file)
}

// ---------- Saving ----------

/**
 * All edits are surgical: only lines that carry an edited property change; the
 * rest of the block (dated effect blocks, comments, formatting) and the rest of
 * the file are preserved byte-for-byte.
 */

/** Index of the first date-block opener line, used as the insertion anchor for scalars. */
function firstDateBlockLine(ed: LineEditor): number {
  for (let i = 0; i < ed.lines.length; i++) {
    if (ed.depths[i] !== 0) continue
    const code = ed.lines[i].split('#')[0]
    const m = code.match(/^\s*([A-Za-z0-9_.\-']+)\s*=\s*\{/)
    if (m && DATE_KEY.test(m[1])) return i
  }
  return ed.lines.length
}

/**
 * Terminate inserted lines with \r in CRLF bodies (join adds only the \n).
 * A line appended at the very end gets none — nothing follows it.
 */
function withEol(ed: LineEditor, lines: string[], at: number): string[] {
  const cr = eolSuffix(ed)
  if (cr === '') return lines
  const appendAtEnd = at >= ed.lines.length
  return lines.map((l, i) => (appendAtEnd && i === lines.length - 1 ? l : l + cr))
}

function setTraits(ed: LineEditor, traits: string[]): void {
  // Remove existing depth-0 trait lines, remembering where the first one was
  let insertAt = -1
  for (let i = ed.lines.length - 1; i >= 0; i--) {
    if (ed.depths[i] !== 0) continue
    const code = ed.lines[i].split('#')[0]
    const m = code.match(SCALAR_LINE)
    if (m && m[2] === 'trait') {
      ed.lines.splice(i, 1)
      insertAt = i
    }
  }
  refresh(ed)
  if (traits.length === 0) return
  if (insertAt < 0) insertAt = firstDateBlockLine(ed)
  ed.lines.splice(insertAt, 0, ...withEol(ed, traits.map((t) => `${ed.indent}trait = ${t}`), insertAt))
  refresh(ed)
}

/** Rename/add/remove the date block containing a birth/death statement. */
function setDateBlock(ed: LineEditor, statement: 'birth' | 'death', date: string | null): void {
  const body = ed.lines.join('\n')
  const block = findDateBlocks(body, statement)[0] ?? null
  if (block) {
    if (date !== null) {
      // Rename the key in place
      const next =
        body.slice(0, block.start) + date + body.slice(block.start + block.key.length)
      ed.lines = next.split('\n')
    } else if (statement === 'death') {
      // Cut every death statement out of the date block: whole nested
      // `death = { ... }` blocks first (they can span several lines — a
      // per-line filter would orphan their bodies and closing braces),
      // then scalar `death = yes` lines
      let kept = body.slice(block.bodyStart, block.bodyEnd)
      for (const db of scanBlocks(kept).filter((b) => b.key === 'death').reverse()) {
        let from = db.start
        while (from > 0 && (kept[from - 1] === ' ' || kept[from - 1] === '\t')) from--
        let to = db.end
        if (kept[to] === '\r') to++
        if (kept[to] === '\n') to++
        kept = kept.slice(0, from) + kept.slice(to)
      }
      kept = kept
        .split('\n')
        .filter((l) => !/^\s*death\s*=/.test(l.split('#')[0]))
        .join('\n')
      const meaningful = kept.split('\n').some((l) => l.split('#')[0].trim().length > 0)
      if (!meaningful) {
        // Nothing but death in it — drop the whole date block, consuming
        // the line's leading whitespace and trailing newline
        let from = block.start
        while (from > 0 && (body[from - 1] === ' ' || body[from - 1] === '\t')) from--
        let to = block.end
        if (body[to] === '\r') to++
        if (body[to] === '\n') to++
        ed.lines = (body.slice(0, from) + body.slice(to)).split('\n')
      } else {
        ed.lines = (body.slice(0, block.bodyStart) + kept + body.slice(block.bodyEnd)).split('\n')
      }
    }
    refresh(ed)
    return
  }
  if (date === null) return
  // No existing block — append one at the end of the body (before the closing
  // brace's own line, so the block isn't glued to the character's `}`)
  const inner = statement === 'birth' ? 'birth = yes' : 'death = yes'
  const at = endOfBodyIndex(ed)
  ed.lines.splice(
    at,
    0,
    ...withEol(ed, [`${ed.indent}${date} = {`, `${ed.indent}${ed.indent}${inner}`, `${ed.indent}}`], at)
  )
  refresh(ed)
}

export function saveCharacter(
  modPath: string,
  file: string,
  originalId: string,
  detail: CharacterDetail
): SaveResult {
  try {
    const path = join(charactersDir(modPath), file)
    if (!existsSync(path)) return { ok: false, error: `File not found: ${file}` }
    const text = readFileSync(path, 'utf-8')
    const blocks = scanBlocks(text)
    const block = blocks.find((b) => b.key === originalId)
    if (!block) return { ok: false, error: `Character ${originalId} not found in ${file}` }

    const newId = detail.id.trim()
    if (!newId) return { ok: false, error: 'ID must not be empty' }
    if (newId !== originalId) {
      if (blocks.some((b) => b.key === newId)) {
        return { ok: false, error: `ID ${newId} already exists in ${file}` }
      }
      const clash = listCharacters(modPath).find((c) => c.id === newId)
      if (clash) {
        return { ok: false, error: `ID ${newId} already exists in ${clash.file}` }
      }
    }
    for (const date of [detail.birth, detail.death]) {
      if (date !== null && !DATE_KEY.test(date)) {
        return { ok: false, error: `Invalid date "${date}" (expected Y.M.D)` }
      }
    }

    const ed = makeEditor(text.slice(block.bodyStart, block.bodyEnd))
    // New scalar lines go above the first date block
    const set = (keys: string[], value: string | null, quoteNew = false): void =>
      setScalar(ed, keys, value, { quoteNew, insertAt: firstDateBlockLine(ed) })
    set(['name'], detail.name, true)
    set(['dynasty', 'dynasty_house'], detail.dynasty)
    set(['culture'], detail.culture)
    set(['faith', 'religion'], detail.faith)
    set(['father'], detail.father)
    set(['mother'], detail.mother)
    for (const key of STAT_KEYS) {
      const v = detail.stats[key]
      set([key], v === null ? null : String(v))
    }
    setTraits(ed, detail.traits)
    setDateBlock(ed, 'birth', detail.birth)
    setDateBlock(ed, 'death', detail.death)

    const newBody = ed.lines.join('\n')
    const updated =
      text.slice(0, block.start) +
      newId +
      text.slice(block.start + originalId.length, block.bodyStart) +
      newBody +
      text.slice(block.bodyEnd)
    writeFileSync(path, updated, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
