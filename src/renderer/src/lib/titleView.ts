import type { TitleHistoryEntry, TitleSummary, TitleTier } from '@shared/types'
import { dateSortKey } from './ck3Date'

/** Id comparison key, matching how the rest of the app compares raw file ids. */
export const normId = (id: string): string => id.trim().toLowerCase()

export const TIER_LABEL: Record<TitleTier, string> = {
  hegemony: 'Hegemony',
  empire: 'Empire',
  kingdom: 'Kingdom',
  duchy: 'Duchy',
  county: 'County',
  barony: 'Barony'
}

/** Higher number = higher tier; a child must sit strictly below its parent. */
export const TIER_RANK: Record<TitleTier, number> = {
  hegemony: 5,
  empire: 4,
  kingdom: 3,
  duchy: 2,
  county: 1,
  barony: 0
}

export function findTitle(titles: TitleSummary[], id: string): TitleSummary | null {
  return titles.find((t) => normId(t.id) === normId(id)) ?? null
}

export const titleName = (t: TitleSummary): string => t.localizedName ?? t.id

const isYes = (value: string | null): boolean => value?.trim().toLowerCase() === 'yes'

/** Badge-worthy special kind, read off the summary's raw flags. */
export function titleKindLabel(t: TitleSummary): string | null {
  if (isYes(t.nobleFamily)) return 'noble family'
  if (isYes(t.requireLandless)) return 'adventurer'
  if (isYes(t.landless)) return 'landless'
  return null
}

/** Which glyph a tree row wears, from the summary's raw flags. */
export type TitleGlyphKind = 'title' | 'house' | 'adventurer' | 'landless'

export function titleGlyphKind(t: TitleSummary): TitleGlyphKind {
  if (isYes(t.nobleFamily)) return 'house'
  // require_landless is the structural mark of a landless-adventurer title
  if (isYes(t.requireLandless)) return 'adventurer'
  if (isYes(t.landless)) return 'landless'
  return 'title'
}

/** One node of the de jure forest. */
export interface TitleTreeNode {
  title: TitleSummary
  children: TitleTreeNode[]
}

/**
 * The de jure forest from the flat summary list. Parent pointers are matched
 * case-insensitively; a title whose parent isn't in the list (or is itself)
 * becomes a root, so nothing ever disappears from the browser.
 */
export function buildTree(titles: TitleSummary[]): TitleTreeNode[] {
  const nodes = new Map<string, TitleTreeNode>()
  for (const t of titles) {
    if (!nodes.has(normId(t.id))) nodes.set(normId(t.id), { title: t, children: [] })
  }
  const roots: TitleTreeNode[] = []
  for (const t of titles) {
    const node = nodes.get(normId(t.id))!
    if (node.title !== t) continue
    const parent = t.parent === null ? undefined : nodes.get(normId(t.parent))
    if (parent !== undefined && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/**
 * The forest narrowed to the mod's own contribution: a node survives when it
 * is mod-defined or an ancestor of something that is, so a mod barony under a
 * game county keeps its chain visible.
 */
export function pruneToMod(nodes: TitleTreeNode[]): TitleTreeNode[] {
  const pruned: TitleTreeNode[] = []
  for (const node of nodes) {
    const children = pruneToMod(node.children)
    if (node.title.inMod || children.length > 0) pruned.push({ title: node.title, children })
  }
  return pruned
}

/** Every summary of the forest, depth first — the searchable set for a view. */
export function flattenTree(nodes: TitleTreeNode[]): TitleSummary[] {
  const out: TitleSummary[] = []
  const walk = (list: TitleTreeNode[]): void => {
    for (const node of list) {
      out.push(node.title)
      walk(node.children)
    }
  }
  walk(nodes)
  return out
}

/** Case-insensitive match on the id or the localized name. */
export function matchesQuery(t: TitleSummary, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (q === '') return true
  return t.id.toLowerCase().includes(q) || (t.localizedName?.toLowerCase().includes(q) ?? false)
}

/**
 * Timeline order for history entries: chronological by lenient date, ties and
 * unparseable dates keeping their file order (real files are deliberately
 * out of order on disk — only the view sorts).
 */
export function sortEntries(entries: TitleHistoryEntry[]): TitleHistoryEntry[] {
  return entries
    .map((entry, at) => ({ entry, at }))
    .sort((a, b) => {
      const ka = dateSortKey(a.entry.date, 'start') ?? Number.MAX_SAFE_INTEGER
      const kb = dateSortKey(b.entry.date, 'start') ?? Number.MAX_SAFE_INTEGER
      return ka - kb || a.at - b.at
    })
    .map((x) => x.entry)
}

/**
 * The mod file a new entry for this title should default to: the file already
 * holding its mod entries (the last one, matching where the backend appends),
 * else null — the caller offers the mod's files or a new name.
 */
export function defaultHistoryFile(entries: TitleHistoryEntry[]): string | null {
  const inMod = entries.filter((e) => e.inMod)
  return inMod.length > 0 ? inMod[inMod.length - 1].file : null
}
