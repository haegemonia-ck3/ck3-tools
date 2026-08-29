import { annotateLines } from './pdx'

/**
 * Surgical line editor for the body slice of a `key = { ... }` block. Only
 * lines that carry an edited property change; comments, formatting and every
 * other line are preserved byte-for-byte, so a no-op edit round-trips exactly.
 */

export const SCALAR_LINE = /^(\s*)([A-Za-z0-9_.\-']+)(\s*=\s*)("([^"]*)"|[^\s{}"]+)(\s*)$/

export interface LineEditor {
  lines: string[]
  depths: number[]
  indent: string
}

export function makeEditor(body: string): LineEditor {
  const annotated = annotateLines(body)
  const lines = annotated.map((l) => l.text)
  const depths = annotated.map((l) => l.depth)
  // Detect the block's indentation from its first scalar line
  let indent = '\t'
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s+)\S/)
    if (depths[i] === 0 && m) {
      indent = m[1]
      break
    }
  }
  return { lines, depths, indent }
}

/** Recompute depths after a structural change. */
export function refresh(ed: LineEditor): void {
  const annotated = annotateLines(ed.lines.join('\n'))
  ed.lines = annotated.map((l) => l.text)
  ed.depths = annotated.map((l) => l.depth)
}

export function findScalarLine(ed: LineEditor, keys: string[], ignoreCase = false): number {
  const wanted = ignoreCase ? keys.map((k) => k.toLowerCase()) : keys
  for (let i = 0; i < ed.lines.length; i++) {
    if (ed.depths[i] !== 0) continue
    const code = ed.lines[i].split('#')[0]
    const m = code.match(SCALAR_LINE)
    if (m && wanted.includes(ignoreCase ? m[2].toLowerCase() : m[2])) return i
  }
  return -1
}

/**
 * Insertion index for the end of a block body: just before the final line when
 * it is only whitespace (a body slice runs from after `{` to before `}`, so its
 * last line is usually the closing brace's indentation), else the very end.
 */
export function endOfBodyIndex(ed: LineEditor): number {
  const last = ed.lines.length - 1
  if (last > 0 && /^\s*$/.test(ed.lines[last])) return last
  return ed.lines.length
}

export interface SetScalarOptions {
  /** Quote the value when inserting a new line (existing lines keep their style) */
  quoteNew?: boolean
  /**
   * Line index for an inserted line; defaults to the end of the body. The
   * default also keeps a single-line body (`x = { name = "y" }`) on one line
   * by appending inline; an explicit index always splices a new line.
   */
  insertAt?: number
  /** Match existing keys case-insensitively; `keys[0]` is still written as given */
  ignoreCase?: boolean
}

/**
 * Set/replace/remove a scalar. `keys` lists accepted existing spellings
 * (e.g. ['faith', 'religion']); when inserting, `keys[0]` is written.
 * Quote style of an existing line is preserved; `quoteNew` controls inserts.
 */
export function setScalar(
  ed: LineEditor,
  keys: string[],
  value: string | null,
  opts: SetScalarOptions = {}
): void {
  const idx = findScalarLine(ed, keys, opts.ignoreCase ?? false)
  if (value === null || value === '') {
    if (idx >= 0) {
      ed.lines.splice(idx, 1)
      refresh(ed)
    }
    return
  }
  if (idx >= 0) {
    const code = ed.lines[idx].split('#')[0]
    const comment = ed.lines[idx].slice(code.length)
    const m = code.match(SCALAR_LINE)!
    const wasQuoted = m[4].startsWith('"')
    ed.lines[idx] = `${m[1]}${m[2]}${m[3]}${wasQuoted ? `"${value}"` : value}${m[6]}${comment}`
    return
  }
  const statement = `${keys[0]} = ${opts.quoteNew ? `"${value}"` : value}`
  if (opts.insertAt === undefined && ed.lines.length === 1) {
    ed.lines[0] = `${ed.lines[0].replace(/\s*$/, '')} ${statement} `
    return
  }
  const at = opts.insertAt ?? endOfBodyIndex(ed)
  ed.lines.splice(at, 0, `${ed.indent}${statement}`)
  refresh(ed)
}
