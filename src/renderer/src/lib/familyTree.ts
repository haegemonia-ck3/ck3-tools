/**
 * Pure layout engine for dynasty/house family trees.
 *
 * Real mod history is a FOREST, not a tree: founders and mid-timeline orphans
 * have no parent links, so a dynasty falls apart into disconnected islands,
 * sometimes centuries apart (a member is defined, then nobody for 250 years).
 * The layout stacks those islands chronologically and reports the time gaps
 * between them so the renderer can draw dotted "N years pass" separators.
 *
 * No React, no DOM — unit-testable in node.
 */

export interface FamilyTreeNode {
  id: string
  name: string | null
  /** Raw CK3 dates as written in the file (may be sloppy: "3220.1.1.", "3212.1") */
  birth: string | null
  death: string | null
  /** Parent character ids; edges are only drawn between provided nodes */
  father: string | null
  mother: string | null
  female: boolean
  /** Grouping id used for coloring (house id); null = no house */
  group: string | null
  /** Context node outside the displayed dynasty/house (e.g. an external parent) */
  ghost: boolean
  /** Extra line shown on ghosts, e.g. their own dynasty's name */
  ghostNote: string | null
}

export interface FamilyTreeLayoutOptions {
  nodeWidth: number
  nodeHeight: number
  /** Horizontal gap between sibling subtrees */
  hGap: number
  /** Vertical gap between generation rows */
  vGap: number
  /** Vertical gap between disconnected components (no notable time gap) */
  componentGap: number
  /** Extra vertical space reserved for a labeled time-gap separator */
  separatorGap: number
  /** Minimum year difference between islands that earns a labeled separator */
  gapYearsThreshold: number
}

export const DEFAULT_LAYOUT_OPTIONS: FamilyTreeLayoutOptions = {
  nodeWidth: 176,
  nodeHeight: 60,
  hGap: 14,
  vGap: 44,
  componentGap: 48,
  separatorGap: 72,
  gapYearsThreshold: 50
}

export interface PlacedNode {
  node: FamilyTreeNode
  /** Top-left corner */
  x: number
  y: number
}

export interface FamilyTreeEdge {
  fromId: string
  toId: string
  /**
   * The hierarchy edge (father when both parents are present) vs. the extra
   * link to the other parent, drawn differently by the renderer.
   */
  kind: 'primary' | 'secondary'
}

/** A dotted horizontal separator between chronologically distant islands. */
export interface GapSeparator {
  /** Vertical center of the separator strip */
  y: number
  /** Year distance between the islands (null when either side has no dates) */
  gapYears: number | null
  /** Last year of the island above (max of death-or-birth years) */
  fromYear: number | null
  /** First birth year of the island below */
  toYear: number | null
}

export interface FamilyTreeLayout {
  nodes: PlacedNode[]
  edges: FamilyTreeEdge[]
  separators: GapSeparator[]
  width: number
  height: number
}

/** Leading year of a raw CK3 date ("3220.1.1." → 3220), any digit count, or null. */
export function yearOf(date: string | null): number | null {
  if (!date) return null
  const m = /^(\d+)(?:\.|$)/.exec(date.trim())
  return m ? Number(m[1]) : null
}

/**
 * Lay out a family forest.
 *
 * - Hierarchy edge per node: father if he's among `nodes`, else mother; when
 *   both are present the mother link becomes a `secondary` edge.
 * - Connected components (over both edge kinds) are laid out independently and
 *   stacked vertically, ordered by earliest known year (undated islands last);
 *   gaps of at least `gapYearsThreshold` years produce labeled separators.
 * - Within a component, generation = depth along hierarchy edges from a root;
 *   subtrees are packed left-to-right with parents centered over children,
 *   children ordered by birth year. Parent cycles (bad data) are broken rather
 *   than looping forever. Duplicate ids: first occurrence wins.
 */
export function layoutFamilyForest(
  nodes: FamilyTreeNode[],
  options?: Partial<FamilyTreeLayoutOptions>
): FamilyTreeLayout {
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options }

  // Dedupe by normalized id, first occurrence wins. Ids and parent references
  // are matched case-insensitively (real files reference 'Phokus' as 'phokus')
  // but the node's raw spelling is preserved in the output.
  const byKey = new Map<string, FamilyTreeNode>()
  const order: string[] = []
  for (const node of nodes) {
    const key = normalizeId(node.id)
    if (!byKey.has(key)) {
      byKey.set(key, node)
      order.push(key)
    }
  }

  // One hierarchy (primary) parent per node: father if present among the
  // nodes, else mother; with both present the mother link is secondary.
  const primaryParent = new Map<string, string>()
  const secondaryParent = new Map<string, string>()
  for (const key of order) {
    const node = byKey.get(key)!
    const fatherKey = parentKeyOf(node.father, key, byKey)
    const motherKey = parentKeyOf(node.mother, key, byKey)
    if (fatherKey !== null) {
      primaryParent.set(key, fatherKey)
      if (motherKey !== null) secondaryParent.set(key, motherKey)
    } else if (motherKey !== null) {
      primaryParent.set(key, motherKey)
    }
  }

  breakParentCycles(order, primaryParent)

  // Connected components via union over both edge kinds. Dropping a cycle
  // edge never disconnects anything (a cycle minus one edge stays connected).
  const uf = new Map<string, string>()
  const find = (key: string): string => {
    let root = key
    while (uf.get(root) !== root && uf.has(root)) root = uf.get(root)!
    let cur = key
    while (cur !== root) {
      const next = uf.get(cur)!
      uf.set(cur, root)
      cur = next
    }
    return root
  }
  for (const key of order) uf.set(key, key)
  for (const [child, parent] of primaryParent) uf.set(find(child), find(parent))
  for (const [child, parent] of secondaryParent) uf.set(find(child), find(parent))

  const componentsByRoot = new Map<string, string[]>()
  for (const key of order) {
    const root = find(key)
    const members = componentsByRoot.get(root)
    if (members) members.push(key)
    else componentsByRoot.set(root, [key])
  }

  const children = new Map<string, string[]>()
  for (const [child, parent] of primaryParent) {
    const kids = children.get(parent)
    if (kids) kids.push(child)
    else children.set(parent, [child])
  }
  const byBirthThenId = (a: string, b: string): number => {
    const ya = yearOf(byKey.get(a)!.birth)
    const yb = yearOf(byKey.get(b)!.birth)
    if (ya !== yb) {
      if (ya === null) return 1
      if (yb === null) return -1
      return ya - yb
    }
    return a < b ? -1 : a > b ? 1 : 0
  }
  for (const kids of children.values()) kids.sort(byBirthThenId)

  const components: LaidOutComponent[] = []
  for (const members of componentsByRoot.values()) {
    components.push(layoutComponent(members, primaryParent, children, byKey, opts, byBirthThenId))
  }
  // Chronological stacking by the earliest KNOWN year (death years count too,
  // so an island whose members only have death dates isn't sorted as undated)
  components.sort((a, b) => {
    if (a.firstYear !== b.firstYear) {
      if (a.firstYear === null) return 1
      if (b.firstYear === null) return -1
      return a.firstYear - b.firstYear
    }
    return a.minId < b.minId ? -1 : a.minId > b.minId ? 1 : 0
  })

  // Stack components; a boundary with a known gap of at least the threshold
  // reserves the separator strip, everything else the plain component gap.
  const separators: GapSeparator[] = []
  const offsetY = new Map<LaidOutComponent, number>()
  let y = 0
  let width = 0
  for (let i = 0; i < components.length; i++) {
    const comp = components[i]
    if (i > 0) {
      const above = components[i - 1]
      const gapYears =
        comp.firstYear !== null && above.lastYear !== null
          ? comp.firstYear - above.lastYear
          : null
      if (gapYears !== null && gapYears >= opts.gapYearsThreshold) {
        separators.push({
          y: y + opts.separatorGap / 2,
          gapYears,
          fromYear: above.lastYear,
          toYear: comp.firstYear
        })
        y += opts.separatorGap
      } else {
        y += opts.componentGap
      }
    }
    offsetY.set(comp, y)
    y += comp.height
    width = Math.max(width, comp.width)
  }

  const placed = new Map<string, PlacedNode>()
  for (const comp of components) {
    const dy = offsetY.get(comp)!
    for (const [key, pos] of comp.positions) {
      placed.set(key, { node: byKey.get(key)!, x: pos.x, y: pos.y + dy })
    }
  }

  const edges: FamilyTreeEdge[] = []
  for (const key of order) {
    const primary = primaryParent.get(key)
    if (primary !== undefined) {
      edges.push({ fromId: byKey.get(primary)!.id, toId: byKey.get(key)!.id, kind: 'primary' })
    }
    const secondary = secondaryParent.get(key)
    if (secondary !== undefined) {
      edges.push({ fromId: byKey.get(secondary)!.id, toId: byKey.get(key)!.id, kind: 'secondary' })
    }
  }

  return {
    nodes: order.map((key) => placed.get(key)!),
    edges,
    separators,
    width,
    height: y
  }
}

function normalizeId(id: string): string {
  return id.trim().toLowerCase()
}

/** Resolved parent key, or null for missing, dangling, or self references. */
function parentKeyOf(
  ref: string | null,
  selfKey: string,
  byKey: Map<string, FamilyTreeNode>
): string | null {
  if (ref === null) return null
  const key = normalizeId(ref)
  return key !== selfKey && byKey.has(key) ? key : null
}

/**
 * Walks every primary-parent chain; when a chain revisits a node the revisited
 * link's child loses its primary edge and becomes a root, so bad data like
 * "A father of B, B father of A" terminates instead of looping.
 */
function breakParentCycles(order: string[], primaryParent: Map<string, string>): void {
  const settled = new Set<string>()
  for (const start of order) {
    if (settled.has(start)) continue
    const path: string[] = []
    const onPath = new Set<string>()
    let cur = start
    while (!settled.has(cur)) {
      if (onPath.has(cur)) {
        primaryParent.delete(path[path.length - 1])
        break
      }
      onPath.add(cur)
      path.push(cur)
      const parent = primaryParent.get(cur)
      if (parent === undefined) break
      cur = parent
    }
    for (const key of path) settled.add(key)
  }
}

interface LaidOutComponent {
  /** Component-local coordinates; shifted down by the stacking offset later */
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
  /** Min of all birth and death years — used for chronological ordering */
  firstYear: number | null
  /** Max of all birth and death years — the island's "last seen" year */
  lastYear: number | null
  /** Smallest normalized id, for deterministic ordering of undated islands */
  minId: string
}

function layoutComponent(
  members: string[],
  primaryParent: Map<string, string>,
  children: Map<string, string[]>,
  byKey: Map<string, FamilyTreeNode>,
  opts: FamilyTreeLayoutOptions,
  byBirthThenId: (a: string, b: string) => number
): LaidOutComponent {
  const roots = members.filter((key) => !primaryParent.has(key)).sort(byBirthThenId)

  // Subtree span = max(nodeWidth, packed width of the children row); child
  // spans are disjoint by construction, which is what makes overlap impossible.
  const spans = new Map<string, number>()
  const spanOf = (key: string): number => {
    const cached = spans.get(key)
    if (cached !== undefined) return cached
    const kids = children.get(key)
    let span = opts.nodeWidth
    if (kids && kids.length > 0) {
      let total = opts.hGap * (kids.length - 1)
      for (const kid of kids) total += spanOf(kid)
      span = Math.max(span, total)
    }
    spans.set(key, span)
    return span
  }

  const positions = new Map<string, { x: number; y: number }>()
  let maxDepth = 0
  const place = (key: string, left: number, depth: number): void => {
    maxDepth = Math.max(maxDepth, depth)
    const y = depth * (opts.nodeHeight + opts.vGap)
    const kids = children.get(key)
    if (!kids || kids.length === 0) {
      positions.set(key, { x: left, y })
      return
    }
    let cursor = left
    for (const kid of kids) {
      place(kid, cursor, depth + 1)
      cursor += spanOf(kid) + opts.hGap
    }
    const first = positions.get(kids[0])!.x + opts.nodeWidth / 2
    const last = positions.get(kids[kids.length - 1])!.x + opts.nodeWidth / 2
    positions.set(key, { x: (first + last) / 2 - opts.nodeWidth / 2, y })
  }

  let cursor = 0
  for (const root of roots) {
    place(root, cursor, 0)
    cursor += spanOf(root) + 2 * opts.hGap
  }

  let firstYear: number | null = null
  let lastYear: number | null = null
  let minId = members[0]
  for (const key of members) {
    const node = byKey.get(key)!
    const birth = yearOf(node.birth)
    const death = yearOf(node.death)
    for (const year of [birth, death]) {
      if (year === null) continue
      if (firstYear === null || year < firstYear) firstYear = year
      if (lastYear === null || year > lastYear) lastYear = year
    }
    if (key < minId) minId = key
  }

  return {
    positions,
    width: cursor - 2 * opts.hGap,
    height: (maxDepth + 1) * opts.nodeHeight + maxDepth * opts.vGap,
    firstYear,
    lastYear,
    minId
  }
}
