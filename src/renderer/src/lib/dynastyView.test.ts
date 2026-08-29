import { describe, expect, it } from 'vitest'
import type { DynastyCharacter, DynastyData, DynastyDef, HouseDef } from '@shared/types'
import { buildRows, buildTreeNodes, makeAffiliationName } from './dynastyView'

const dyn = (id: string, over: Partial<DynastyDef> = {}): DynastyDef => ({
  id,
  file: '00_dynasties.txt',
  inMod: true,
  name: null,
  prefix: null,
  motto: null,
  culture: null,
  localizedName: null,
  ...over
})

const house = (id: string, dynasty: string | null, over: Partial<HouseDef> = {}): HouseDef => ({
  id,
  file: '00_dynasty_houses.txt',
  inMod: true,
  name: null,
  prefix: null,
  motto: null,
  dynasty,
  localizedName: null,
  ...over
})

const char = (id: string, over: Partial<DynastyCharacter> = {}): DynastyCharacter => ({
  id,
  file: 'chars.txt',
  name: null,
  birth: null,
  death: null,
  father: null,
  mother: null,
  female: false,
  dynasty: null,
  house: null,
  spouses: [],
  ...over
})

describe('buildRows', () => {
  const data: DynastyData = {
    dynasties: [dyn('Phokus')],
    houses: [
      // Case-mismatched parent ref, as in real files
      house('house_A', 'phokus'),
      house('house_Broken', 'dynn_Missing')
    ],
    characters: [
      // Carries BOTH the dynasty and one of its houses — must count once
      char('c1', { dynasty: 'phokus', house: 'house_A' }),
      char('c2', { dynasty: 'Phokus' }),
      char('c3', { house: 'house_A' }),
      char('c4', { house: 'house_dangling' }),
      char('c5', { dynasty: 'elatid' })
    ]
  }
  const rows = buildRows(data)

  it('counts a member carrying both dynasty and cadet house once', () => {
    const d = rows.find((r) => r.kind === 'dynasty' && r.id === 'Phokus')!
    expect(d.members).toBe(3) // c1, c2, c3 — c1 not double-counted
  })

  it('counts house members', () => {
    expect(rows.find((r) => r.kind === 'house' && r.id === 'house_A')!.members).toBe(2)
  })

  it('adds rows for referenced-but-undefined ids', () => {
    const danglingHouse = rows.find((r) => r.kind === 'house' && r.id === 'house_dangling')!
    expect(danglingHouse.defined).toBe(false)
    expect(danglingHouse.members).toBe(1)
    const danglingDynasty = rows.find((r) => r.kind === 'dynasty' && r.id === 'elatid')!
    expect(danglingDynasty.defined).toBe(false)
    expect(danglingDynasty.members).toBe(1)
  })

  it('adds a row for a dynasty referenced only as a house parent', () => {
    const broken = rows.find((r) => r.kind === 'dynasty' && r.id === 'dynn_Missing')!
    expect(broken.defined).toBe(false)
    expect(broken.members).toBe(0)
  })
})

describe('buildTreeNodes', () => {
  const father = char('Phokus', {
    name: 'Phokos',
    birth: '3200.1.1',
    death: '3260.1.1',
    dynasty: 'other'
  })
  const kid = char('kid1', { dynasty: 'mine', father: 'phokus', birth: '3230.1.1' })
  const data: DynastyData = {
    dynasties: [dyn('other', { localizedName: 'Otherfolk' })],
    houses: [],
    characters: [father, kid]
  }

  it('resolves a case-mismatched ghost parent to the defined character', () => {
    const nodes = buildTreeNodes([kid], data.characters, makeAffiliationName(data))
    const ghost = nodes.find((n) => n.ghost)!
    expect(ghost.id).toBe('Phokus') // resolved raw spelling, not the ref's casing
    expect(ghost.name).toBe('Phokos')
    expect(ghost.birth).toBe('3200.1.1')
    expect(ghost.ghostNote).toBe('Otherfolk')
  })

  it('still marks truly unresolved parents', () => {
    const orphan = char('o1', { father: 'nobody' })
    const nodes = buildTreeNodes([orphan], [orphan], makeAffiliationName(data))
    const ghost = nodes.find((n) => n.ghost)!
    expect(ghost.id).toBe('nobody')
    expect(ghost.ghostNote).toBe('not defined')
  })
})
