import { describe, expect, it } from 'vitest'
import {
  allPillars,
  blankDraft,
  buildRows,
  childrenOf,
  cultureLabel,
  draftOf,
  findCulture,
  isRequired,
  membersOf,
  missingRequired,
  nameLookup,
  seedFrom,
  sortMembers,
  swatchForeground
} from './cultureView'
import type {
  CultureCharacter,
  CultureData,
  CultureDef,
  CulturePatch
} from '@shared/types'

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
      martialCustom: 'martial_custom_male_only',
      coaGfx: ['greek_coa_gfx'],
      buildingGfx: ['med_building_gfx'],
      traditions: ['tradition_a', 'tradition_b']
    }),
    // References its parent in a different case, as real files do
    culture('attic', {
    localizedName: 'Attic',
    parents: ['greek'],
    martialCustom: 'martial_custom_male_only',
    coaGfx: ['greek_coa_gfx'],
    buildingGfx: ['med_building_gfx']
  }),
    culture('dorian', { parents: ['GREEK'], martialCustom: 'martial_custom_equal' }),
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

describe('draftOf', () => {
  it('maps a definition to the editable draft, resolving the colour to hex', () => {
    const draft = draftOf(data.cultures[0])
    expect(draft).toMatchObject({
      color: '#145596',
      heritage: 'heritage_hellenic',
      ethos: 'ethos_bellicose',
      traditions: ['tradition_a', 'tradition_b']
    })
  })

  it('leaves a culture with no colour at null', () => {
    expect(draftOf(culture('x')).color).toBeNull()
  })
})

describe('seedFrom', () => {
  it('copies every field but makes the source the parent', () => {
    const source = culture('Greek', {
      parents: ['proto_greek'],
      ethos: 'ethos_bellicose',
      traditions: ['tradition_a']
    })
    const seed = seedFrom(source)
    expect(seed.ethos).toBe('ethos_bellicose')
    expect(seed.traditions).toEqual(['tradition_a'])
    // Its own ancestry, not the source's — and the source's spelling is kept
    expect(seed.parents).toEqual(['Greek'])
  })

  it('drops the founding date, which never carries over', () => {
    expect(seedFrom(culture('x', { created: '1050.1.1' })).created).toBeNull()
  })
})

describe('blankDraft', () => {
  it("takes the mod's most common value for the fields that have one", () => {
    const draft = blankDraft(data, '#123456')
    expect(draft.color).toBe('#123456')
    expect(draft.martialCustom).toBe('martial_custom_male_only')
    expect(draft.coaGfx).toEqual(['greek_coa_gfx'])
    expect(draft.buildingGfx).toEqual(['med_building_gfx'])
  })

  it('leaves the identity fields for the user to choose', () => {
    const draft = blankDraft(data, '#123456')
    expect(draft.ethos).toBeNull()
    expect(draft.heritage).toBeNull()
    expect(draft.language).toBeNull()
    expect(draft.nameList).toBeNull()
    expect(draft.parents).toEqual([])
    expect(draft.traditions).toEqual([])
  })

  it('starts one ethnicity row, so only the ethnicity itself is left to pick', () => {
    expect(blankDraft(data, '#123456').ethnicities).toEqual([{ weight: '100', id: '' }])
  })

  it('falls back to nothing when the mod loads no cultures at all', () => {
    const empty: CultureData = { ...data, cultures: [] }
    const draft = blankDraft(empty, '#123456')
    expect(draft.martialCustom).toBeNull()
    expect(draft.headDetermination).toBeNull()
    expect(draft.coaGfx).toEqual([])
    expect(draft.houseCoaFrame).toBeNull()
  })
})

describe('missingRequired', () => {
  const complete = (): CulturePatch => ({
    ...blankDraft(data, '#123456'),
    ethos: 'ethos_bellicose',
    heritage: 'heritage_hellenic',
    language: 'language_greek',
    martialCustom: 'martial_custom_male_only',
    nameList: 'name_list_greek',
    ethnicities: [{ weight: '100', id: 'mediterranean' }]
  })

  it('is empty for a draft the writer would accept', () => {
    expect(missingRequired(complete())).toEqual([])
  })

  it('does not ask for the graphics bundles', () => {
    const draft = { ...complete(), coaGfx: [], buildingGfx: [], clothingGfx: [], unitGfx: [] }
    expect(missingRequired(draft)).toEqual([])
  })

  it('names each unset field by its label', () => {
    expect(missingRequired({ ...complete(), color: null })).toEqual(['Colour'])
    expect(missingRequired({ ...complete(), ethos: '  ' })).toEqual(['Ethos'])
    expect(missingRequired({ ...complete(), nameList: '' })).toEqual(['Name list'])
    expect(missingRequired({ ...complete(), heritage: null, language: null })).toEqual([
      'Heritage',
      'Language'
    ])
  })

  it('counts an ethnicity row the writer would reject as missing', () => {
    expect(missingRequired({ ...complete(), ethnicities: [] })).toEqual(['Ethnicities'])
    expect(missingRequired({ ...complete(), ethnicities: [{ weight: '100', id: ' ' }] })).toEqual([
      'Ethnicities'
    ])
    expect(
      missingRequired({ ...complete(), ethnicities: [{ weight: 'lots', id: 'mediterranean' }] })
    ).toEqual(['Ethnicities'])
  })
})

describe('isRequired', () => {
  it('marks what a playable culture needs, and nothing else', () => {
    expect(isRequired('ethos')).toBe(true)
    expect(isRequired('ethnicities')).toBe(true)
    expect(isRequired('headDetermination')).toBe(false)
    expect(isRequired('coaGfx')).toBe(false)
    expect(isRequired('traditions')).toBe(false)
  })
})
