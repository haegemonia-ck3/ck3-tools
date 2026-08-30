import { describe, expect, it } from 'vitest'
import {
  adherentsOfReligion,
  buildRows,
  doctrineSlots,
  faithsOfReligion,
  setGroupPicks,
  ungroupedPicks
} from './faithView'
import type { DoctrineGroup, FaithDef, ReligionData, ReligionDef } from '@shared/types'

const religion = (id: string, over: Partial<ReligionDef> = {}): ReligionDef => ({
  id,
  file: 'mod.txt',
  inMod: true,
  family: 'rf_pagan',
  graphicalFaith: null,
  pietyIconGroup: null,
  doctrines: [],
  localizedName: null,
  ...over
})

const faith = (id: string, religionId: string, over: Partial<FaithDef> = {}): FaithDef => ({
  id,
  file: 'mod.txt',
  inMod: true,
  religion: religionId,
  color: { hex: '#112233', raw: '{ 1 2 3 }', editable: true },
  icon: null,
  reformedIcon: null,
  religiousHead: null,
  doctrines: [],
  holySites: [],
  localizedName: null,
  ...over
})

const group = (id: string, doctrines: string[], over: Partial<DoctrineGroup> = {}): DoctrineGroup => ({
  id,
  category: 'main_group',
  picks: 1,
  doctrines: doctrines.map((d) => ({ id: d, name: null })),
  name: null,
  ...over
})

const data = (over: Partial<ReligionData> = {}): ReligionData => ({
  religions: [],
  faiths: [],
  groups: [],
  ungroupedDoctrines: [],
  holySites: [],
  families: [],
  adherents: [],
  ...over
})

describe('buildRows', () => {
  const sample = data({
    religions: [religion('hellenism', { localizedName: 'Hellenism' })],
    faiths: [faith('olympian', 'hellenism'), faith('delian', 'Hellenism')],
    adherents: [
      { id: '1', file: 'a.txt', name: 'A', faith: 'olympian' },
      { id: '2', file: 'a.txt', name: 'B', faith: 'Olympian' },
      { id: '3', file: 'a.txt', name: 'C', faith: 'delian' },
      { id: '4', file: 'a.txt', name: 'D', faith: 'lost_faith' }
    ]
  })

  it('rolls faith adherents up to their religion, matching ids case-insensitively', () => {
    const rows = buildRows(sample)
    const hellenism = rows.find((r) => r.kind === 'religion')!
    expect(hellenism).toMatchObject({ id: 'hellenism', faiths: 2, adherents: 3, parent: 'rf_pagan' })
    expect(rows.find((r) => r.id === 'olympian')).toMatchObject({
      adherents: 2,
      parent: 'hellenism',
      color: '#112233',
      defined: true
    })
  })

  it('gives a referenced-but-undefined faith a row of its own', () => {
    const lost = buildRows(sample).find((r) => r.id === 'lost_faith')!
    expect(lost).toMatchObject({ kind: 'faith', defined: false, inMod: false, adherents: 1, file: null })
  })
})

describe('selection helpers', () => {
  const sample = data({
    religions: [religion('hellenism')],
    faiths: [faith('olympian', 'hellenism'), faith('delian', 'Hellenism'), faith('rabbinism', 'judaism')],
    adherents: [
      { id: '1', file: 'a.txt', name: null, faith: 'delian' },
      { id: '2', file: 'a.txt', name: null, faith: 'rabbinism' }
    ]
  })

  it('groups faiths under their religion regardless of spelling', () => {
    expect(faithsOfReligion(sample, 'HELLENISM').map((f) => f.id)).toEqual(['olympian', 'delian'])
    expect(adherentsOfReligion(sample, 'hellenism').map((a) => a.id)).toEqual(['1'])
  })
})

describe('doctrineSlots', () => {
  const groups = [
    group('marriage', ['monogamy', 'polygamy'], { category: 'marriage' }),
    group('tenets', ['t_a', 't_b', 't_c'], { category: 'core_tenets', picks: 3 }),
    group('head', ['no_head', 'spiritual_head'], { category: 'main_group' })
  ]

  it('orders groups by category, tenets and main doctrines first', () => {
    const slots = doctrineSlots(groups, [], [])
    expect(slots.map((s) => s.group.id)).toEqual(['tenets', 'head', 'marriage'])
  })

  it('separates a faith’s own picks from what it inherits', () => {
    const slots = doctrineSlots(groups, ['t_a', 't_c'], ['monogamy', 't_b'])
    const tenets = slots.find((s) => s.group.id === 'tenets')!
    // Own picks come back in the group's order, not the faith's
    expect(tenets.own).toEqual(['t_a', 't_c'])
    expect(tenets.inherited).toEqual(['t_b'])
    const marriage = slots.find((s) => s.group.id === 'marriage')!
    expect(marriage.own).toEqual([])
    expect(marriage.inherited).toEqual(['monogamy'])
  })

  it('finds doctrines no group claims', () => {
    expect(ungroupedPicks(groups, ['t_a', 'special_thing'])).toEqual(['special_thing'])
  })
})

describe('setGroupPicks', () => {
  const marriage = group('marriage', ['monogamy', 'polygamy'], { category: 'marriage' })

  it('swaps only the group’s own members, leaving the rest in place', () => {
    expect(setGroupPicks(['t_a', 'monogamy', 't_b'], marriage, ['polygamy'])).toEqual([
      't_a',
      't_b',
      'polygamy'
    ])
  })

  it('clears a group with an empty pick list', () => {
    expect(setGroupPicks(['monogamy', 't_a'], marriage, [])).toEqual(['t_a'])
  })
})
