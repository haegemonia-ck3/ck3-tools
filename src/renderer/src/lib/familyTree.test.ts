import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT_OPTIONS, layoutFamilyForest, yearOf } from './familyTree'
import type {
  FamilyTreeLayout,
  FamilyTreeLayoutOptions,
  FamilyTreeNode,
  PlacedNode
} from './familyTree'

const { nodeWidth, nodeHeight, hGap, vGap, componentGap, separatorGap } = DEFAULT_LAYOUT_OPTIONS
const rowHeight = nodeHeight + vGap

function person(id: string, over: Partial<FamilyTreeNode> = {}): FamilyTreeNode {
  return {
    id,
    name: null,
    birth: null,
    death: null,
    father: null,
    mother: null,
    female: false,
    group: null,
    ghost: false,
    ghostNote: null,
    ...over
  }
}

function expectNoOverlaps(
  result: FamilyTreeLayout,
  options?: Partial<FamilyTreeLayoutOptions>
): void {
  const opts = { ...DEFAULT_LAYOUT_OPTIONS, ...options }
  const overlapping: string[] = []
  for (let i = 0; i < result.nodes.length; i++) {
    for (let j = i + 1; j < result.nodes.length; j++) {
      const a = result.nodes[i]
      const b = result.nodes[j]
      const intersects =
        a.x < b.x + opts.nodeWidth &&
        b.x < a.x + opts.nodeWidth &&
        a.y < b.y + opts.nodeHeight &&
        b.y < a.y + opts.nodeHeight
      if (intersects) overlapping.push(`${a.node.id}/${b.node.id}`)
    }
  }
  expect(overlapping).toEqual([])
}

/** Every layout produced by a test goes through here so overlap-freedom is always checked. */
function layout(
  nodes: FamilyTreeNode[],
  options?: Partial<FamilyTreeLayoutOptions>
): FamilyTreeLayout {
  const result = layoutFamilyForest(nodes, options)
  expectNoOverlaps(result, options)
  for (const p of result.nodes) {
    expect(p.x).toBeGreaterThanOrEqual(0)
    expect(p.y).toBeGreaterThanOrEqual(0)
  }
  return result
}

function placedNode(result: FamilyTreeLayout, id: string): PlacedNode {
  const found = result.nodes.find((p) => p.node.id === id)
  expect(found, `node ${id} should be placed`).toBeDefined()
  return found!
}

function centerX(p: PlacedNode): number {
  return p.x + nodeWidth / 2
}

describe('yearOf', () => {
  it('reads the leading year, tolerating the typo forms in real mod files', () => {
    expect(yearOf('3220.1.1')).toBe(3220)
    expect(yearOf('3220.1.1.')).toBe(3220)
    expect(yearOf('3212.1')).toBe(3212)
    expect(yearOf('3220')).toBe(3220)
    expect(yearOf(' 800.1.1 ')).toBe(800)
  })

  it('returns null for missing or unreadable dates', () => {
    expect(yearOf(null)).toBeNull()
    expect(yearOf('')).toBeNull()
    expect(yearOf('abc')).toBeNull()
  })
})

describe('layoutFamilyForest', () => {
  it('returns an empty layout for empty input', () => {
    expect(layout([])).toEqual({ nodes: [], edges: [], separators: [], width: 0, height: 0 })
  })

  it('places a single node at the origin', () => {
    const result = layout([person('a')])
    expect(result.nodes).toHaveLength(1)
    expect(placedNode(result, 'a')).toMatchObject({ x: 0, y: 0 })
    expect(result.edges).toEqual([])
    expect(result.separators).toEqual([])
    expect(result.width).toBe(nodeWidth)
    expect(result.height).toBe(nodeHeight)
  })

  it('stacks a three-generation father chain into depth rows', () => {
    const result = layout([
      person('c', { father: 'b' }),
      person('b', { father: 'a' }),
      person('a')
    ])
    expect(placedNode(result, 'a').y).toBe(0)
    expect(placedNode(result, 'b').y).toBe(rowHeight)
    expect(placedNode(result, 'c').y).toBe(2 * rowHeight)
    // a single-child chain keeps everyone in one column
    expect(placedNode(result, 'b').x).toBe(placedNode(result, 'a').x)
    expect(placedNode(result, 'c').x).toBe(placedNode(result, 'a').x)
    expect(result.edges).toEqual([
      { fromId: 'b', toId: 'c', kind: 'primary' },
      { fromId: 'a', toId: 'b', kind: 'primary' }
    ])
    expect(result.height).toBe(3 * nodeHeight + 2 * vGap)
  })

  it('fans out 40 siblings without overlap, parent centered over them', () => {
    const kids = Array.from({ length: 40 }, (_, i) =>
      person(`kid${String(i).padStart(2, '0')}`, { father: 'dad', birth: `${800 + i}.1.1` })
    )
    const result = layout([person('dad'), ...kids])

    const first = placedNode(result, 'kid00')
    const last = placedNode(result, 'kid39')
    for (let i = 0; i < 40; i++) {
      const kid = placedNode(result, `kid${String(i).padStart(2, '0')}`)
      expect(kid.y).toBe(rowHeight)
      expect(kid.x).toBe(i * (nodeWidth + hGap)) // birth order, left to right
    }
    expect(centerX(placedNode(result, 'dad'))).toBe((centerX(first) + centerX(last)) / 2)
    expect(result.width).toBe(40 * nodeWidth + 39 * hGap)
  })

  it('separates two islands 257 years apart with a labeled gap', () => {
    const result = layout([
      person('old', { birth: '800.1.1', death: '850.1.1' }),
      person('new', { birth: '1107.1.1' })
    ])
    expect(result.separators).toEqual([
      { y: nodeHeight + separatorGap / 2, gapYears: 257, fromYear: 850, toYear: 1107 }
    ])
    expect(placedNode(result, 'old').y).toBe(0)
    expect(placedNode(result, 'new').y).toBe(nodeHeight + separatorGap)
    expect(result.height).toBe(2 * nodeHeight + separatorGap)
  })

  it('stacks islands chronologically even when the input is reverse ordered', () => {
    const result = layout([
      person('late', { birth: '1500.1.1' }),
      person('mid', { birth: '1100.1.1' }),
      person('early', { birth: '700.1.1' })
    ])
    expect(placedNode(result, 'early').y).toBeLessThan(placedNode(result, 'mid').y)
    expect(placedNode(result, 'mid').y).toBeLessThan(placedNode(result, 'late').y)
    expect(result.separators).toHaveLength(2)
  })

  it('sorts an undated island last with a plain gap and no separator', () => {
    const result = layout([
      person('undated'),
      person('dated', { birth: '800.1.1', death: '860.1.1' })
    ])
    expect(placedNode(result, 'dated').y).toBe(0)
    expect(placedNode(result, 'undated').y).toBe(nodeHeight + componentGap)
    expect(result.separators).toEqual([])
  })

  it('terminates on a parent cycle and places both nodes', () => {
    const result = layout([person('a', { father: 'b' }), person('b', { father: 'a' })])
    expect(result.nodes).toHaveLength(2)
    // the revisited link (b -> a) is dropped; b roots the tree, a stays its child
    expect(result.edges).toEqual([{ fromId: 'b', toId: 'a', kind: 'primary' }])
    expect(placedNode(result, 'b').y).toBe(0)
    expect(placedNode(result, 'a').y).toBe(rowHeight)
  })

  it('keeps the first occurrence of a duplicated id', () => {
    const result = layout([person('x', { name: 'First' }), person('x', { name: 'Second' })])
    expect(result.nodes).toHaveLength(1)
    expect(placedNode(result, 'x').node.name).toBe('First')
  })

  it('matches parent references case-insensitively, preserving the defined spelling', () => {
    const result = layout([person('Phokus'), person('kid', { father: 'PHOKUS' })])
    expect(result.edges).toEqual([{ fromId: 'Phokus', toId: 'kid', kind: 'primary' }])
  })

  it('promotes a mother-only link to the primary edge', () => {
    const result = layout([person('mom', { female: true }), person('kid', { mother: 'mom' })])
    expect(result.edges).toEqual([{ fromId: 'mom', toId: 'kid', kind: 'primary' }])
    expect(placedNode(result, 'kid').y).toBe(rowHeight)
  })

  it('emits a primary father edge and a secondary mother edge when both are present', () => {
    const result = layout([
      person('dad'),
      person('mom', { female: true }),
      person('kid', { father: 'dad', mother: 'mom' })
    ])
    expect(result.edges).toEqual([
      { fromId: 'dad', toId: 'kid', kind: 'primary' },
      { fromId: 'mom', toId: 'kid', kind: 'secondary' }
    ])
    // the secondary edge still pulls all three into one component
    expect(result.separators).toEqual([])
    expect(placedNode(result, 'dad').y).toBe(0)
    expect(placedNode(result, 'mom').y).toBe(0)
    expect(placedNode(result, 'kid').y).toBe(rowHeight)
  })

  it('ignores dangling and self parent references', () => {
    const result = layout([person('a', { father: 'nowhere' }), person('b', { father: 'b' })])
    expect(result.edges).toEqual([])
    expect(placedNode(result, 'a').y).toBe(0)
  })

  it('lays out ghost nodes like normal nodes', () => {
    const result = layout([
      person('outsider', { ghost: true, ghostNote: 'House Karling' }),
      person('kid', { father: 'outsider' })
    ])
    expect(result.edges).toEqual([{ fromId: 'outsider', toId: 'kid', kind: 'primary' }])
    expect(placedNode(result, 'outsider').y).toBe(0)
    expect(placedNode(result, 'kid').y).toBe(rowHeight)
  })

  it('sorts siblings by year through sloppy dates, undated last', () => {
    const result = layout([
      person('dad'),
      person('younger', { father: 'dad', birth: '3220.1.1.' }),
      person('undated', { father: 'dad' }),
      person('older', { father: 'dad', birth: '3212.1' })
    ])
    const xs = ['older', 'younger', 'undated'].map((id) => placedNode(result, id).x)
    expect(xs[0]).toBeLessThan(xs[1])
    expect(xs[1]).toBeLessThan(xs[2])
  })

  it('is deterministic across runs', () => {
    const nodes = [
      person('late', { birth: '1500.1.1' }),
      person('kid', { father: 'dad', mother: 'mom', birth: '820.1.1' }),
      person('dad', { birth: '800.1.1', death: '850.1.1' }),
      person('mom', { female: true, birth: '801.1.1' }),
      person('loop1', { father: 'loop2' }),
      person('loop2', { father: 'loop1' }),
      person('dupe', { name: 'First' }),
      person('dupe', { name: 'Second' }),
      person('ghost', { ghost: true, birth: '3212.1' })
    ]
    expect(layout(nodes)).toEqual(layout(nodes))
  })
})

describe('review regressions', () => {
  it('parses 5-digit years', () => {
    expect(yearOf('10000.1.1')).toBe(10000)
  })

  it('orders an island with only death years by that year, not as undated', () => {
    const result = layoutFamilyForest([
      person('later', { birth: '2000.1.1' }),
      person('deathonly', { death: '500.1.1' })
    ])
    const early = placedNode(result, 'deathonly')
    const late = placedNode(result, 'later')
    expect(early.y).toBeLessThan(late.y)
    // The 1500-year hole between them earns a separator
    expect(result.separators).toHaveLength(1)
    expect(result.separators[0].gapYears).toBe(1500)
  })
})
