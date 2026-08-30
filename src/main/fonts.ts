import { existsSync, readFileSync } from 'fs'
import { assetCandidates } from './icons'
import { isUnderDir } from './refdata'
import type { ModFont, ModFontFace, ModFonts } from '@shared/types'

/**
 * Reads `fonts/fonts.font` — the file where CK3 names its fonts and binds each
 * to the files that draw it — and resolves the two the app cares about, so the
 * renderer can install them as web fonts.
 *
 * The file layers like any other mod content: a mod shipping its own
 * `fonts/fonts.font` replaces the game's outright, and each font file it names
 * is looked up mod-first. That means a mod can redress the UI either by
 * rebinding the names or by dropping a replacement file next to the game's.
 */

const FONTS_DIR = 'fonts'
const FONTS_FILE = 'fonts.font'

/** The font used for in-game text, and here for body text. */
const STANDARD_FONT = 'StandardGameFont'
/** The font used for in-game headers, and here for headings. */
const TITLE_FONT = 'TitleFont'

/**
 * A `fontfiles` entry lists its files per language group. The app is English
 * only, so it wants that group — the others exist for scripts the file's first
 * choice can't draw.
 */
const UI_LANGUAGE = 'l_english'

/** `fontstyle = { style = … }` values, in the CSS they mean. */
const STYLES: Record<string, { weight: 'normal' | 'bold'; style: 'normal' | 'italic' }> = {
  regular: { weight: 'normal', style: 'normal' },
  bold: { weight: 'bold', style: 'normal' },
  italic: { weight: 'normal', style: 'italic' },
  'bold|italic': { weight: 'bold', style: 'italic' },
  'italic|bold': { weight: 'bold', style: 'italic' }
}

/** Font containers a browser can load, by extension. */
const FONT_TYPES: Record<string, { mime: string; format: string }> = {
  ttf: { mime: 'font/ttf', format: 'truetype' },
  otf: { mime: 'font/otf', format: 'opentype' },
  woff: { mime: 'font/woff', format: 'woff' },
  woff2: { mime: 'font/woff2', format: 'woff2' }
}

// ---------- Parsing ----------

interface Token {
  text: string
  /** Quoted tokens are always values, never `{`/`}`/`=` punctuation */
  quoted: boolean
}

/**
 * A `key = …` statement. `value` holds the scalar of `key = value`; a
 * `key = { … }` block instead fills `children` with its own statements and
 * `items` with its bare values (`files = { "a.ttf" "b.otf" }`).
 */
interface FontNode {
  key: string
  value: string | null
  children: FontNode[]
  items: string[]
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (c === '#') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    // JS counts U+FEFF as whitespace, so a leading BOM falls out here too
    if (/\s/.test(c)) {
      i++
      continue
    }
    if (c === '"') {
      i++
      const start = i
      while (i < text.length && text[i] !== '"' && text[i] !== '\n') i++
      tokens.push({ text: text.slice(start, i), quoted: true })
      if (text[i] === '"') i++
      continue
    }
    if (c === '{' || c === '}' || c === '=') {
      tokens.push({ text: c, quoted: false })
      i++
      continue
    }
    const start = i
    while (i < text.length && !/[\s"#{}=]/.test(text[i])) i++
    tokens.push({ text: text.slice(start, i), quoted: false })
  }
  return tokens
}

function isPunct(token: Token | undefined, ch: string): boolean {
  return token !== undefined && !token.quoted && token.text === ch
}

/**
 * Parse the statements of one block body, stopping after its `}`. Mod-authored
 * files carry typos, so nothing here aborts the parse: stray punctuation is
 * skipped, and a `key =` whose value is missing (real files write a bare
 * `always_load =`) yields a null value rather than swallowing the next key.
 */
function parseBody(
  tokens: Token[],
  start: number,
  top = false
): { nodes: FontNode[]; items: string[]; next: number } {
  const nodes: FontNode[] = []
  const items: string[] = []
  let i = start
  while (i < tokens.length) {
    const token = tokens[i]
    if (isPunct(token, '}')) {
      i++
      if (!top) break
      continue
    }
    if (isPunct(token, '=')) {
      i++
      continue
    }
    if (isPunct(token, '{')) {
      i = parseBody(tokens, i + 1).next
      continue
    }
    if (!isPunct(tokens[i + 1], '=')) {
      items.push(token.text)
      i++
      continue
    }
    const key = token.text
    i += 2
    const value = tokens[i]
    if (isPunct(value, '{')) {
      const block = parseBody(tokens, i + 1)
      nodes.push({ key, value: null, children: block.nodes, items: block.items })
      i = block.next
      continue
    }
    // A missing value: the token after `=` opens or closes a block, or is
    // itself the key of the next statement
    if (
      value === undefined ||
      isPunct(value, '}') ||
      isPunct(value, '=') ||
      isPunct(tokens[i + 1], '=')
    ) {
      nodes.push({ key, value: null, children: [], items: [] })
      continue
    }
    nodes.push({ key, value: value.text, children: [], items: [] })
    i++
  }
  return { nodes, items, next: i }
}

function child(node: FontNode, key: string): FontNode | undefined {
  return node.children.find((c) => c.key.toLowerCase() === key)
}

/**
 * Index blocks of one kind (`font`, `fontfiles`) by their `name =`, lowercased.
 * A name defined twice takes its last definition, as Paradox script does
 * everywhere else — that is how a mod rebinds a font it also copied in.
 */
function byName(nodes: FontNode[], key: string): Map<string, FontNode> {
  const index = new Map<string, FontNode>()
  for (const node of nodes) {
    if (node.key.toLowerCase() !== key) continue
    const name = child(node, 'name')?.value
    if (name) index.set(name.toLowerCase(), node)
  }
  return index
}

// ---------- Resolution ----------

interface ResolvedFile {
  src: string
  format: string
  /** Whether the file that was read is the mod's rather than the game's */
  fromMod: boolean
}

function readFontFile(path: string): { src: string; format: string } | null {
  const type = FONT_TYPES[path.split('.').pop()?.toLowerCase() ?? '']
  if (!type) return null
  try {
    const base64 = readFileSync(path).toString('base64')
    return { src: `data:${type.mime};base64,${base64}`, format: type.format }
  } catch {
    return null
  }
}

/**
 * Resolve a `fontfiles` entry to a file on disk. Its `files` list is a
 * fallback chain — the first entry draws the Latin alphabet and the rest fill
 * in scripts it lacks — so the first one that exists is the one to use.
 */
function resolveFontFiles(
  entry: FontNode | undefined,
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): ResolvedFile | null {
  if (!entry) return null
  const groups = entry.children.filter((c) => c.key.toLowerCase() === 'group')
  const group =
    groups.find((g) =>
      (child(g, 'languages')?.items ?? []).some((l) => l.toLowerCase() === UI_LANGUAGE)
    ) ?? groups[0]
  for (const rel of child(group ?? entry, 'files')?.items ?? []) {
    const parts = rel.replace(/\\/g, '/').split('/')
    const fileName = parts.pop()
    if (!fileName) continue
    for (const candidate of assetCandidates(
      gameDir,
      modPath,
      replacePaths,
      parts.join('/'),
      fileName
    )) {
      if (!existsSync(candidate)) continue
      const file = readFontFile(candidate)
      if (file) return { ...file, fromMod: isUnderDir(candidate, modPath) }
    }
  }
  return null
}

function buildFont(
  font: FontNode | undefined,
  entries: Map<string, FontNode>,
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): { font: ModFont; fromMod: boolean } | null {
  if (!font) return null
  const faces: ModFontFace[] = []
  let name: string | null = null
  let fromMod = false
  for (const style of font.children) {
    if (style.key.toLowerCase() !== 'fontstyle') continue
    const css = STYLES[(child(style, 'style')?.value ?? '').toLowerCase()]
    const entry = child(style, 'fontfiles')?.value
    if (!css || !entry) continue
    if (faces.some((f) => f.weight === css.weight && f.style === css.style)) continue
    const file = resolveFontFiles(entries.get(entry.toLowerCase()), gameDir, modPath, replacePaths)
    if (!file) continue
    faces.push({ weight: css.weight, style: css.style, src: file.src, format: file.format })
    fromMod = fromMod || file.fromMod
    // The regular style names the font; anything else only stands in for it
    if (name === null || (css.weight === 'normal' && css.style === 'normal')) name = entry
  }
  if (faces.length === 0 || name === null) return null
  return { font: { name, faces }, fromMod }
}

/**
 * The mod's `StandardGameFont` and `TitleFont`, ready to install as web fonts.
 *
 * Null when the mod contributes no fonts of its own — it neither overrides
 * `fonts/fonts.font` nor supplies any of the font files the effective one
 * names — since dressing the app in the base game's fonts isn't what "use mod
 * fonts" asks for.
 */
export function getModFonts(
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): ModFonts | null {
  if (!modPath) return null
  const path = assetCandidates(gameDir, modPath, replacePaths, FONTS_DIR, FONTS_FILE).find(
    (candidate) => existsSync(candidate)
  )
  if (!path) return null
  let text: string
  try {
    text = readFileSync(path, 'utf-8')
  } catch {
    return null
  }

  const { nodes } = parseBody(tokenize(text), 0, true)
  const fonts = byName(nodes, 'font')
  const entries = byName(nodes, 'fontfiles')
  const standard = buildFont(
    fonts.get(STANDARD_FONT.toLowerCase()),
    entries,
    gameDir,
    modPath,
    replacePaths
  )
  const title = buildFont(
    fonts.get(TITLE_FONT.toLowerCase()),
    entries,
    gameDir,
    modPath,
    replacePaths
  )
  if (!standard && !title) return null
  const fromMod =
    isUnderDir(path, modPath) || Boolean(standard?.fromMod) || Boolean(title?.fromMod)
  if (!fromMod) return null
  return { standard: standard?.font ?? null, title: title?.font ?? null }
}
