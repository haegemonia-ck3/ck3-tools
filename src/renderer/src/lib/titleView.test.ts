import { describe, expect, it } from 'vitest'
import {
  buildTree,
  defaultHistoryFile,
  flattenTree,
  matchesQuery,
  pruneToMod,
  sortEntries,
  titleKindLabel
} from './titleView'
import type { TitleHistoryEntry, TitleSummary } from '@shared/types'

const t = (partial: Partial<TitleSummary> & { id: string }): TitleSummary => ({
  tier: 'duchy',
  parent: null,
  file: 'mock.txt',
  inMod: true,
  localizedName: null,
  color: null,
  landless: null,
  nobleFamily: null,
  province: null,
  hasHistory: false,
  ...partial
})

const entry = (
  partial: Partial<TitleHistoryEntry> & { date: string }
): TitleHistoryEntry => ({
  file: 'mock.txt',
  inMod: true,
  titleBlock: 0,
  index: 0,
  holder: null,
  liege: null,
  deJureLiege: null,
  government: null,
  changeDevelopmentLevel: null,
  developmentLevel: null,
  name: null,
  resetName: null,
  insertTitleHistory: null,
  removeSuccessionLaws: null,
  holderIgnoreHeadOfFaithRequirement: null,
  successionLaws: null,
  opaqueBlocks: [],
  extra: [],
  ...partial
})

describe('buildTree', () => {
  it('reconstructs the forest from parent pointers, case-insensitively', () => {
    const titles = [
      t({ id: 'e_top', tier: 'empire' }),
      t({ id: 'k_mid', tier: 'kingdom', parent: 'E_TOP' }),
      t({ id: 'b_leaf', tier: 'barony', parent: 'k_mid' }),
      t({ id: 'd_orphan', parent: 'k_missing' })
    ]
    const roots = buildTree(titles)
    expect(roots.map((n) => n.title.id)).toEqual(['e_top', 'd_orphan'])
    expect(roots[0].children[0].title.id).toBe('k_mid')
    expect(roots[0].children[0].children[0].title.id).toBe('b_leaf')
  })

  it('never loses a self-parented title', () => {
    const roots = buildTree([t({ id: 'd_weird', parent: 'd_weird' })])
    expect(roots.map((n) => n.title.id)).toEqual(['d_weird'])
  })
})

describe('pruneToMod', () => {
  it('keeps mod titles and the game ancestors above them', () => {
    const roots = buildTree([
      t({ id: 'e_game', tier: 'empire', inMod: false }),
      t({ id: 'k_game', tier: 'kingdom', parent: 'e_game', inMod: false }),
      t({ id: 'd_mine', parent: 'k_game', inMod: true }),
      t({ id: 'k_other_game', tier: 'kingdom', parent: 'e_game', inMod: false })
    ])
    const pruned = pruneToMod(roots)
    expect(flattenTree(pruned).map((x) => x.id)).toEqual(['e_game', 'k_game', 'd_mine'])
  })
})

describe('matchesQuery / titleKindLabel', () => {
  it('matches on id or localized name', () => {
    const title = t({ id: 'k_lakonia', localizedName: 'Lakedaimon' })
    expect(matchesQuery(title, 'lakon')).toBe(true)
    expect(matchesQuery(title, 'DAIMON')).toBe(true)
    expect(matchesQuery(title, 'athens')).toBe(false)
    expect(matchesQuery(title, '  ')).toBe(true)
  })

  it('labels special kinds from raw flags', () => {
    expect(titleKindLabel(t({ id: 'c_nf_x', nobleFamily: 'yes', landless: 'yes' }))).toBe(
      'noble family'
    )
    expect(titleKindLabel(t({ id: 'd_laamp_x', landless: 'yes' }))).toBe('landless')
    expect(titleKindLabel(t({ id: 'd_x', landless: 'no' }))).toBeNull()
  })
})

describe('sortEntries', () => {
  it('sorts chronologically with typo dates, keeping ties in file order', () => {
    const entries = [
      entry({ date: '3400.1.1', index: 0 }),
      entry({ date: '3200.1.1', index: 1 }),
      entry({ date: '3254.1.1', index: 2 }),
      entry({ date: '3254.1.1', index: 3 }),
      entry({ date: '3210.1.1.', index: 4 }),
      entry({ date: '3300.1', index: 5 }),
      entry({ date: 'garbage', index: 6 })
    ]
    expect(sortEntries(entries).map((e) => e.index)).toEqual([1, 4, 2, 3, 5, 0, 6])
  })
})

describe('defaultHistoryFile', () => {
  it('prefers the last mod file already holding entries', () => {
    expect(
      defaultHistoryFile([
        entry({ date: '1.1.1', inMod: false, file: 'game.txt' }),
        entry({ date: '2.1.1', file: 'a.txt' }),
        entry({ date: '3.1.1', file: 'b.txt' })
      ])
    ).toBe('b.txt')
    expect(defaultHistoryFile([entry({ date: '1.1.1', inMod: false })])).toBeNull()
  })
})
