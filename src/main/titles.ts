import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { DATE_KEY } from './characters'
import { makeEditor, setBlockBody, setScalar, splitComment } from './lineEditor'
import { readLocalization } from './localization'
import { annotateLines, scanBlocks, scanScalarsCI } from './pdx'
import { effectiveFiles, isUnderDir } from './refdata'
import {
  colorTriple,
  modFirst,
  norm,
  parseColor,
  readNamedColors,
  setColor
} from './religions'
import { KEY_CHARS, appendBlock, isTxtFileName, listTxtFiles } from './scriptFile'
import type { LineEditor } from './lineEditor'
import type {
  NewTitle,
  RefEntry,
  SaveResult,
  TitleCulturalName,
  TitleData,
  TitleDetail,
  TitleFlags,
  TitlePatch,
  TitleSummary,
  TitleTier
} from '@shared/types'
import { TITLE_FLAG_KEYS } from '@shared/types'

export const TITLE_DIR = 'common/landed_titles'
const GOVERNMENT_DIR = 'common/governments'
const LAW_DIR = 'common/laws'

/**
 * A landed-title key: tier prefix + at least one more character. Only the
 * prefix identifies a title — everything else inside a title block (color,
 * cultural_names, can_create, even pasted date-keyed history blocks) is a
 * property. The two-char prefixes don't collide with any property key.
 */
export const TITLE_KEY = /^[hekdcb]_./i

const TIER_BY_PREFIX: Record<string, TitleTier> = {
  h: 'hegemony',
  e: 'empire',
  k: 'kingdom',
  d: 'duchy',
  c: 'county',
  b: 'barony'
}

/** Rank for tier sanity checks: a child must sit strictly below its parent. */
const TIER_RANK: Record<TitleTier, number> = {
  hegemony: 5,
  empire: 4,
  kingdom: 3,
  duchy: 2,
  county: 1,
  barony: 0
}

export function titleTier(id: string): TitleTier | null {
  if (!TITLE_KEY.test(id)) return null
  return TIER_BY_PREFIX[id[0].toLowerCase()] ?? null
}

// ---------- Walking the de jure tree ----------

/** One title block found by the recursive walk, with absolute file offsets. */
interface TitleNode {
  id: string
  /** Offsets into the whole file text */
  absStart: number
  absBodyStart: number
  absBodyEnd: number
  absEnd: number
  /** Ancestor title ids, outermost first */
  path: string[]
  parent: string | null
  /** The block's body slice */
  body: string
}

/**
 * Visit every title block of a file, depth first in file order. Nesting is the
 * de jure hierarchy; offsets are composed by adding each ancestor's bodyStart,
 * so a visitor can splice its node's body with the rest of the file untouched.
 */
function walkTitles(text: string, visit: (node: TitleNode) => void): void {
  const recurse = (body: string, absBase: number, path: string[]): void => {
    for (const b of scanBlocks(body)) {
      if (!TITLE_KEY.test(b.key)) continue
      const childBody = body.slice(b.bodyStart, b.bodyEnd)
      visit({
        id: b.key,
        absStart: absBase + b.start,
        absBodyStart: absBase + b.bodyStart,
        absBodyEnd: absBase + b.bodyEnd,
        absEnd: absBase + b.end,
        path,
        parent: path.length > 0 ? path[path.length - 1] : null,
        body: childBody
      })
      recurse(childBody, absBase + b.bodyStart, [...path, b.key])
    }
  }
  recurse(text, 0, [])
}

/** The first title node matching `id` (normalized) in `text`, or null. */
function findTitleNode(text: string, id: string): TitleNode | null {
  let found: TitleNode | null = null
  walkTitles(text, (node) => {
    if (found === null && norm(node.id) === norm(id)) found = node
  })
  return found
}

// ---------- Reference lists ----------

function governmentIds(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): string[] {
  const ids = new Set<string>()
  for (const path of effectiveFiles(gameDir, modPath, replacePaths, GOVERNMENT_DIR)) {
    try {
      for (const block of scanBlocks(readFileSync(path, 'utf-8'))) ids.add(block.key)
    } catch {
      // skip unreadable files
    }
  }
  return [...ids].sort()
}

/**
 * Law ids from `common/laws`: laws are the depth-1 blocks of top-level law
 * groups. Succession laws all spell their id `*_law`, which conveniently
 * excludes realm laws (crown_authority_2) and group settings — the list feeds
 * a suggestion picker, not validation, so a stray extra id is harmless.
 */
function successionLawIds(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): string[] {
  const ids = new Set<string>()
  for (const path of effectiveFiles(gameDir, modPath, replacePaths, LAW_DIR)) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    for (const group of scanBlocks(text)) {
      const body = text.slice(group.bodyStart, group.bodyEnd)
      for (const law of scanBlocks(body)) {
        if (/_law$/i.test(law.key)) ids.add(law.key)
      }
    }
  }
  return [...ids].sort()
}

// ---------- Assembly ----------

export function getTitleData(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): TitleData {
  const named = readNamedColors(gameDir, modPath, replacePaths)
  const titles: TitleSummary[] = []
  // Mod definitions win on an id clash (vanilla itself ships a few duplicate
  // ids); children of a skipped duplicate still walk, so nothing disappears.
  const seen = new Set<string>()
  for (const path of modFirst(effectiveFiles(gameDir, modPath, replacePaths, TITLE_DIR), modPath)) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    const file = basename(path)
    const inMod = isUnderDir(path, modPath)
    walkTitles(text, (node) => {
      if (seen.has(norm(node.id))) return
      seen.add(norm(node.id))
      const scalars = scanScalarsCI(node.body)
      titles.push({
        id: node.id,
        tier: titleTier(node.id)!,
        parent: node.parent,
        file,
        inMod,
        localizedName: null,
        color: parseColor(node.body, named)?.hex ?? null,
        landless: scalars.get('landless') ?? null,
        nobleFamily: scalars.get('noble_family') ?? null,
        province: scalars.get('province') ?? null
      })
    })
  }

  const governments = governmentIds(gameDir, modPath, replacePaths)
  const laws = successionLawIds(gameDir, modPath, replacePaths)

  // Titles, governments and laws all localize under their own id. Loc keys are
  // written lowercase while script ids can be mixed-case, so both spellings go
  // into the wanted set and lookups fall back to the lowercased key.
  const wanted = new Set<string>()
  for (const list of [titles.map((t) => t.id), governments, laws]) {
    for (const id of list) {
      wanted.add(id)
      wanted.add(id.toLowerCase())
    }
  }
  const loc = readLocalization(gameDir, modPath, null, (key) => wanted.has(key))
  const locName = (id: string): string | null => loc.get(id) ?? loc.get(id.toLowerCase()) ?? null

  for (const t of titles) t.localizedName = locName(t.id)
  const entries = (ids: string[]): RefEntry[] => ids.map((id) => ({ id, name: locName(id) }))
  return { titles, governments: entries(governments), successionLaws: entries(laws) }
}

// ---------- Detail ----------

/** All `key = value` statements of a cultural_names body, in order, duplicates kept. */
function parseCulturalNames(inner: string): TitleCulturalName[] {
  const names: TitleCulturalName[] = []
  const statement = /(^|\s)([A-Za-z0-9_.\-']+)\s*=\s*(?:"([^"]*)"|([^\s{}"#=]+))/g
  for (const { text, depth } of annotateLines(inner)) {
    if (depth !== 0) continue
    const [code] = splitComment(text)
    for (const m of code.matchAll(statement)) names.push({ key: m[2], value: m[3] ?? m[4] })
  }
  return names
}

function parseDetail(
  node: TitleNode,
  file: string,
  inMod: boolean,
  named: Map<string, string>
): TitleDetail {
  const body = node.body
  const scalars = scanScalarsCI(body)
  const flags = {} as TitleFlags
  for (const key of TITLE_FLAG_KEYS) flags[key] = scalars.get(key) ?? null

  const children: string[] = []
  const scriptBlocks = new Set<string>()
  let culturalNames: TitleCulturalName[] = []
  for (const b of scanBlocks(body)) {
    if (TITLE_KEY.test(b.key)) {
      children.push(b.key)
      continue
    }
    const key = b.key.toLowerCase()
    if (key === 'color') continue
    if (key === 'cultural_names') {
      if (culturalNames.length === 0) {
        culturalNames = parseCulturalNames(body.slice(b.bodyStart, b.bodyEnd))
      }
      continue
    }
    scriptBlocks.add(b.key)
  }

  return {
    id: node.id,
    tier: titleTier(node.id)!,
    file,
    inMod,
    dejurePath: node.path,
    parent: node.parent,
    children,
    color: parseColor(body, named),
    capital: scalars.get('capital') ?? null,
    province: scalars.get('province') ?? null,
    flags,
    culturalNames,
    scriptBlocks: [...scriptBlocks]
  }
}

export function getTitle(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  id: string
): TitleDetail | null {
  const named = readNamedColors(gameDir, modPath, replacePaths)
  for (const path of modFirst(effectiveFiles(gameDir, modPath, replacePaths, TITLE_DIR), modPath)) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    const node = findTitleNode(text, id)
    if (node !== null) return parseDetail(node, basename(path), isUnderDir(path, modPath), named)
  }
  return null
}

// ---------- Saving ----------

/**
 * Line index of the first depth-0 sub-block that isn't a property (a child
 * title, or a pasted date-keyed history block), or -1 when there is none.
 * Inserted scalars land above it, with the title's other properties, instead
 * of dangling after the last child.
 */
function firstSubBlockLine(ed: LineEditor): number {
  for (let i = 0; i < ed.lines.length; i++) {
    if (ed.depths[i] !== 0) continue
    const [code] = splitComment(ed.lines[i])
    const m = code.match(/^\s*([A-Za-z0-9_.\-']+)\s*=\s*\{/)
    if (m && (TITLE_KEY.test(m[1]) || DATE_KEY.test(m[1]))) return i
  }
  return -1
}

const sameNames = (a: TitleCulturalName[], b: TitleCulturalName[]): boolean =>
  a.length === b.length && a.every((n, i) => n.key === b[i].key && n.value === b[i].value)

export function saveTitle(
  modPath: string,
  file: string,
  id: string,
  patch: TitlePatch
): SaveResult {
  try {
    const path = join(modPath, ...TITLE_DIR.split('/'), file)
    if (!existsSync(path)) return { ok: false, error: `File not found: ${file}` }
    const text = readFileSync(path, 'utf-8')
    if (text.includes('�')) {
      return { ok: false, error: `${file} isn't valid UTF-8 — edit it in a text editor instead` }
    }
    const node = findTitleNode(text, id)
    if (node === null) return { ok: false, error: `${id} not found in ${file}` }

    // Like saveFaith: the named-color palette isn't needed for the diff, since
    // a named color parses as editable: false and is never rewritten.
    const current = parseColor(node.body, new Map())
    const ed = makeEditor(setColor(node.body, patch.color, current))
    const set = (keys: string[], value: string | null): void => {
      const anchor = firstSubBlockLine(ed)
      setScalar(ed, keys, value, {
        ignoreCase: true,
        ...(anchor >= 0 ? { insertAt: anchor } : {})
      })
    }
    set(['capital'], patch.capital)
    set(['province'], patch.province)
    for (const key of TITLE_FLAG_KEYS) set([key], patch.flags[key])

    // cultural_names rewrites normalize the block's layout (dropping comments
    // inside it), so only an actually changed list is written at all.
    if (!sameNames(parseDetailNames(node.body), patch.culturalNames)) {
      setBlockBody(
        ed,
        'cultural_names',
        patch.culturalNames.length === 0
          ? null
          : (indent) => ({
              single: ` ${patch.culturalNames.map((n) => `${n.key} = ${n.value}`).join(' ')} `,
              multi: patch.culturalNames.map((n) => `${indent}${n.key} = ${n.value}`)
            })
      )
    }

    const updated =
      text.slice(0, node.absBodyStart) + ed.lines.join('\n') + text.slice(node.absBodyEnd)
    writeFileSync(path, updated, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** The current cultural_names of a title body, for the save-time diff. */
function parseDetailNames(body: string): TitleCulturalName[] {
  const block = scanBlocks(body).find((b) => b.key.toLowerCase() === 'cultural_names')
  return block ? parseCulturalNames(body.slice(block.bodyStart, block.bodyEnd)) : []
}

// ---------- Creating ----------

/** .txt files under the mod's landed_titles folder, for the create panel's picker. */
export function listTitleFiles(modPath: string): string[] {
  return listTxtFiles(join(modPath, ...TITLE_DIR.split('/')))
}

/** The mod file (name) already defining `id` at any depth, or null. */
function findModTitleFile(modPath: string, id: string): string | null {
  for (const path of effectiveFiles(null, modPath, [], TITLE_DIR)) {
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch {
      continue
    }
    if (findTitleNode(text, id) !== null) return basename(path)
  }
  return null
}

/** Leading whitespace of the line `offset` sits on. */
function lineIndentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1
  return text.slice(lineStart).match(/^[ \t]*/)![0]
}

/** One indentation unit, as the file's first indented line writes it. */
function fileIndentUnit(text: string): string {
  for (const line of text.split('\n')) {
    const m = line.match(/^([ \t]+)\S/)
    if (m) return m[1]
  }
  return '\t'
}

/** The property lines of a new title body, unindented. */
function newTitleLines(def: NewTitle): string[] {
  const lines: string[] = []
  if (def.color !== null && /^#[0-9a-fA-F]{6}$/.test(def.color)) {
    lines.push(`color = ${colorTriple(def.color)}`)
  }
  if (def.capital?.trim()) lines.push(`capital = ${def.capital.trim()}`)
  if (def.province?.trim()) lines.push(`province = ${def.province.trim()}`)
  for (const key of TITLE_FLAG_KEYS) {
    const value = def.flags[key]
    if (value !== null && value.trim() !== '') lines.push(`${key} = ${value.trim()}`)
  }
  return lines
}

/**
 * Create a brand-new title: nested into a mod-defined parent's block (de jure
 * membership comes from nesting, and CK3 offers no way to add children to a
 * block from outside it), or appended to `def.file` as a top-level block.
 * Everything outside the splice point survives byte-for-byte; nested inserts
 * follow the file's own indentation unit and line-ending style.
 */
export function createTitle(modPath: string, def: NewTitle): SaveResult {
  try {
    const id = def.id.trim()
    if (!id) return { ok: false, error: 'ID must not be empty' }
    if (!KEY_CHARS.test(id)) {
      return { ok: false, error: `Invalid ID "${id}" (letters, digits, _ . - ' only)` }
    }
    const tier = titleTier(id)
    if (tier === null) {
      return {
        ok: false,
        error: `Invalid ID "${id}" — a title id starts with its tier prefix (e_, k_, d_, c_, b_ or h_)`
      }
    }
    if (def.province?.trim() && tier !== 'barony') {
      return { ok: false, error: 'Only a barony title can carry a province' }
    }
    const clash = findModTitleFile(modPath, id)
    if (clash !== null) return { ok: false, error: `ID ${id} already exists in ${clash}` }

    const lines = newTitleLines(def)
    const parentId = def.parent?.trim() ?? ''

    if (parentId === '') {
      if (def.file === null || !isTxtFileName(def.file)) {
        return { ok: false, error: `Invalid file name "${def.file ?? ''}" (expected a .txt file name)` }
      }
      appendBlock(join(modPath, ...TITLE_DIR.split('/')), def.file, [
        `${id} = {`,
        ...lines.map((l) => `\t${l}`),
        `}`
      ])
      return { ok: true }
    }

    let found: { path: string; text: string; node: TitleNode } | null = null
    for (const path of effectiveFiles(null, modPath, [], TITLE_DIR)) {
      let text: string
      try {
        text = readFileSync(path, 'utf-8')
      } catch {
        continue
      }
      const node = findTitleNode(text, parentId)
      if (node !== null) {
        found = { path, text, node }
        break
      }
    }
    if (found === null) {
      return {
        ok: false,
        error: `Title ${parentId} isn't defined in the mod — copy it into the mod before nesting new titles under it`
      }
    }
    const parentTier = titleTier(found.node.id)
    if (parentTier !== null && TIER_RANK[tier] >= TIER_RANK[parentTier]) {
      return {
        ok: false,
        error: `A ${tier} can't be de jure part of a ${parentTier} — pick a higher-tier parent`
      }
    }
    if (found.text.includes('�')) {
      return {
        ok: false,
        error: `${basename(found.path)} isn't valid UTF-8 — edit it in a text editor instead`
      }
    }

    const { path, text, node } = found
    const eol = text.includes('\r\n') ? '\r\n' : '\n'
    const unit = fileIndentUnit(text)
    const parentIndent = lineIndentAt(text, node.absStart)
    const childIndent = parentIndent + unit
    const block = [
      `${childIndent}${id} = {`,
      ...lines.map((l) => `${childIndent}${unit}${l}`),
      `${childIndent}}`
    ]
    const inner = text.slice(node.absBodyStart, node.absBodyEnd)
    const trailing = inner.match(/\s*$/)![0]
    const content = inner.slice(0, inner.length - trailing.length)
    const closingIndent = trailing.includes('\n')
      ? trailing.slice(trailing.lastIndexOf('\n') + 1)
      : parentIndent
    const sep = content === '' ? eol : eol + eol
    const newInner = content + sep + block.join(eol) + eol + closingIndent
    writeFileSync(
      path,
      text.slice(0, node.absBodyStart) + newInner + text.slice(node.absBodyEnd),
      'utf-8'
    )
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
