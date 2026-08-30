import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  endOfBodyIndex,
  eolSuffix,
  makeEditor,
  refresh,
  setScalar,
  splitComment,
  SCALAR_LINE
} from './lineEditor'
import { annotateLines, scanBlocks, scanRepeatedScalar, scanScalars } from './pdx'
import type { LineEditor } from './lineEditor'
import type {
  CharacterDetail,
  CharacterSpouse,
  CharacterStats,
  CharacterSummary,
  SaveResult
} from '@shared/types'

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

/** Sortable number for a Y.M.D date key, so new blocks land chronologically. */
function dateSortKey(date: string): number {
  const [y, m, d] = cleanDate(date).split('.')
  return Number(y) * 10000 + Number(m ?? 1) * 100 + Number(d ?? 1)
}

// Marriages live as dated effects rather than scalars: `add_spouse` (or
// `add_matrilineal_spouse`) in the wedding year's block, `remove_spouse` in
// the divorce year's.
const SPOUSE_STATEMENT =
  /(^|[\s{])(add_matrilineal_spouse|add_spouse|remove_spouse)\s*=\s*(?:"([^"]*)"|([^\s{}"#=]+))/gi

interface SpouseEvent {
  kind: 'add' | 'remove'
  id: string
  matrilineal: boolean
  /** Date of the block the statement sits in, cleaned of a trailing dot */
  date: string
}

interface SpouseEventHit extends SpouseEvent {
  /** Index of the containing date block within scanBlocks(body) */
  block: number
  /** Span of the statement within the character body */
  start: number
  end: number
}

/** Every spouse effect in the body's dated blocks, in file order, with spans. */
function scanSpouseEvents(body: string): SpouseEventHit[] {
  const hits: SpouseEventHit[] = []
  scanBlocks(body).forEach((block, index) => {
    if (!DATE_KEY.test(block.key)) return
    const sub = body.slice(block.bodyStart, block.bodyEnd)
    let lineStart = 0
    for (const { text, depth } of annotateLines(sub)) {
      const at = lineStart
      lineStart += text.length + 1
      if (depth !== 0) continue
      const [code] = splitComment(text)
      SPOUSE_STATEMENT.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = SPOUSE_STATEMENT.exec(code)) !== null) {
        const keyword = m[2].toLowerCase()
        hits.push({
          kind: keyword === 'remove_spouse' ? 'remove' : 'add',
          id: m[3] ?? m[4],
          matrilineal: keyword === 'add_matrilineal_spouse',
          date: cleanDate(block.key),
          block: index,
          start: block.bodyStart + at + m.index + m[1].length,
          end: block.bodyStart + at + m.index + m[0].length
        })
      }
    }
  })
  return hits
}

/** Pair add/remove effects into marriages; a remove closes the latest open one. */
function pairSpouses(events: SpouseEvent[]): CharacterSpouse[] {
  const spouses: CharacterSpouse[] = []
  for (const event of events) {
    if (event.kind === 'add') {
      spouses.push({
        id: event.id,
        marriage: event.date,
        divorce: null,
        matrilineal: event.matrilineal
      })
      continue
    }
    const open = [...spouses].reverse().find((s) => s.id === event.id && s.divorce === null)
    if (open) open.divorce = event.date
    else spouses.push({ id: event.id, marriage: null, divorce: event.date, matrilineal: false })
  }
  return spouses
}

/** The effects a spouse list should produce, in list order. */
function spouseEvents(spouses: CharacterSpouse[]): SpouseEvent[] {
  const events: SpouseEvent[] = []
  for (const spouse of spouses) {
    const id = spouse.id.trim()
    if (!id) continue
    if (spouse.marriage) {
      events.push({ kind: 'add', id, matrilineal: spouse.matrilineal, date: spouse.marriage })
    }
    if (spouse.divorce) {
      events.push({ kind: 'remove', id, matrilineal: false, date: spouse.divorce })
    }
  }
  return events
}

function statementFor(event: SpouseEvent): string {
  const keyword =
    event.kind === 'remove'
      ? 'remove_spouse'
      : event.matrilineal
        ? 'add_matrilineal_spouse'
        : 'add_spouse'
  return `${keyword} = ${event.id}`
}

const eventKey = (e: SpouseEvent): string =>
  `${e.kind}|${e.id}|${cleanDate(e.date)}|${e.kind === 'add' && e.matrilineal ? 'm' : ''}`

/** Reject a spouse list that can't be written; null when it's fine. */
function validateSpouses(spouses: CharacterSpouse[]): string | null {
  for (const spouse of spouses) {
    if (!spouse.id.trim()) return 'Every spouse needs a character id'
    for (const [label, date] of [
      ['Marriage', spouse.marriage],
      ['Divorce', spouse.divorce]
    ] as const) {
      if (date !== null && date !== '' && !DATE_KEY.test(date)) {
        return `Invalid ${label.toLowerCase()} date "${date}" (expected Y.M.D)`
      }
    }
    if (!spouse.marriage && !spouse.divorce) {
      return `Spouse ${spouse.id.trim()} needs a marriage date`
    }
  }
  return null
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
    dynasty: scalars.get('dynasty') ?? null,
    house: scalars.get('dynasty_house') ?? null,
    birth: birthBlock ? cleanDate(birthBlock.key) : null,
    death: deathBlock ? cleanDate(deathBlock.key) : null,
    culture: scalars.get('culture') ?? null,
    faith: scalars.get('faith') ?? scalars.get('religion') ?? null,
    father: scalars.get('father') ?? null,
    mother: scalars.get('mother') ?? null,
    traits: scanRepeatedScalar(body, 'trait'),
    spouses: pairSpouses(scanSpouseEvents(body)),
    stats,
    female: scalars.get('female') ?? null,
    sexuality: scalars.get('sexuality') ?? null
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
          // The list's one lineage column shows whichever key the file uses
          dynasty: detail.dynasty ?? detail.house,
          birth: detail.birth,
          father: detail.father,
          mother: detail.mother,
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

/**
 * Remove one statement from a block body, given its span. When the statement
 * was the line's only code the whole line goes (comment included, since it
 * annotated that statement); otherwise just the statement and one neighboring
 * space, so nothing sharing the line is disturbed.
 */
function cutStatement(sub: string, start: number, end: number): string {
  const lineStart = sub.lastIndexOf('\n', start - 1) + 1
  const nl = sub.indexOf('\n', end)
  const lineEnd = nl < 0 ? sub.length : nl
  const [code] = splitComment(sub.slice(lineStart, lineEnd))
  const rest = code.slice(0, start - lineStart) + code.slice(end - lineStart)
  if (rest.trim() === '') {
    return sub.slice(0, lineStart) + sub.slice(nl < 0 ? lineEnd : nl + 1)
  }
  let from = start
  let to = end
  if (sub[to] === ' ') to++
  else if (sub[from - 1] === ' ') from--
  return sub.slice(0, from) + sub.slice(to)
}

/** Whether a block body still carries code once statements have been cut out. */
function hasCode(sub: string): boolean {
  return sub.split('\n').some((line) => splitComment(line)[0].trim() !== '')
}

/** Line index of the opener of the depth-0 date block for `date`, or -1. */
function findDateBlockLine(ed: LineEditor, date: string): number {
  for (let i = 0; i < ed.lines.length; i++) {
    if (ed.depths[i] !== 0) continue
    const [code] = splitComment(ed.lines[i])
    const m = code.match(/^\s*([A-Za-z0-9_.\-']+)\s*=\s*\{/)
    if (m && DATE_KEY.test(m[1]) && cleanDate(m[1]) === date) return i
  }
  return -1
}

/** Add a statement to the block for `date`, creating the block when missing. */
function insertDatedStatement(ed: LineEditor, date: string, statement: string): void {
  const opener = findDateBlockLine(ed, date)
  if (opener >= 0) {
    // A one-line block (`1050.1.1 = { birth = yes }`) has no body line to
    // splice into — append the statement inside its braces instead
    if (opener + 1 >= ed.lines.length || ed.depths[opener + 1] <= ed.depths[opener]) {
      const [code, comment] = splitComment(ed.lines[opener])
      const close = code.lastIndexOf('}')
      ed.lines[opener] = `${code.slice(0, close)}${statement} ${code.slice(close)}${comment}`
      return
    }
    const at = opener + 1
    ed.lines.splice(at, 0, ...withEol(ed, [`${ed.indent}${ed.indent}${statement}`], at))
    refresh(ed)
    return
  }
  // No block for that date — create one, before the first later-dated block
  let at = endOfBodyIndex(ed)
  for (let i = 0; i < ed.lines.length; i++) {
    if (ed.depths[i] !== 0) continue
    const [code] = splitComment(ed.lines[i])
    const m = code.match(/^\s*([A-Za-z0-9_.\-']+)\s*=\s*\{/)
    if (m && DATE_KEY.test(m[1]) && dateSortKey(m[1]) > dateSortKey(date)) {
      at = i
      break
    }
  }
  ed.lines.splice(
    at,
    0,
    ...withEol(
      ed,
      [`${ed.indent}${date} = {`, `${ed.indent}${ed.indent}${statement}`, `${ed.indent}}`],
      at
    )
  )
  refresh(ed)
}

/**
 * Reconcile the body's spouse effects with the edited list. Effects that
 * survive unchanged are matched by value and left byte-for-byte alone; only
 * the ones that went away are cut and the new ones inserted, so an untouched
 * spouse list is a no-op even when the file spells its dates oddly.
 */
function setSpouses(ed: LineEditor, spouses: CharacterSpouse[]): void {
  const body = ed.lines.join('\n')
  const existing = scanSpouseEvents(body)
  const wanted = spouseEvents(spouses).map((e) => ({ event: e, placed: false }))
  const cuts: SpouseEventHit[] = []
  for (const hit of existing) {
    const match = wanted.find((w) => !w.placed && eventKey(w.event) === eventKey(hit))
    if (match) match.placed = true
    else cuts.push(hit)
  }

  if (cuts.length > 0) {
    const blocks = scanBlocks(body)
    // Rewrite each affected block once, dropping it entirely when the cuts
    // leave it empty; blocks are edited back to front so spans stay valid
    const byBlock = new Map<number, SpouseEventHit[]>()
    for (const cut of cuts) byBlock.set(cut.block, [...(byBlock.get(cut.block) ?? []), cut])
    let next = body
    for (const index of [...byBlock.keys()].sort((a, b) => b - a)) {
      const block = blocks[index]
      let sub = next.slice(block.bodyStart, block.bodyEnd)
      for (const cut of byBlock.get(index)!.sort((a, b) => b.start - a.start)) {
        sub = cutStatement(sub, cut.start - block.bodyStart, cut.end - block.bodyStart)
      }
      if (hasCode(sub)) {
        next = next.slice(0, block.bodyStart) + sub + next.slice(block.bodyEnd)
        continue
      }
      let from = block.start
      while (from > 0 && (next[from - 1] === ' ' || next[from - 1] === '\t')) from--
      let to = block.end
      if (next[to] === '\r') to++
      if (next[to] === '\n') to++
      next = next.slice(0, from) + next.slice(to)
    }
    ed.lines = next.split('\n')
    refresh(ed)
  }

  for (const { event } of wanted
    .filter((w) => !w.placed)
    .sort((a, b) => dateSortKey(a.event.date) - dateSortKey(b.event.date))) {
    insertDatedStatement(ed, cleanDate(event.date), statementFor(event))
  }
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
    const spouseError = validateSpouses(detail.spouses ?? [])
    if (spouseError) return { ok: false, error: spouseError }

    const ed = makeEditor(text.slice(block.bodyStart, block.bodyEnd))
    // New scalar lines go above the first date block
    const set = (keys: string[], value: string | null, quoteNew = false): void =>
      setScalar(ed, keys, value, { quoteNew, insertAt: firstDateBlockLine(ed) })
    set(['name'], detail.name, true)
    set(['female'], detail.female)
    set(['sexuality'], detail.sexuality)
    set(['dynasty'], detail.dynasty)
    set(['dynasty_house'], detail.house)
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
    setSpouses(ed, detail.spouses ?? [])

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

// ---------- Creating ----------

/** Same charset the block scanner and line editor accept for keys. */
const ID_CHARS = /^[A-Za-z0-9_.\-']+$/

export function listCharacterFiles(modPath: string): string[] {
  const dir = charactersDir(modPath)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b))
}

/**
 * Append a brand-new character block to a history file (created if missing).
 * Existing file content is preserved byte-for-byte; the block is added after a
 * separating blank line, matching the file's line-ending style.
 */
export function createCharacter(
  modPath: string,
  file: string,
  detail: CharacterDetail
): SaveResult {
  try {
    const id = detail.id.trim()
    if (!id) return { ok: false, error: 'ID must not be empty' }
    if (!ID_CHARS.test(id)) {
      return { ok: false, error: `Invalid ID "${id}" (letters, digits, _ . - ' only)` }
    }
    if (
      !file.toLowerCase().endsWith('.txt') ||
      file.length <= 4 ||
      !/^[^\\/:*?"<>|]+$/.test(file)
    ) {
      return { ok: false, error: `Invalid file name "${file}" (expected a .txt file name)` }
    }
    const required: [string, string | null][] = [
      ['Name', detail.name],
      ['Culture', detail.culture],
      ['Faith', detail.faith],
      ['Birth date', detail.birth]
    ]
    for (const [label, value] of required) {
      if (!value?.trim()) return { ok: false, error: `${label} is required` }
    }
    for (const date of [detail.birth, detail.death]) {
      if (date !== null && !DATE_KEY.test(date)) {
        return { ok: false, error: `Invalid date "${date}" (expected Y.M.D)` }
      }
    }
    const spouseError = validateSpouses(detail.spouses ?? [])
    if (spouseError) return { ok: false, error: spouseError }
    const clash = listCharacters(modPath).find((c) => c.id === id)
    if (clash) return { ok: false, error: `ID ${id} already exists in ${clash.file}` }

    const dir = charactersDir(modPath)
    const path = join(dir, file)
    const existing = existsSync(path) ? readFileSync(path, 'utf-8') : null
    const eol = existing !== null && existing.includes('\r\n') ? '\r\n' : '\n'

    const t = '\t'
    const lines: string[] = [`${id} = {`]
    const push = (key: string, value: string | null, quote = false): void => {
      if (value === null || value === '') return
      lines.push(`${t}${key} = ${quote ? `"${value}"` : value}`)
    }
    push('name', detail.name, true)
    push('female', detail.female)
    push('sexuality', detail.sexuality)
    push('dynasty', detail.dynasty)
    push('dynasty_house', detail.house)
    push('culture', detail.culture)
    push('faith', detail.faith)
    push('father', detail.father)
    push('mother', detail.mother)
    for (const trait of detail.traits) push('trait', trait)
    for (const key of STAT_KEYS) {
      const v = detail.stats[key]
      if (v !== null) push(key, String(v))
    }
    // Birth, death and every marriage effect are dated blocks; group the
    // statements by date and emit the blocks chronologically
    const dated = new Map<string, string[]>()
    const onDate = (date: string, statement: string): void => {
      dated.set(cleanDate(date), [...(dated.get(cleanDate(date)) ?? []), statement])
    }
    onDate(detail.birth!, 'birth = yes')
    if (detail.death) onDate(detail.death, 'death = yes')
    for (const event of spouseEvents(detail.spouses ?? [])) {
      onDate(event.date, statementFor(event))
    }
    for (const [date, statements] of [...dated].sort(
      (a, b) => dateSortKey(a[0]) - dateSortKey(b[0])
    )) {
      lines.push(`${t}${date} = {`, ...statements.map((x) => `${t}${t}${x}`), `${t}}`)
    }
    lines.push('}')
    const block = lines.join(eol) + eol

    let prefix = existing ?? ''
    if (prefix !== '' && !prefix.endsWith('\n')) prefix += eol
    if (prefix !== '' && !/(\r?\n){2}$/.test(prefix)) prefix += eol
    if (existing === null) mkdirSync(dir, { recursive: true })
    writeFileSync(path, prefix + block, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
