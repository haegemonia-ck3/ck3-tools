import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { basename, join, sep } from 'path'
import type { Dirent } from 'fs'
import { DATE_KEY } from './characters'
import { makeEditor, setScalar } from './lineEditor'
import { annotateLines, scanBlocks } from './pdx'
import { effectiveFiles } from './refdata'
import type { BlockSpan } from './pdx'
import type {
  DynastyCharacter,
  DynastyData,
  DynastyDef,
  DynastyPatch,
  HouseDef,
  HousePatch,
  SaveResult
} from '@shared/types'

/** Id comparison key: real files reference `Phokus` as `phokus`, `7` as `"7"`. */
function norm(id: string): string {
  return id.trim().toLowerCase()
}

// ---------- Lenient scalar scanning ----------

// A `key = value` statement anywhere in a line of depth-0 code. Unlike
// scanScalars in pdx.ts this is not anchored to the whole line, so it also
// reads single-line bodies holding several statements.
const STATEMENT = /(^|\s)([A-Za-z0-9_.\-']+)\s*=\s*(?:"([^"]*)"|([^\s{}"#=]+))/g

/**
 * The depth-0 code of a line — comments and the contents of inline sub-blocks
 * removed — given the brace depth at the line's start.
 */
function topLevelCode(line: string, startDepth: number): string {
  let out = ''
  let depth = startDepth
  let inQuote = false
  for (const c of line) {
    if (inQuote) {
      if (depth === 0) out += c
      if (c === '"') inQuote = false
      continue
    }
    if (c === '#') break
    if (c === '"') {
      inQuote = true
      if (depth === 0) out += c
      continue
    }
    if (c === '{') {
      depth++
      // Elide the sub-block but leave `{}` so the dangling `key =` before it
      // binds to an unmatchable token instead of swallowing the NEXT
      // statement's key as its value
      if (depth === 1) out += '{}'
      continue
    }
    if (c === '}') {
      depth = Math.max(0, depth - 1)
      if (depth === 0) out += ' '
      continue
    }
    if (depth === 0) out += c
  }
  return out
}

/** Depth-0 scalars with lowercased keys, first occurrence wins. */
function scanScalarsCI(body: string): Map<string, string> {
  const scalars = new Map<string, string>()
  for (const { text, depth } of annotateLines(body)) {
    for (const m of topLevelCode(text, depth).matchAll(STATEMENT)) {
      const key = m[2].toLowerCase()
      if (!scalars.has(key)) scalars.set(key, m[3] ?? m[4])
    }
  }
  return scalars
}

// ---------- Characters ----------

function hasStatementCI(subBody: string, statement: string): boolean {
  const re = new RegExp(`(^|[\\s{])${statement}\\s*=`, 'i')
  for (const { text } of annotateLines(subBody)) {
    if (re.test(text.split('#')[0])) return true
  }
  return false
}

/** Date of the first date block containing a birth/death statement, cleaned of a trailing dot. */
function findDated(body: string, blocks: BlockSpan[], statement: 'birth' | 'death'): string | null {
  const block = blocks.find((b) => hasStatementCI(body.slice(b.bodyStart, b.bodyEnd), statement))
  return block ? block.key.replace(/\.$/, '') : null
}

const SPOUSE = /(^|[\s{])(?:add_matrilineal_spouse|add_spouse)\s*=\s*(?:"([^"]*)"|([^\s{}"#=]+))/gi

function collectSpouses(body: string, blocks: BlockSpan[]): string[] {
  const spouses: string[] = []
  for (const block of blocks) {
    for (const line of body.slice(block.bodyStart, block.bodyEnd).split('\n')) {
      for (const m of line.split('#')[0].matchAll(SPOUSE)) {
        const id = m[2] ?? m[3]
        if (!spouses.includes(id)) spouses.push(id)
      }
    }
  }
  return spouses
}

function parseCharacter(body: string, id: string, file: string): DynastyCharacter {
  const scalars = scanScalarsCI(body)
  const dateBlocks = scanBlocks(body).filter((b) => DATE_KEY.test(b.key))
  return {
    id,
    file,
    name: scalars.get('name') ?? null,
    birth: findDated(body, dateBlocks, 'birth'),
    death: findDated(body, dateBlocks, 'death'),
    father: scalars.get('father') ?? null,
    mother: scalars.get('mother') ?? null,
    female: (scalars.get('female') ?? '').toLowerCase() === 'yes',
    dynasty: scalars.get('dynasty') ?? null,
    house: scalars.get('dynasty_house') ?? null,
    spouses: collectSpouses(body, dateBlocks)
  }
}

function listDynastyCharacters(modPath: string): DynastyCharacter[] {
  const dir = join(modPath, 'history', 'characters')
  if (!existsSync(dir)) return []
  const characters: DynastyCharacter[] = []
  for (const entry of readdirSync(dir)) {
    if (!entry.toLowerCase().endsWith('.txt')) continue
    try {
      const text = readFileSync(join(dir, entry), 'utf-8')
      for (const block of scanBlocks(text)) {
        characters.push(parseCharacter(text.slice(block.bodyStart, block.bodyEnd), block.key, entry))
      }
    } catch {
      // skip unreadable files
    }
  }
  return characters
}

// ---------- Definitions ----------

interface RawDef {
  id: string
  file: string
  inMod: boolean
  scalars: Map<string, string>
}

function readDefs(files: string[], modPath: string | null): RawDef[] {
  const defs: RawDef[] = []
  for (const path of files) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    const inMod = modPath !== null && path.startsWith(modPath + sep)
    for (const block of scanBlocks(text)) {
      defs.push({
        id: block.key,
        file: basename(path),
        inMod,
        scalars: scanScalarsCI(text.slice(block.bodyStart, block.bodyEnd))
      })
    }
  }
  return defs
}

/**
 * Every mod definition, plus game definitions whose id is referenced by mod
 * content. A mod definition beats a game one with the same (normalized) id.
 */
function layer(raw: RawDef[], referenced: Set<string>): RawDef[] {
  const seen = new Set<string>()
  const defs: RawDef[] = []
  for (const def of raw.filter((d) => d.inMod)) {
    if (seen.has(norm(def.id))) continue
    seen.add(norm(def.id))
    defs.push(def)
  }
  for (const def of raw.filter((d) => !d.inMod)) {
    if (seen.has(norm(def.id)) || !referenced.has(norm(def.id))) continue
    seen.add(norm(def.id))
    defs.push(def)
  }
  return defs
}

// ---------- Localization ----------

function ymlFiles(dir: string): string[] {
  const files: string[] = []
  const walk = (d: string): void => {
    let entries: Dirent[]
    try {
      entries = readdirSync(d, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.toLowerCase().endsWith('.yml')) files.push(full)
    }
  }
  if (existsSync(dir)) walk(dir)
  return files
}

// `key:0 "Value"` — leading space optional (real files have entries at column
// 0), any version digit count; the greedy group ends at the LAST quote on the
// line so trailing comments after the closing quote are dropped
const LOC_LINE = /^\s*([A-Za-z0-9_.\-']+):\d*\s*"(.*)"/

function parseLocFile(path: string, into: Map<string, string>): void {
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
    const m = line.match(LOC_LINE)
    if (m) into.set(m[1], m[2])
  }
}

/** name key -> display text, mod entries layered over the game's. */
function readLocalization(gameDir: string | null, modPath: string | null): Map<string, string> {
  const loc = new Map<string, string>()
  if (gameDir) {
    for (const file of ymlFiles(join(gameDir, 'localization', 'english', 'dynasties'))) {
      parseLocFile(file, loc)
    }
  }
  if (modPath) {
    const root = join(modPath, 'localization')
    for (const file of ymlFiles(root)) {
      if (file.slice(root.length).toLowerCase().includes('english')) parseLocFile(file, loc)
    }
  }
  return loc
}

// ---------- Assembly ----------

export function getDynastyData(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): DynastyData {
  const characters = modPath ? listDynastyCharacters(modPath) : []
  const dynastyRaw = readDefs(effectiveFiles(gameDir, modPath, replacePaths, 'common/dynasties'), modPath)
  const houseRaw = readDefs(
    effectiveFiles(gameDir, modPath, replacePaths, 'common/dynasty_houses'),
    modPath
  )

  // Game definitions are only shown when mod content points at them. Houses
  // layer first so that a game house pulled in by a mod character can in turn
  // pull in its game parent dynasty.
  const referenced = new Set<string>()
  for (const c of characters) {
    if (c.dynasty !== null) referenced.add(norm(c.dynasty))
    if (c.house !== null) referenced.add(norm(c.house))
  }
  const layeredHouses = layer(houseRaw, referenced)
  for (const h of layeredHouses) {
    const parent = h.scalars.get('dynasty')
    if (parent !== undefined) referenced.add(norm(parent))
  }

  const loc = readLocalization(gameDir, modPath)
  const localized = (name: string | undefined): string | null =>
    name !== undefined ? (loc.get(name) ?? null) : null

  const dynasties: DynastyDef[] = layer(dynastyRaw, referenced).map((d) => ({
    id: d.id,
    file: d.file,
    inMod: d.inMod,
    name: d.scalars.get('name') ?? null,
    prefix: d.scalars.get('prefix') ?? null,
    motto: d.scalars.get('motto') ?? null,
    culture: d.scalars.get('culture') ?? null,
    localizedName: localized(d.scalars.get('name'))
  }))
  const houses: HouseDef[] = layeredHouses.map((d) => ({
    id: d.id,
    file: d.file,
    inMod: d.inMod,
    name: d.scalars.get('name') ?? null,
    prefix: d.scalars.get('prefix') ?? null,
    motto: d.scalars.get('motto') ?? null,
    dynasty: d.scalars.get('dynasty') ?? null,
    localizedName: localized(d.scalars.get('name'))
  }))
  return { dynasties, houses, characters }
}

// ---------- Saving ----------

/** [written key, new value, quote style for a newly inserted line] */
type FieldPatch = [string, string | null, boolean]

function saveDef(path: string, file: string, id: string, fields: FieldPatch[]): SaveResult {
  try {
    if (!existsSync(path)) return { ok: false, error: `File not found: ${file}` }
    const text = readFileSync(path, 'utf-8')
    const block = scanBlocks(text).find((b) => b.key === id)
    if (!block) return { ok: false, error: `${id} not found in ${file}` }
    const ed = makeEditor(text.slice(block.bodyStart, block.bodyEnd))
    for (const [key, value, quoteNew] of fields) {
      setScalar(ed, [key], value, { quoteNew, ignoreCase: true })
    }
    const updated = text.slice(0, block.bodyStart) + ed.lines.join('\n') + text.slice(block.bodyEnd)
    writeFileSync(path, updated, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function saveDynasty(
  modPath: string,
  file: string,
  id: string,
  patch: DynastyPatch
): SaveResult {
  return saveDef(join(modPath, 'common', 'dynasties', file), file, id, [
    ['name', patch.name, true],
    ['prefix', patch.prefix, true],
    ['motto', patch.motto, true],
    ['culture', patch.culture, false]
  ])
}

export function saveHouse(modPath: string, file: string, id: string, patch: HousePatch): SaveResult {
  return saveDef(join(modPath, 'common', 'dynasty_houses', file), file, id, [
    ['name', patch.name, true],
    ['prefix', patch.prefix, true],
    ['motto', patch.motto, true],
    ['dynasty', patch.dynasty, false]
  ])
}
