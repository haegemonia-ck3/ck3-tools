import { describe, expect, it } from 'vitest'
import {
  allPillars,
  buildRows,
  childrenOf,
  cultureLabel,
  findCulture,
  membersOf,
  nameLookup,
  sortMembers,
  swatchForeground
} from './cultureView'
import type { CultureCharacter, CultureData, CultureDef } from '@shared/types'

const culture = (id: string, over: Partial<CultureDef> = {}): CultureDef => ({
  id,
  file: '00_cultures.txt',
  inMod: true,
  localizedName: null,
  color: null,
  ethos: null,
  heritage: null,
  language: null,
  martialCustom: null,
  headDetermination: null,
  traditions: [],
  nameList: null,
  parents: [],
  created: null,
  coaGfx: [],
  buildingGfx: [],
  clothingGfx: [],
  unitGfx: [],
  houseCoaFrame: null,
  ethnicities: [],
  ...over
})

const character = (
  id: string,
  cultureId: string | null,
  birth: string | null = null
): CultureCharacter => ({ id, file: 'chars.txt', name: id, birth, death: null, culture: cultureId })

const data: CultureData = {
  cultures: [
    culture('Greek', {
      localizedName: 'Greek',
      color: { format: 'rgb', raw: 'rgb { 20 85 150 }', hex: '#145596' },
      heritage: 'heritage_hellenic',
      ethos: 'ethos_bellicose',
      traditions: ['tradition_a', 'tradition_b']
    }),
    // References its parent in a different case, as real files do
    culture('attic', { localizedName: 'Attic', parents: ['greek'] }),
    culture('dorian', { parents: ['GREEK'] }),
    culture('saxon', { inMod: false, localizedName: 'Saxon' })
  ],
  pillars: {
    ethos: [{ id: 'ethos_bellicose', name: 'Bellicose' }],
    heritage: [{ id: 'heritage_hellenic', name: 'Hellenic' }],
    language: [],
    martial_custom: [],
    head_determination: [{ id: 'head_determination_domain', name: 'By domain' }]
  },
  traditions: [],
  nameLists: [],
  ethnicities: [],
  gfx: { coa: [], building: [], clothing: [], unit: [], houseCoaFrame: [] },
  characters: [
    character('1', 'greek', '1050.1.1'),
    character('2', 'Greek', '1020.1.1'),
    character('3', 'attic'),
    character('4', null)
  ]
}

describe('findCulture', () => {
  it('matches ids case-insensitively and keeps the raw spelling', () => {
    expect(findCulture(data, 'GREEK')?.id).toBe('Greek')
    expect(findCulture(data, 'nope')).toBeNull()
  })
})

describe('membersOf', () => {
  it('collects characters regardless of how they spell the culture', () => {
    expect(membersOf(data, 'greek').map((c) => c.id)).toEqual(['1', '2'])
  })

  it('ignores characters with no culture', () => {
    expect(membersOf(data, 'saxon')).toEqual([])
  })
})

describe('childrenOf', () => {
  it('finds cultures naming this one as a parent, in any case', () => {
    expect(childrenOf(data, 'Greek').map((c) => c.id)).toEqual(['attic', 'dorian'])
  })

  it('is empty for a culture nothing descends from', () => {
    expect(childrenOf(data, 'attic')).toEqual([])
  })
})

describe('buildRows', () => {
  const rows = buildRows(data)

  it('counts members once per culture', () => {
    expect(rows.find((r) => r.id === 'Greek')).toMatchObject({
      name: 'Greek',
      color: '#145596',
      heritage: 'heritage_hellenic',
      traditions: 2,
      members: 2,
      inMod: true
    })
  })

  it('gives every culture a row, game ones included', () => {
    expect(rows.map((r) => r.id)).toEqual(['Greek', 'attic', 'dorian', 'saxon'])
    expect(rows.find((r) => r.id === 'saxon')?.inMod).toBe(false)
  })

  it('leaves an unlocalized culture without a name, for the id fallback', () => {
    expect(rows.find((r) => r.id === 'dorian')?.name).toBeNull()
  })
})

describe('cultureLabel', () => {
  it('prefers the localized name and falls back to the id', () => {
    expect(cultureLabel(culture('x', { localizedName: 'Ex' }))).toBe('Ex')
    expect(cultureLabel(culture('x'))).toBe('x')
  })
})

describe('nameLookup', () => {
  it('resolves ids case-insensitively, and misses to null', () => {
    const name = nameLookup(allPillars(data))
    expect(name('HERITAGE_HELLENIC')).toBe('Hellenic')
    expect(name('ethos_bellicose')).toBe('Bellicose')
    expect(name('language_none')).toBeNull()
  })
})

describe('sortMembers', () => {
  it('orders by birth year, undated last, then by id', () => {
    const members = [
      character('b', 'x', '1100.1.1'),
      character('z', 'x'),
      character('a', 'x', '1050.1.1'),
      character('c', 'x')
    ]
    expect(sortMembers(members).map((m) => m.id)).toEqual(['a', 'b', 'c', 'z'])
  })

  it('does not mutate its input', () => {
    const members = [character('b', 'x', '1100.1.1'), character('a', 'x', '1050.1.1')]
    sortMembers(members)
    expect(members.map((m) => m.id)).toEqual(['b', 'a'])
  })
})

describe('swatchForeground', () => {
  it('picks a readable contrast for light and dark fills', () => {
    expect(swatchForeground('#ffffff')).toBe('#16130f')
    expect(swatchForeground('#000000')).toBe('#ffffff')
    expect(swatchForeground('#145596')).toBe('#ffffff')
  })
})
