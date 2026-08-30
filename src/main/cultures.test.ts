import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getCultureData, saveCulture } from './cultures'
import type { CulturePatch } from '@shared/types'

// Synthetic game/mod layout in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-cultures-'))
const gameDir = join(root, 'game')
const modPath = join(root, 'mod')

function writeFixture(base: string, rel: string, content: string): void {
  const full = join(base, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

// Deliberately messy, mirroring real culture files: tab and space indents,
// glued comments, a single-line gfx list, a duplicated key, odd casing
const MOD_CULTURES = [
  '# mod cultures',
  'attic = {',
  '\tcolor = rgb { 128 149 72 }',
  '',
  '\tparents = { achean ionian }',
  '\tcreated = 3220.1.1',
  '',
  '\tethos = ethos_bellicose',
  '\theritage = heritage_hellenic',
  '\tlanguage = language_arcadian',
  '\tmartial_custom = martial_custom_male_only # men only',
  '\ttraditions = {',
  '\t\ttradition_politeia',
  '\t\ttradition_fishermen',
  '\t}',
  '',
  '\tname_list = name_list_arcadian',
  '',
  '\tcoa_gfx = { gre_archaic_coa_gfx western_coa_gfx }',
  '\tbuilding_gfx = { greek_building_gfx }',
  '\tclothing_gfx = { greek_clothing_gfx }',
  '\tclothing_gfx = { western_clothing_gfx }',
  '\tunit_gfx = { geometric_unit_gfx }',
  '\thouse_coa_frame = house_frame_05',
  '',
  '\tethnicities = {',
  '\t\t10 = mediterranean_byzantine # greek',
  '\t\t5 = levantine_arabic',
  '\t}',
  '}',
  '',
  '  dorian = {  # spaces, not tabs',
  '    color = hsv { 0.5 0.5 0.5 }',
  '    Ethos = ethos_stoic',
  '    traditions = { }',
  '  }',
  '',
  'plainest = {',
  '\tcolor = { 161 67 0 }',
  '}',
  '',
  'palette_named = {',
  '\tcolor = welsh',
  '\tethos = ethos_stoic',
  '}',
  ''
].join('\n')

const GAME_CULTURES = [
  'italian = {',
  '\tcolor = italian',
  '\tethos = ethos_spiritual',
  '\theritage = heritage_latin',
  '\ttraditions = { tradition_poetry }',
  '}',
  '',
  'attic = {',
  '\tcolor = { 0.1 0.2 0.3 }',
  '\tethos = ethos_from_the_game',
  '}',
  ''
].join('\n')

const NAMED_COLORS = [
  'colors = {',
  '\titalian = { 0.8 0.2 0.2 }',
  '\tvenetian = italian',
  '\twelsh = hsv{ 0 0 1 }',
  '}',
  ''
].join('\n')

const PILLARS = [
  'ethos_bellicose = { type = ethos }',
  'ethos_stoic = { type = ethos }',
  'ethos_spiritual = { type = ethos }',
  'heritage_hellenic = { type = heritage }',
  'heritage_latin = { type = heritage }',
  'language_arcadian = { type = language }',
  'martial_custom_male_only = { type = martial_custom }',
  'head_determination_domain = { type = head_determination }',
  ''
].join('\n')

const TRADITIONS = [
  'tradition_politeia = { category = societal }',
  'tradition_fishermen = { category = regional }',
  'tradition_poetry = { category = societal }',
  ''
].join('\n')

const NAME_LISTS = ['name_list_arcadian = { }', 'name_list_roman = { }', ''].join('\n')
const ETHNICITIES = ['mediterranean_byzantine = { }', 'levantine_arabic = { }', ''].join('\n')

const MOD_LOC = [
  'l_english:',
  ' attic:0 "Attic"',
  ' dorian:0 "Dorian"',
  ''
].join('\n')

const GAME_LOC = [
  'l_english:',
  ' italian:0 "Italian"',
  ' ethos_bellicose_name:0 "Bellicose"',
  ' heritage_hellenic_name:0 "Hellenic"',
  ' tradition_politeia_name:0 "Politeia"',
  ' head_determination_domain:0 "Determine by largest domain"',
  ' name_list_arcadian:0 "Arcadian"',
  ''
].join('\n')

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  writeFixture(modPath, 'common/culture/cultures/HAAO_greek.txt', MOD_CULTURES)
  writeFixture(gameDir, 'common/culture/cultures/00_latin.txt', GAME_CULTURES)
  writeFixture(gameDir, 'common/named_colors/culture_colors.txt', NAMED_COLORS)
  writeFixture(gameDir, 'common/culture/pillars/00_pillars.txt', PILLARS)
  writeFixture(gameDir, 'common/culture/traditions/00_traditions.txt', TRADITIONS)
  writeFixture(gameDir, 'common/culture/name_lists/00_name_lists.txt', NAME_LISTS)
  writeFixture(gameDir, 'common/ethnicities/00_ethnicities.txt', ETHNICITIES)
  writeFixture(gameDir, 'localization/english/culture/cultures_l_english.yml', GAME_LOC)
  writeFixture(modPath, 'localization/english/HAAO_l_english.yml', MOD_LOC)
})

afterAll(() => rmSync(root, { recursive: true, force: true }))

const load = (replacePaths: string[] = []): ReturnType<typeof getCultureData> =>
  getCultureData(gameDir, modPath, replacePaths)

const cultureFile = join(modPath, 'common', 'culture', 'cultures', 'HAAO_greek.txt')

/** The patch that leaves a culture exactly as the scan found it. */
function identityPatch(id: string): CulturePatch {
  const c = load().cultures.find((x) => x.id === id)!
  return {
    color: c.color?.hex ?? null,
    ethos: c.ethos,
    heritage: c.heritage,
    language: c.language,
    martialCustom: c.martialCustom,
    headDetermination: c.headDetermination,
    traditions: c.traditions,
    nameList: c.nameList,
    parents: c.parents,
    created: c.created,
    coaGfx: c.coaGfx,
    buildingGfx: c.buildingGfx,
    clothingGfx: c.clothingGfx,
    unitGfx: c.unitGfx,
    houseCoaFrame: c.houseCoaFrame,
    ethnicities: c.ethnicities
  }
}

describe('getCultureData', () => {
  it('parses a culture definition in full', () => {
    const attic = load().cultures.find((c) => c.id === 'attic')!
    expect(attic).toMatchObject({
      file: 'HAAO_greek.txt',
      inMod: true,
      localizedName: 'Attic',
      ethos: 'ethos_bellicose',
      heritage: 'heritage_hellenic',
      language: 'language_arcadian',
      martialCustom: 'martial_custom_male_only',
      headDetermination: null,
      nameList: 'name_list_arcadian',
      created: '3220.1.1',
      houseCoaFrame: 'house_frame_05',
      parents: ['achean', 'ionian'],
      traditions: ['tradition_politeia', 'tradition_fishermen'],
      coaGfx: ['gre_archaic_coa_gfx', 'western_coa_gfx'],
      buildingGfx: ['greek_building_gfx'],
      unitGfx: ['geometric_unit_gfx']
    })
    // Both `clothing_gfx` lines contribute — the game merges them too
    expect(attic.clothingGfx).toEqual(['greek_clothing_gfx', 'western_clothing_gfx'])
    expect(attic.ethnicities).toEqual([
      { weight: '10', id: 'mediterranean_byzantine' },
      { weight: '5', id: 'levantine_arabic' }
    ])
  })

  it('reads a key spelled with unexpected case', () => {
    expect(load().cultures.find((c) => c.id === 'dorian')!.ethos).toBe('ethos_stoic')
  })

  it('resolves every colour spelling to hex', () => {
    const hexOf = (id: string): string | null =>
      load().cultures.find((c) => c.id === id)!.color?.hex ?? null
    expect(hexOf('attic')).toBe('#809548') // rgb { 128 149 72 }
    expect(hexOf('dorian')).toBe('#408080') // hsv { 0.5 0.5 0.5 }
    expect(hexOf('plainest')).toBe('#a14300') // bare int triple
    expect(hexOf('italian')).toBe('#cc3333') // named colour → { 0.8 0.2 0.2 }
  })

  it('records the colour format so an edit can be written back in kind', () => {
    const formats = Object.fromEntries(
      load().cultures.map((c) => [c.id, c.color?.format ?? null])
    )
    expect(formats).toMatchObject({
      attic: 'rgb',
      dorian: 'hsv',
      plainest: 'int',
      italian: 'named'
    })
  })

  it('layers a mod culture over the game culture of the same id', () => {
    const attics = load().cultures.filter((c) => c.id === 'attic')
    expect(attics).toHaveLength(1)
    expect(attics[0].ethos).toBe('ethos_bellicose')
    // The game's own cultures still list, flagged as uneditable
    expect(load().cultures.find((c) => c.id === 'italian')!.inMod).toBe(false)
  })

  it('drops game cultures entirely under a replace_path', () => {
    const ids = load(['common/culture/cultures']).cultures.map((c) => c.id)
    expect(ids).toContain('attic')
    expect(ids).not.toContain('italian')
  })

  it('groups pillars by their declared type and localizes them', () => {
    const { pillars } = load()
    expect(pillars.ethos.map((p) => p.id).sort()).toEqual([
      'ethos_bellicose',
      'ethos_spiritual',
      'ethos_stoic'
    ])
    expect(pillars.ethos.find((p) => p.id === 'ethos_bellicose')!.name).toBe('Bellicose')
    expect(pillars.language.map((p) => p.id)).toEqual(['language_arcadian'])
    // Head determination localizes the bare id rather than `<id>_name`
    expect(pillars.head_determination[0].name).toBe('Determine by largest domain')
  })

  it('reads traditions with their category', () => {
    const politeia = load().traditions.find((t) => t.id === 'tradition_politeia')!
    expect(politeia).toEqual({ id: 'tradition_politeia', name: 'Politeia', category: 'societal' })
  })

  it('offers name lists, ethnicities and the gfx values actually in use', () => {
    const data = load()
    expect(data.nameLists).toContainEqual({ id: 'name_list_arcadian', name: 'Arcadian' })
    expect(data.ethnicities.map((e) => e.id)).toContain('levantine_arabic')
    expect(data.gfx.clothing).toEqual(['greek_clothing_gfx', 'western_clothing_gfx'])
    expect(data.gfx.houseCoaFrame).toEqual(['house_frame_05'])
  })

  it('collects mod characters with the culture they carry', () => {
    writeFixture(
      modPath,
      'history/characters/HAAO_attica.txt',
      [
        'Neleidae_1 = {',
        '\tname = "Charops"',
        '\tculture = attic',
        '\t3220.6.15 = { birth = yes }',
        '\t3270.1.1 = { death = yes }',
        '}',
        'Later_1 = {',
        '\tname = "Shifter"',
        '\t3230.1.1 = { birth = yes culture = dorian }',
        '}',
        ''
      ].join('\n')
    )
    const chars = load().characters
    expect(chars).toContainEqual({
      id: 'Neleidae_1',
      file: 'HAAO_attica.txt',
      name: 'Charops',
      birth: '3220.6.15',
      death: '3270.1.1',
      culture: 'attic'
    })
    // A culture only ever set inside a dated block still counts
    expect(chars.find((c) => c.id === 'Later_1')!.culture).toBe('dorian')
  })
})

describe('saveCulture', () => {
  const save = (id: string, patch: Partial<CulturePatch>): ReturnType<typeof saveCulture> =>
    saveCulture(gameDir, modPath, [], 'HAAO_greek.txt', id, {
      ...identityPatch(id),
      ...patch
    })

  it('round-trips a no-op save byte for byte', () => {
    const before = readFileSync(cultureFile, 'utf-8')
    for (const id of ['attic', 'dorian', 'plainest', 'palette_named']) {
      expect(save(id, {})).toEqual({ ok: true })
    }
    expect(readFileSync(cultureFile, 'utf-8')).toBe(before)
  })

  it('edits a scalar in place, keeping its glued comment', () => {
    expect(save('attic', { ethos: 'ethos_stoic' })).toEqual({ ok: true })
    const text = readFileSync(cultureFile, 'utf-8')
    expect(text).toContain('\tethos = ethos_stoic\n')
    expect(text).toContain('\tmartial_custom = martial_custom_male_only # men only\n')
  })

  it('rewrites a multi-line list block, keeping its indentation', () => {
    expect(
      save('attic', { traditions: ['tradition_poetry', 'tradition_politeia'] })
    ).toEqual({ ok: true })
    expect(readFileSync(cultureFile, 'utf-8')).toContain(
      ['\ttraditions = {', '\t\ttradition_poetry', '\t\ttradition_politeia', '\t}'].join('\n')
    )
  })

  it('keeps a single-line list block on one line', () => {
    expect(save('attic', { coaGfx: ['a_coa_gfx'] })).toEqual({ ok: true })
    expect(readFileSync(cultureFile, 'utf-8')).toContain('\tcoa_gfx = { a_coa_gfx }\n')
  })

  it('collapses duplicate blocks of the same key into the first', () => {
    expect(save('attic', { clothingGfx: ['only_gfx'] })).toEqual({ ok: true })
    const text = readFileSync(cultureFile, 'utf-8')
    expect(text.match(/clothing_gfx/g)).toHaveLength(1)
    expect(text).toContain('\tclothing_gfx = { only_gfx }\n')
  })

  it('removes the whole statement when a list is emptied', () => {
    expect(save('attic', { parents: [] })).toEqual({ ok: true })
    const text = readFileSync(cultureFile, 'utf-8')
    expect(text).not.toContain('parents')
    // The line goes with it — no blank left where it stood
    expect(text).toContain('\tcolor = rgb { 128 149 72 }\n\n\tcreated = 3220.1.1\n')
  })

  it('inserts a block that the culture did not have', () => {
    expect(save('plainest', { traditions: ['tradition_poetry'] })).toEqual({ ok: true })
    expect(readFileSync(cultureFile, 'utf-8')).toContain(
      ['plainest = {', '\tcolor = { 161 67 0 }', '\ttraditions = {', '\t\ttradition_poetry', '\t}', '}'].join('\n')
    )
  })

  it('writes a changed colour in the format the file already used', () => {
    expect(save('attic', { color: '#ff0000' })).toEqual({ ok: true })
    expect(save('plainest', { color: '#ff0000' })).toEqual({ ok: true })
    expect(save('dorian', { color: '#ff0000' })).toEqual({ ok: true })
    const text = readFileSync(cultureFile, 'utf-8')
    expect(text).toContain('color = rgb { 255 0 0 }')
    expect(text).toContain('color = { 255 0 0 }')
    expect(text).toContain('color = hsv { 0 1 1 }')
  })

  it('rewrites the ethnicities map', () => {
    expect(save('attic', { ethnicities: [{ weight: '100', id: 'levantine_arabic' }] })).toEqual({
      ok: true
    })
    expect(readFileSync(cultureFile, 'utf-8')).toContain(
      ['\tethnicities = {', '\t\t100 = levantine_arabic', '\t}'].join('\n')
    )
  })

  it('leaves every other culture in the file untouched', () => {
    const before = readFileSync(cultureFile, 'utf-8')
    expect(save('attic', { ethos: 'ethos_stoic' })).toEqual({ ok: true })
    const after = readFileSync(cultureFile, 'utf-8')
    const tail = (t: string): string => t.slice(t.indexOf('  dorian = {'))
    expect(tail(after)).toBe(tail(before))
  })

  it('leaves a named colour alone when another field changes', () => {
    expect(save('palette_named', { ethos: 'ethos_bellicose' })).toEqual({ ok: true })
    const text = readFileSync(cultureFile, 'utf-8')
    // Resolving `welsh` through the palette is what stops the save from
    // mistaking "a colour it can't read" for "a colour the user cleared"
    expect(text).toContain('\tcolor = welsh\n')
    expect(text).toContain('\tethos = ethos_bellicose\n')
  })

  it('writes an edited named colour as an rgb triple', () => {
    expect(save('palette_named', { color: '#00ff00' })).toEqual({ ok: true })
    expect(readFileSync(cultureFile, 'utf-8')).toContain('color = rgb { 0 255 0 }')
  })

  it('reports a culture that is not in the file', () => {
    const result = saveCulture(
      gameDir,
      modPath,
      [],
      'HAAO_greek.txt',
      'nope',
      identityPatch('attic')
    )
    expect(result).toEqual({ ok: false, error: 'nope not found in HAAO_greek.txt' })
  })
})
