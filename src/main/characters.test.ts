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
    stats: {
      diplomacy: null,
      martial: null,
      stewardship: null,
      intrigue: null,
      learning: null,
      prowess: null
    },
    female: null,
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
