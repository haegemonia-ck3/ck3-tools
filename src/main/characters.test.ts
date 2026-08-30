import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createCharacter, getCharacter, listCharacterFiles, saveCharacter } from './characters'
import type { CharacterDetail } from '@shared/types'

// Synthetic mod layout in a temp dir — never touches real CK3 files
const modPath = mkdtempSync(join(tmpdir(), 'ck3-tools-characters-'))
const file = 'test_characters.txt'

const SOURCE = [
  '219 = {',
  '\tname = "Alexios"',
  '\tdynasty = dynn_Mock',
  '\tfather = 218',
  '\tmother = 217 # her',
  '\tculture = greek',
  '\treligion = orthodox',
  '\ttrait = brave',
  '\t1050.1.1 = {',
  '\t\tbirth = yes',
  '\t}',
  '}',
  '',
  '218 = {',
  '\tname = "Ioannes"',
  '\t1020.1.1 = {',
  '\t\tbirth = yes',
  '\t}',
  '}',
  ''
].join('\n')

const path = join(modPath, 'history', 'characters', file)
mkdirSync(join(path, '..'), { recursive: true })

beforeEach(() => writeFileSync(path, SOURCE, 'utf-8'))
afterAll(() => rmSync(modPath, { recursive: true, force: true }))

describe('father/mother', () => {
  it('parses both parents', () => {
    const detail = getCharacter(modPath, file, '219')!
    expect(detail.father).toBe('218')
    expect(detail.mother).toBe('217')
  })

  it('reads a missing parent as null', () => {
    const detail = getCharacter(modPath, file, '218')!
    expect(detail.father).toBeNull()
    expect(detail.mother).toBeNull()
  })

  it('round-trips byte-for-byte on a no-op save', () => {
    const detail = getCharacter(modPath, file, '219')!
    expect(saveCharacter(modPath, file, '219', detail)).toEqual({ ok: true })
    expect(readFileSync(path, 'utf-8')).toBe(SOURCE)
  })

  it('rewrites a parent in place, keeping the trailing comment', () => {
    const detail = getCharacter(modPath, file, '219')!
    expect(saveCharacter(modPath, file, '219', { ...detail, mother: '216' })).toEqual({ ok: true })
    expect(readFileSync(path, 'utf-8')).toContain('\tmother = 216 # her\n')
    expect(getCharacter(modPath, file, '219')!.mother).toBe('216')
  })

  it('removes a parent line when cleared', () => {
    const detail = getCharacter(modPath, file, '219')!
    expect(saveCharacter(modPath, file, '219', { ...detail, father: null })).toEqual({ ok: true })
    expect(readFileSync(path, 'utf-8')).not.toContain('father')
    expect(getCharacter(modPath, file, '219')!.father).toBeNull()
  })

  it('inserts a parent above the date blocks', () => {
    const detail = getCharacter(modPath, file, '218')!
    expect(saveCharacter(modPath, file, '218', { ...detail, father: '210' })).toEqual({ ok: true })
    const text = readFileSync(path, 'utf-8')
    expect(text).toContain('\tfather = 210\n\t1020.1.1 = {')
    // The other character's block is untouched
    expect(text).toContain('\tmother = 217 # her\n')
  })
})

// Multi-line `death = { death_reason = … }` blocks, as vanilla history uses
const MULTI_DEATH = [
  '300 = {',
  '\tname = "Symeon"',
  '\t900.1.1 = {',
  '\t\tbirth = yes',
  '\t}',
  '\t960.4.2 = {',
  '\t\tdeath = {',
  '\t\t\tdeath_reason = death_murder',
  '\t\t}',
  '\t}',
  '}',
  '',
  '301 = {',
  '\t950.1.1 = {',
  '\t\tdeath = {',
  '\t\t\tdeath_reason = death_battle',
  '\t\t}',
  '\t\teffect = {',
  '\t\t\tadd_character_flag = hero',
  '\t\t}',
  '\t}',
  '}',
  ''
].join('\n')

describe('clearing a multi-line death block', () => {
  const mdFile = 'multi_death.txt'
  const mdPath = join(modPath, 'history', 'characters', mdFile)
  beforeEach(() => writeFileSync(mdPath, MULTI_DEATH, 'utf-8'))

  it('removes a death-only date block without orphaning braces', () => {
    const detail = getCharacter(modPath, mdFile, '300')!
    expect(detail.death).toBe('960.4.2')
    expect(saveCharacter(modPath, mdFile, '300', { ...detail, death: null })).toEqual({ ok: true })
    const text = readFileSync(mdPath, 'utf-8')
    expect(text).not.toContain('960.4.2')
    expect(text).not.toContain('death_murder')
    expect(text).toContain('\t900.1.1 = {\n\t\tbirth = yes\n\t}\n}')
    const reparsed = getCharacter(modPath, mdFile, '300')!
    expect(reparsed.death).toBeNull()
    expect(reparsed.birth).toBe('900.1.1')
  })

  it('cuts only the death block when the date block carries more', () => {
    const detail = getCharacter(modPath, mdFile, '301')!
    expect(saveCharacter(modPath, mdFile, '301', { ...detail, death: null })).toEqual({ ok: true })
    const text = readFileSync(mdPath, 'utf-8')
    expect(text).not.toContain('death_battle')
    expect(text).toContain('\t950.1.1 = {\n\t\teffect = {\n\t\t\tadd_character_flag = hero\n\t\t}\n\t}')
    // The neighboring character is untouched
    expect(text).toContain('death_reason = death_murder')
    expect(getCharacter(modPath, mdFile, '301')!.death).toBeNull()
  })
})

describe('CRLF files', () => {
  const crFile = 'crlf.txt'
  const crPath = join(modPath, 'history', 'characters', crFile)
  const CRLF_SOURCE = SOURCE.replace(/\n/g, '\r\n')
  beforeEach(() => writeFileSync(crPath, CRLF_SOURCE, 'utf-8'))

  it('round-trips byte-for-byte on a no-op save', () => {
    const detail = getCharacter(modPath, crFile, '219')!
    expect(saveCharacter(modPath, crFile, '219', detail)).toEqual({ ok: true })
    expect(readFileSync(crPath, 'utf-8')).toBe(CRLF_SOURCE)
  })

  it('inserts new lines with CRLF endings', () => {
    const detail = getCharacter(modPath, crFile, '218')!
    expect(
      saveCharacter(modPath, crFile, '218', { ...detail, father: '210', death: '1080.2.3' })
    ).toEqual({ ok: true })
    const text = readFileSync(crPath, 'utf-8')
    expect(text).toContain('\r\n\tfather = 210\r\n\t1020.1.1 = {')
    expect(text).toContain('\r\n\t1080.2.3 = {\r\n\t\tdeath = yes\r\n\t}')
    // No LF-only lines snuck in
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })
})

// `dynasty` and `dynasty_house` are separate keys, editable independently.
// They used to collapse into one field, which hid whichever the file didn't
// use and made a house-only character look like it had no lineage.
describe('dynasty and house', () => {
  const lineageFile = 'lineage.txt'
  const lineagePath = join(modPath, 'history', 'characters', lineageFile)
  const LINEAGE_SOURCE = [
    '1 = {',
    '\tname = "OnlyDynasty"',
    '\tdynasty = dynn_A',
    '\t900.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '}',
    '',
    '2 = {',
    '\tname = "OnlyHouse"',
    '\tdynasty_house = house_B',
    '\t900.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '}',
    '',
    '3 = {',
    '\tname = "Both"',
    '\tdynasty = dynn_A',
    '\tdynasty_house = house_B',
    '\t900.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '}',
    ''
  ].join('\n')
  beforeEach(() => writeFileSync(lineagePath, LINEAGE_SOURCE, 'utf-8'))

  it('reads each key into its own field', () => {
    const only = getCharacter(modPath, lineageFile, '1')!
    expect([only.dynasty, only.house]).toEqual(['dynn_A', null])
    const house = getCharacter(modPath, lineageFile, '2')!
    expect([house.dynasty, house.house]).toEqual([null, 'house_B'])
    const both = getCharacter(modPath, lineageFile, '3')!
    expect([both.dynasty, both.house]).toEqual(['dynn_A', 'house_B'])
  })

  it('round-trips byte-for-byte on no-op saves of all three shapes', () => {
    for (const id of ['1', '2', '3']) {
      const detail = getCharacter(modPath, lineageFile, id)!
      expect(saveCharacter(modPath, lineageFile, id, detail)).toEqual({ ok: true })
    }
    expect(readFileSync(lineagePath, 'utf-8')).toBe(LINEAGE_SOURCE)
  })

  it('edits one key without disturbing the other', () => {
    const both = getCharacter(modPath, lineageFile, '3')!
    expect(saveCharacter(modPath, lineageFile, '3', { ...both, house: 'house_C' })).toEqual({
      ok: true
    })
    const after = getCharacter(modPath, lineageFile, '3')!
    expect([after.dynasty, after.house]).toEqual(['dynn_A', 'house_C'])
  })

  it('adds a house to a dynasty-only character, and clears it again', () => {
    const before = readFileSync(lineagePath, 'utf-8')
    const only = getCharacter(modPath, lineageFile, '1')!
    expect(saveCharacter(modPath, lineageFile, '1', { ...only, house: 'house_B' })).toEqual({
      ok: true
    })
    expect(readFileSync(lineagePath, 'utf-8')).toContain('\tdynasty_house = house_B\n\t900.1.1')
    expect(getCharacter(modPath, lineageFile, '1')!.house).toBe('house_B')

    const added = getCharacter(modPath, lineageFile, '1')!
    expect(saveCharacter(modPath, lineageFile, '1', { ...added, house: null })).toEqual({ ok: true })
    expect(readFileSync(lineagePath, 'utf-8')).toBe(before)
  })
})

// `female` is kept raw: an explicit `female = no` must round-trip untouched
describe('female', () => {
  const fFile = 'female.txt'
  const fPath = join(modPath, 'history', 'characters', fFile)
  const F_SOURCE = [
    '400 = {',
    '\tname = "Anna"',
    '\tfemale = yes',
    '\t900.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '}',
    '',
    '401 = {',
    '\tname = "Basil"',
    '\tfemale = no',
    '\t900.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '}',
    ''
  ].join('\n')
  beforeEach(() => writeFileSync(fPath, F_SOURCE, 'utf-8'))

  it('reads the raw value, null when absent', () => {
    expect(getCharacter(modPath, fFile, '400')!.female).toBe('yes')
    expect(getCharacter(modPath, fFile, '401')!.female).toBe('no')
    expect(getCharacter(modPath, file, '219')!.female).toBeNull()
  })

  it('round-trips byte-for-byte on no-op saves, `female = no` included', () => {
    for (const id of ['400', '401']) {
      const detail = getCharacter(modPath, fFile, id)!
      expect(saveCharacter(modPath, fFile, id, detail)).toEqual({ ok: true })
    }
    expect(readFileSync(fPath, 'utf-8')).toBe(F_SOURCE)
  })

  it('adds and removes the line', () => {
    const detail = getCharacter(modPath, file, '218')!
    expect(saveCharacter(modPath, file, '218', { ...detail, female: 'yes' })).toEqual({ ok: true })
    expect(readFileSync(path, 'utf-8')).toContain('\tfemale = yes\n\t1020.1.1 = {')
    const set = getCharacter(modPath, file, '218')!
    expect(set.female).toBe('yes')
    expect(saveCharacter(modPath, file, '218', { ...set, female: null })).toEqual({ ok: true })
    expect(readFileSync(path, 'utf-8')).toBe(SOURCE)
  })
})

describe('spouses', () => {
  const sfile = 'spouse_characters.txt'
  const spath = join(modPath, 'history', 'characters', sfile)
  const SPOUSES = [
    '300 = {',
    '\tname = "Menelaos"',
    '\t1000.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '\t1020.5.6 = {',
    '\t\tadd_spouse = 301',
    '\t}',
    '\t1030.2.3 = {',
    '\t\tremove_spouse = 301 # she left',
    '\t\tadd_matrilineal_spouse = "302"',
    '\t}',
    '\t1060.1.1 = {',
    '\t\tdeath = yes',
    '\t}',
    '}',
    ''
  ].join('\n')

  beforeEach(() => writeFileSync(spath, SPOUSES, 'utf-8'))

  const load = (): CharacterDetail => getCharacter(modPath, sfile, '300')!
  const text = (): string => readFileSync(spath, 'utf-8')

  it('pairs add/remove effects into marriages', () => {
    expect(load().spouses).toEqual([
      { id: '301', marriage: '1020.5.6', divorce: '1030.2.3', matrilineal: false, concubine: false },
      { id: '302', marriage: '1030.2.3', divorce: null, matrilineal: true, concubine: false }
    ])
  })

  it('reads no spouses on a character without any', () => {
    expect(getCharacter(modPath, file, '218')!.spouses).toEqual([])
  })

  it('round-trips byte-for-byte on a no-op save', () => {
    expect(saveCharacter(modPath, sfile, '300', load())).toEqual({ ok: true })
    expect(text()).toBe(SPOUSES)
  })

  it('adds a marriage in a new, chronologically placed block', () => {
    const detail = load()
    const spouses = [
      ...detail.spouses,
      { id: '303', marriage: '1040.7.8', divorce: null, matrilineal: false, concubine: false }
    ]
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(
      ['\t1040.7.8 = {', '\t\tadd_spouse = 303', '\t}', '\t1060.1.1 = {'].join('\n')
    )
    expect(load().spouses.map((s) => s.id)).toEqual(['301', '302', '303'])
  })

  it('reuses an existing block when the date already has one', () => {
    const detail = load()
    const spouses = [
      ...detail.spouses,
      { id: '304', marriage: '1000.1.1', divorce: null, matrilineal: false, concubine: false }
    ]
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(
      ['\t1000.1.1 = {', '\t\tadd_spouse = 304', '\t\tbirth = yes', '\t}'].join('\n')
    )
  })

  it('records a divorce, leaving the marriage statement untouched', () => {
    const detail = load()
    const spouses = detail.spouses.map((s) => (s.id === '302' ? { ...s, divorce: '1055.1.1' } : s))
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain('\t\tadd_matrilineal_spouse = "302"\n')
    expect(text()).toContain(['\t1055.1.1 = {', '\t\tremove_spouse = 302', '\t}'].join('\n'))
    expect(load().spouses[1].divorce).toBe('1055.1.1')
  })

  it('drops a whole block that held nothing but the removed marriage', () => {
    const detail = load()
    const spouses = detail.spouses.filter((s) => s.id !== '301')
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).not.toContain('1020.5.6')
    expect(text()).not.toContain('301')
    // The shared block keeps its other statement
    expect(text()).toContain(['\t1030.2.3 = {', '\t\tadd_matrilineal_spouse = "302"', '\t}'].join('\n'))
    expect(load().spouses).toEqual([
      { id: '302', marriage: '1030.2.3', divorce: null, matrilineal: true, concubine: false }
    ])
  })

  it('leaves non-spouse statements in place when a marriage is removed', () => {
    const detail = load()
    const spouses = detail.spouses.filter((s) => s.id !== '302')
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(['\t1030.2.3 = {', '\t\tremove_spouse = 301 # she left', '\t}'].join('\n'))
  })

  it('rewrites a marriage date by moving the effect', () => {
    const detail = load()
    const spouses = detail.spouses.map((s) => (s.id === '301' ? { ...s, marriage: '1021.1.1' } : s))
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).not.toContain('1020.5.6')
    expect(text()).toContain(['\t1021.1.1 = {', '\t\tadd_spouse = 301', '\t}'].join('\n'))
    expect(load().spouses[0]).toEqual({
      id: '301',
      marriage: '1021.1.1',
      divorce: '1030.2.3',
      matrilineal: false,
      concubine: false
    })
  })

  it('switches a marriage to matrilineal', () => {
    const detail = load()
    const spouses = detail.spouses.map((s) =>
      s.id === '301' ? { ...s, matrilineal: true, concubine: false } : s
    )
    expect(saveCharacter(modPath, sfile, '300', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(['\t1020.5.6 = {', '\t\tadd_matrilineal_spouse = 301', '\t}'].join('\n'))
  })

  it('rejects a bad marriage date and an id-less entry', () => {
    const detail = load()
    expect(
      saveCharacter(modPath, sfile, '300', {
        ...detail,
        spouses: [{ id: '305', marriage: 'nope', divorce: null, matrilineal: false, concubine: false }]
      })
    ).toEqual({ ok: false, error: 'Invalid marriage date "nope" (expected Y.M.D)' })
    expect(
      saveCharacter(modPath, sfile, '300', {
        ...detail,
        spouses: [{ id: '  ', marriage: '1020.5.6', divorce: null, matrilineal: false, concubine: false }]
      })
    ).toEqual({ ok: false, error: 'Every spouse needs a character id' })
    expect(text()).toBe(SPOUSES)
  })

  it('keeps CRLF line endings when inserting a block', () => {
    writeFileSync(spath, SPOUSES.split('\n').join('\r\n'), 'utf-8')
    const detail = load()
    expect(
      saveCharacter(modPath, sfile, '300', {
        ...detail,
        spouses: [
          ...detail.spouses,
          { id: '306', marriage: '1045.1.1', divorce: null, matrilineal: false, concubine: false }
        ]
      })
    ).toEqual({ ok: true })
    expect(text()).toContain('\r\n\t1045.1.1 = {\r\n\t\tadd_spouse = 306\r\n\t}\r\n')
    expect(text()).not.toMatch(/[^\r]\n/)
  })
})

describe('concubines', () => {
  const cfile = 'concubine_characters.txt'
  const cpath = join(modPath, 'history', 'characters', cfile)
  const CONCUBINES = [
    '400 = {',
    '\tname = "Halfdan"',
    '\t1000.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '\t1020.5.6 = {',
    '\t\tadd_spouse = 401',
    '\t\tadd_concubine = 402 # a prize',
    '\t}',
    '\t1030.2.3 = {',
    '\t\tremove_concubine = 402',
    '\t\tadd_concubine = "403"',
    '\t}',
    '}',
    ''
  ].join('\n')

  beforeEach(() => writeFileSync(cpath, CONCUBINES, 'utf-8'))

  const load = (): CharacterDetail => getCharacter(modPath, cfile, '400')!
  const text = (): string => readFileSync(cpath, 'utf-8')

  it('pairs add/remove concubine effects alongside marriages', () => {
    expect(load().spouses).toEqual([
      { id: '401', marriage: '1020.5.6', divorce: null, matrilineal: false, concubine: false },
      { id: '402', marriage: '1020.5.6', divorce: '1030.2.3', matrilineal: false, concubine: true },
      { id: '403', marriage: '1030.2.3', divorce: null, matrilineal: false, concubine: true }
    ])
  })

  it('never lets a remove_spouse close a concubinage of the same id', () => {
    writeFileSync(
      cpath,
      [
        '410 = {',
        '\t1020.1.1 = {',
        '\t\tadd_concubine = 411',
        '\t}',
        '\t1025.1.1 = {',
        '\t\tremove_spouse = 411',
        '\t}',
        '}',
        ''
      ].join('\n'),
      'utf-8'
    )
    expect(getCharacter(modPath, cfile, '410')!.spouses).toEqual([
      { id: '411', marriage: '1020.1.1', divorce: null, matrilineal: false, concubine: true },
      { id: '411', marriage: null, divorce: '1025.1.1', matrilineal: false, concubine: false }
    ])
  })

  it('round-trips an untouched list byte-for-byte', () => {
    expect(saveCharacter(modPath, cfile, '400', load())).toEqual({ ok: true })
    expect(text()).toBe(CONCUBINES)
  })

  it('adds a concubine into the date block for the start date', () => {
    const detail = load()
    const spouses = [
      ...detail.spouses,
      { id: '404', marriage: '1030.2.3', divorce: null, matrilineal: false, concubine: true }
    ]
    expect(saveCharacter(modPath, cfile, '400', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(
      ['\t1030.2.3 = {', '\t\tadd_concubine = 404', '\t\tremove_concubine = 402'].join('\n')
    )
  })

  it('ends a concubinage with remove_concubine', () => {
    const detail = load()
    const spouses = detail.spouses.map((s) => (s.id === '403' ? { ...s, divorce: '1040.1.1' } : s))
    expect(saveCharacter(modPath, cfile, '400', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(['\t1040.1.1 = {', '\t\tremove_concubine = 403', '\t}'].join('\n'))
  })

  it('switches a marriage to a concubinage, dropping matrilineal', () => {
    const detail = load()
    const spouses = detail.spouses.map((s) =>
      s.id === '401' ? { ...s, matrilineal: true, concubine: true } : s
    )
    expect(saveCharacter(modPath, cfile, '400', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(
      ['\t1020.5.6 = {', '\t\tadd_concubine = 401', '\t\tadd_concubine = 402 # a prize', '\t}'].join(
        '\n'
      )
    )
    expect(load().spouses.find((s) => s.id === '401')).toEqual({
      id: '401',
      marriage: '1020.5.6',
      divorce: null,
      matrilineal: false,
      concubine: true
    })
  })

  it('removing a concubinage leaves other statements in its blocks alone', () => {
    const detail = load()
    const spouses = detail.spouses.filter((s) => s.id !== '402')
    expect(saveCharacter(modPath, cfile, '400', { ...detail, spouses })).toEqual({ ok: true })
    expect(text()).toContain(['\t1020.5.6 = {', '\t\tadd_spouse = 401', '\t}'].join('\n'))
    expect(text()).toContain(['\t1030.2.3 = {', '\t\tadd_concubine = "403"', '\t}'].join('\n'))
    expect(text()).not.toContain('402')
  })

  it('requires a start date on a new concubine row', () => {
    const detail = load()
    expect(
      saveCharacter(modPath, cfile, '400', {
        ...detail,
        spouses: [{ id: '405', marriage: null, divorce: null, matrilineal: false, concubine: true }]
      })
    ).toEqual({ ok: false, error: 'Concubine 405 needs a start date' })
    expect(text()).toBe(CONCUBINES)
  })
})

describe('relations', () => {
  const rfile = 'relation_characters.txt'
  const rpath = join(modPath, 'history', 'characters', rfile)
  const RELATIONS = [
    '500 = {',
    '\tname = "Orestes"',
    '\t1000.1.1 = {',
    '\t\tbirth = yes',
    '\t}',
    '\t1020.1.1 = {',
    '\t\teffect = {',
    '\t\t\tset_relation_rival = character:501 # old grudge',
    '\t\t\tadd_gold = 50',
    '\t\t}',
    '\t}',
    '\t1025.3.4 = {',
    '\t\teffect = {',
    '\t\t\tset_relation_friend = c_502',
    '\t\t\tset_relation_lover = {',
    '\t\t\t\ttarget = character:503',
    '\t\t\t\treason = lover_historical',
    '\t\t\t}',
    '\t\t\tset_relation_nemesis = {',
    '\t\t\t\ttarget = 504',
    '\t\t\t\treason = rival_historical',
    '\t\t\t\tinvolved_character = character:505',
    '\t\t\t}',
    '\t\t}',
    '\t}',
    '\t1030.6.7 = {',
    '\t\teffect = {',
    '\t\t\tset_relation_bully = character:506',
    '\t\t}',
    '\t}',
    '\t1060.1.1 = {',
    '\t\tdeath = yes',
    '\t}',
    '}',
    ''
  ].join('\n')

  beforeEach(() => writeFileSync(rpath, RELATIONS, 'utf-8'))

  const load = (): CharacterDetail => getCharacter(modPath, rfile, '500')!
  const load2 = (id: string): CharacterDetail => getCharacter(modPath, rfile, id)!
  const text = (): string => readFileSync(rpath, 'utf-8')

  it('reads scalar and block forms, prefixes, reasons and extra lines', () => {
    expect(load().relations).toEqual([
      { type: 'rival', target: '501', prefixed: true, date: '1020.1.1', reason: null, extra: null },
      { type: 'friend', target: 'c_502', prefixed: false, date: '1025.3.4', reason: null, extra: null },
      {
        type: 'lover',
        target: '503',
        prefixed: true,
        date: '1025.3.4',
        reason: 'lover_historical',
        extra: null
      },
      {
        type: 'nemesis',
        target: '504',
        prefixed: false,
        date: '1025.3.4',
        reason: 'rival_historical',
        extra: 'involved_character = character:505'
      },
      { type: 'bully', target: '506', prefixed: true, date: '1030.6.7', reason: null, extra: null }
    ])
  })

  it('reads no relations on a character without any', () => {
    expect(getCharacter(modPath, file, '218')!.relations).toEqual([])
  })

  it('round-trips byte-for-byte on a no-op save', () => {
    expect(saveCharacter(modPath, rfile, '500', load())).toEqual({ ok: true })
    expect(text()).toBe(RELATIONS)
  })

  it('appends a relation inside an existing effect block', () => {
    const detail = load()
    const relations = [
      ...detail.relations,
      { type: 'friend', target: '507', prefixed: true, date: '1020.1.1', reason: null, extra: null }
    ]
    expect(saveCharacter(modPath, rfile, '500', { ...detail, relations })).toEqual({ ok: true })
    expect(text()).toContain(
      [
        '\t1020.1.1 = {',
        '\t\teffect = {',
        '\t\t\tset_relation_rival = character:501 # old grudge',
        '\t\t\tadd_gold = 50',
        '\t\t\tset_relation_friend = character:507',
        '\t\t}',
        '\t}'
      ].join('\n')
    )
    expect(load().relations.map((r) => r.target)).toContain('507')
  })

  it('creates a new, chronologically placed date block with an effect wrapper', () => {
    const detail = load()
    const relations = [
      ...detail.relations,
      {
        type: 'grudge',
        target: '508',
        prefixed: true,
        date: '1040.2.2',
        reason: 'grudge_test',
        extra: null
      }
    ]
    expect(saveCharacter(modPath, rfile, '500', { ...detail, relations })).toEqual({ ok: true })
    expect(text()).toContain(
      [
        '\t1040.2.2 = {',
        '\t\teffect = {',
        '\t\t\tset_relation_grudge = {',
        '\t\t\t\ttarget = character:508',
        '\t\t\t\treason = grudge_test',
        '\t\t\t}',
        '\t\t}',
        '\t}',
        '\t1060.1.1 = {'
      ].join('\n')
    )
  })

  it('drops an effect block, and its date block, emptied by a removal', () => {
    const detail = load()
    const relations = detail.relations.filter((r) => r.type !== 'bully')
    expect(saveCharacter(modPath, rfile, '500', { ...detail, relations })).toEqual({ ok: true })
    expect(text()).not.toContain('1030.6.7')
    expect(text()).not.toContain('set_relation_bully')
    expect(text()).toContain(['\t\t}', '\t}', '\t1060.1.1 = {'].join('\n'))
  })

  it('leaves other statements in the effect block when a relation is removed', () => {
    const detail = load()
    const relations = detail.relations.filter((r) => r.type !== 'rival')
    expect(saveCharacter(modPath, rfile, '500', { ...detail, relations })).toEqual({ ok: true })
    expect(text()).not.toContain('set_relation_rival')
    // The comment annotated the cut statement, so it goes with it
    expect(text()).not.toContain('old grudge')
    expect(text()).toContain(
      ['\t1020.1.1 = {', '\t\teffect = {', '\t\t\tadd_gold = 50', '\t\t}', '\t}'].join('\n')
    )
  })

  it('rewrites a reason, keeping the target spelling and extra lines', () => {
    const detail = load()
    const relations = detail.relations.map((r) =>
      r.type === 'nemesis' ? { ...r, reason: 'nemesis_new' } : r
    )
    expect(saveCharacter(modPath, rfile, '500', { ...detail, relations })).toEqual({ ok: true })
    expect(text()).toContain(
      [
        '\t\t\tset_relation_nemesis = {',
        '\t\t\t\ttarget = 504',
        '\t\t\t\treason = nemesis_new',
        '\t\t\t\tinvolved_character = character:505',
        '\t\t\t}'
      ].join('\n')
    )
    const reparsed = load().relations.find((r) => r.type === 'nemesis')!
    expect(reparsed.reason).toBe('nemesis_new')
    expect(reparsed.extra).toBe('involved_character = character:505')
    // The untouched block-form lover kept its bytes
    expect(text()).toContain('\t\t\t\treason = lover_historical\n')
  })

  it('rejects a type-less, target-less or bad-dated relation, leaving the file alone', () => {
    const detail = load()
    const base = { prefixed: true, reason: null, extra: null }
    expect(
      saveCharacter(modPath, rfile, '500', {
        ...detail,
        relations: [{ ...base, type: ' ', target: '501', date: '1020.1.1' }]
      })
    ).toEqual({ ok: false, error: 'Every relation needs a type' })
    expect(
      saveCharacter(modPath, rfile, '500', {
        ...detail,
        relations: [{ ...base, type: 'rival', target: '', date: '1020.1.1' }]
      })
    ).toEqual({ ok: false, error: 'Every relation needs a target character id' })
    expect(
      saveCharacter(modPath, rfile, '500', {
        ...detail,
        relations: [{ ...base, type: 'rival', target: '501', date: 'nope' }]
      })
    ).toEqual({ ok: false, error: 'Invalid relation date "nope" (expected Y.M.D)' })
    expect(text()).toBe(RELATIONS)
  })

  it('handles one-line blocks: reads them, and splices new relations inline', () => {
    const ONE_LINE = [
      '600 = {',
      '\t900.1.1 = { birth = yes }',
      '\t905.1.1 = { effect = { set_relation_friend = character:601 } }',
      '}',
      ''
    ].join('\n')
    writeFileSync(rpath, ONE_LINE, 'utf-8')
    const detail = load2('600')
    expect(detail.relations).toEqual([
      { type: 'friend', target: '601', prefixed: true, date: '905.1.1', reason: null, extra: null }
    ])
    // No-op save round-trips byte-for-byte
    expect(saveCharacter(modPath, rfile, '600', detail)).toEqual({ ok: true })
    expect(text()).toBe(ONE_LINE)
    // A new relation on a one-line effect's date splices in without reshaping
    expect(
      saveCharacter(modPath, rfile, '600', {
        ...detail,
        relations: [
          ...detail.relations,
          { type: 'rival', target: '602', prefixed: true, date: '905.1.1', reason: null, extra: null },
          { type: 'ward', target: '603', prefixed: true, date: '900.1.1', reason: null, extra: null }
        ]
      })
    ).toEqual({ ok: true })
    expect(text()).toContain(
      '\t905.1.1 = { effect = { set_relation_friend = character:601 set_relation_rival = character:602 } }'
    )
    // A one-line date block with no effect grows a one-line wrapper
    expect(text()).toContain(
      '\t900.1.1 = { birth = yes effect = { set_relation_ward = character:603 } }'
    )
    expect(load2('600').relations.map((r) => r.type).sort()).toEqual(['friend', 'rival', 'ward'])
  })

  it('keeps CRLF line endings when inserting', () => {
    writeFileSync(rpath, RELATIONS.split('\n').join('\r\n'), 'utf-8')
    const detail = load()
    expect(
      saveCharacter(modPath, rfile, '500', {
        ...detail,
        relations: [
          ...detail.relations,
          { type: 'ward', target: '509', prefixed: true, date: '1020.1.1', reason: null, extra: null },
          {
            type: 'crush',
            target: '510',
            prefixed: true,
            date: '1050.5.5',
            reason: 'crush_test',
            extra: null
          }
        ]
      })
    ).toEqual({ ok: true })
    expect(text()).toContain('\r\n\t\t\tset_relation_ward = character:509\r\n')
    expect(text()).toContain(
      '\r\n\t1050.5.5 = {\r\n\t\teffect = {\r\n\t\t\tset_relation_crush = {\r\n'
    )
    expect(text()).not.toMatch(/[^\r]\n/)
  })
})

describe('createCharacter', () => {
  const newDetail = (over: Partial<CharacterDetail> = {}): CharacterDetail => ({
    id: '9000',
    file: '',
    name: 'Nikephoros',
    dynasty: null,
    house: null,
    birth: '1000.1.1',
    death: null,
    culture: 'greek',
    faith: 'orthodox',
    father: null,
    mother: null,
    traits: [],
    spouses: [],
    relations: [],
    stats: {
      diplomacy: null,
      martial: null,
      stewardship: null,
      intrigue: null,
      learning: null,
      prowess: null
    },
    female: null,
    sexuality: null,
    dna: null,
    ...over
  })

  it('appends to an existing file, preserving the current content byte-for-byte', () => {
    expect(
      createCharacter(modPath, file, newDetail({ father: '219', traits: ['brave'] }))
    ).toEqual({ ok: true })
    const text = readFileSync(path, 'utf-8')
    expect(text.startsWith(SOURCE)).toBe(true)
    expect(text).toContain(
      [
        '9000 = {',
        '\tname = "Nikephoros"',
        '\tculture = greek',
        '\tfaith = orthodox',
        '\tfather = 219',
        '\ttrait = brave',
        '\t1000.1.1 = {',
        '\t\tbirth = yes',
        '\t}',
        '}'
      ].join('\n')
    )
    const created = getCharacter(modPath, file, '9000')!
    expect(created.name).toBe('Nikephoros')
    expect(created.father).toBe('219')
    expect(created.birth).toBe('1000.1.1')
  })

  it('creates a missing file, with every optional field written', () => {
    const detail = newDetail({
      id: '9001',
      house: 'house_B',
      death: '1060.2.3',
      mother: '217',
      female: 'yes',
      stats: {
        diplomacy: 4,
        martial: null,
        stewardship: 7,
        intrigue: null,
        learning: null,
        prowess: null
      }
    })
    expect(createCharacter(modPath, 'created.txt', detail)).toEqual({ ok: true })
    const text = readFileSync(join(modPath, 'history', 'characters', 'created.txt'), 'utf-8')
    expect(text).toBe(
      [
        '9001 = {',
        '\tname = "Nikephoros"',
        '\tfemale = yes',
        '\tdynasty_house = house_B',
        '\tculture = greek',
        '\tfaith = orthodox',
        '\tmother = 217',
        '\tdiplomacy = 4',
        '\tstewardship = 7',
        '\t1000.1.1 = {',
        '\t\tbirth = yes',
        '\t}',
        '\t1060.2.3 = {',
        '\t\tdeath = yes',
        '\t}',
        '}',
        ''
      ].join('\n')
    )
    expect(listCharacterFiles(modPath)).toContain('created.txt')
  })

  it('matches an existing CRLF file with CRLF lines', () => {
    const crPath = join(modPath, 'history', 'characters', 'crlf_create.txt')
    writeFileSync(crPath, SOURCE.replace(/\n/g, '\r\n'), 'utf-8')
    expect(createCharacter(modPath, 'crlf_create.txt', newDetail({ id: '9002' }))).toEqual({
      ok: true
    })
    const text = readFileSync(crPath, 'utf-8')
    expect(text).toContain('\r\n9002 = {\r\n\tname = "Nikephoros"\r\n')
    expect(text.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('writes marriage effects into date blocks, in chronological order', () => {
    const detail = newDetail({
      id: '9003',
      death: '1080.1.1',
      spouses: [
        { id: '219', marriage: '1030.4.5', divorce: '1040.6.7', matrilineal: false, concubine: false },
        { id: '218', marriage: '1040.6.7', divorce: null, matrilineal: true, concubine: false }
      ]
    })
    expect(createCharacter(modPath, 'spouse_create.txt', detail)).toEqual({ ok: true })
    const text = readFileSync(join(modPath, 'history', 'characters', 'spouse_create.txt'), 'utf-8')
    expect(text).toContain(
      [
        '\t1000.1.1 = {',
        '\t\tbirth = yes',
        '\t}',
        '\t1030.4.5 = {',
        '\t\tadd_spouse = 219',
        '\t}',
        '\t1040.6.7 = {',
        '\t\tremove_spouse = 219',
        '\t\tadd_matrilineal_spouse = 218',
        '\t}',
        '\t1080.1.1 = {',
        '\t\tdeath = yes',
        '\t}',
        '}'
      ].join('\n')
    )
    expect(getCharacter(modPath, 'spouse_create.txt', '9003')!.spouses).toEqual(detail.spouses)
  })

  it('writes concubine effects with the concubine keywords', () => {
    const detail = newDetail({
      id: '9004',
      spouses: [
        { id: '218', marriage: '1030.4.5', divorce: '1040.6.7', matrilineal: false, concubine: true }
      ]
    })
    expect(createCharacter(modPath, 'concubine_create.txt', detail)).toEqual({ ok: true })
    const text = readFileSync(
      join(modPath, 'history', 'characters', 'concubine_create.txt'),
      'utf-8'
    )
    expect(text).toContain(['\t1030.4.5 = {', '\t\tadd_concubine = 218', '\t}'].join('\n'))
    expect(text).toContain(['\t1040.6.7 = {', '\t\tremove_concubine = 218', '\t}'].join('\n'))
    expect(getCharacter(modPath, 'concubine_create.txt', '9004')!.spouses).toEqual(detail.spouses)
  })

  it('writes relation effects into date blocks, wrapped in effect blocks', () => {
    const detail = newDetail({
      id: '9005',
      relations: [
        {
          type: 'lover',
          target: '219',
          prefixed: true,
          date: '1000.1.1',
          reason: 'lover_historical',
          extra: null
        },
        { type: 'rival', target: '218', prefixed: true, date: '1020.2.2', reason: null, extra: null }
      ]
    })
    expect(createCharacter(modPath, 'relation_create.txt', detail)).toEqual({ ok: true })
    const text = readFileSync(
      join(modPath, 'history', 'characters', 'relation_create.txt'),
      'utf-8'
    )
    expect(text).toContain(
      [
        '\t1000.1.1 = {',
        '\t\tbirth = yes',
        '\t\teffect = {',
        '\t\t\tset_relation_lover = {',
        '\t\t\t\ttarget = character:219',
        '\t\t\t\treason = lover_historical',
        '\t\t\t}',
        '\t\t}',
        '\t}',
        '\t1020.2.2 = {',
        '\t\teffect = {',
        '\t\t\tset_relation_rival = character:218',
        '\t\t}',
        '\t}',
        '}'
      ].join('\n')
    )
    expect(getCharacter(modPath, 'relation_create.txt', '9005')!.relations).toEqual(
      detail.relations
    )
  })

  it('rejects a duplicate id anywhere in the mod', () => {
    const result = createCharacter(modPath, 'other.txt', newDetail({ id: '219' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/already exists in .*\.txt/)
  })

  it('rejects missing mandatory fields', () => {
    expect(createCharacter(modPath, file, newDetail({ name: null })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ culture: null })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ faith: null })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ birth: null })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ id: '  ' })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ birth: 'not-a-date' })).ok).toBe(false)
    expect(createCharacter(modPath, file, newDetail({ id: 'has space' })).ok).toBe(false)
  })

  it('rejects bad file names', () => {
    expect(createCharacter(modPath, 'notes.md', newDetail()).ok).toBe(false)
    expect(createCharacter(modPath, '.txt', newDetail()).ok).toBe(false)
    expect(createCharacter(modPath, 'sub\\dir.txt', newDetail()).ok).toBe(false)
  })
})
