import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { locateRef } from './refdata'
import { createTitle, getTitle, getTitleData, listTitleFiles, saveTitle } from './titles'
import type { NewTitle, TitleFlags, TitlePatch } from '@shared/types'
import { TITLE_FLAG_KEYS } from '@shared/types'

// Synthetic game/mod layout in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-titles-'))
const gameDir = join(root, 'game')
const modPath = join(root, 'mod')

function writeFixture(base: string, rel: string, content: string): void {
  const full = join(base, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

// Deliberately messy, mirroring real landed_titles files: a BOM glued to an
// @value header, glued hsv{ colour with a double space, a missing space in a
// triple and before an =, an inline one-line barony, cultural_names with an
// annotated and a commented-out line, and a titular duchy with no children.
const GAME_TITLES = [
  '﻿@correct_culture_primary_score = 100',
  '@always_primary_score = 1000',
  '',
  'e_empire = {',
  '\tcolor = { 167 10 0 }',
  '\tcapital = c_capital # the seat',
  '\tdefinite_form = yes',
  '',
  '\tai_primary_priority = {',
  '\t\tadd = @always_primary_score',
  '\t}',
  '',
  '\tk_kingdom = {',
  '\t\tcolor =  hsv{ 0.98 0.9 0.9 }',
  '\t\td_duchy = {',
  '\t\t\tcolor = { 100 100 100 }',
  '\t\t\tcapital = c_capital',
  '\t\t\tc_capital = {',
  '\t\t\t\tcolor = { 124 252 0}',
  '\t\t\t\tcultural_names = {',
  '\t\t\t\t\tname_list_x = cn_foo # note',
  '\t\t\t\t\t#gone = cn_gone',
  '\t\t\t\t\tbare_word = cn_bar',
  '\t\t\t\t}',
  '\t\t\t\tb_seat= {',
  '\t\t\t\t\tprovince = 1234',
  '\t\t\t\t}',
  '\t\t\t\tb_other = { province = 1235 }',
  '\t\t\t}',
  '\t\t}',
  '\t}',
  '}',
  '',
  'd_titular = {',
  '\tcolor = { 230 230 230 }',
  '',
  '\tcapital = c_capital',
  '}',
  ''
].join('\n')

// 4-space indentation and a duplicate id (vanilla ships those; first block wins)
const GAME_NF = [
  'c_nf_yamato = {',
  '    color = { 100 100 100 }',
  '    capital = c_capital',
  '    landless = yes',
  '    noble_family = yes',
  '    destroy_if_invalid_heir = yes',
  '}',
  'c_nf_yamato = {',
  '    color = { 1 2 3 }',
  '}',
  'd_laamp_wanderer = {',
  '    color = { 100 100 100 }',
  '    landless = yes',
  '    require_landless = yes',
  '}',
  ''
].join('\n')

// The mod's own tree: CRLF, no BOM, a pasted date-keyed history block inside a
// county (real mods do this), and a shadow of the game's d_titular.
const MOD_TITLES = [
  'k_hellas = {',
  '\tcolor = { 10 20 30 }',
  '\tc_athens = {',
  '\t\tcolor = { 50 60 70 }',
  '\t\tcultural_names = {',
  '\t\t\tname_list_attic = cn_athens # attic spelling',
  '\t\t}',
  '\t\tb_athens = {',
  '\t\t\tprovince = 100',
  '\t\t}',
  '\t\t1.1.1 = {',
  '\t\t\tspecial_building_slot = acropolis',
  '\t\t}',
  '\t}',
  '}',
  '',
  'd_titular = {',
  '\tcolor = { 0 0 0 }',
  '\tlandless = yes',
  '}',
  ''
].join('\r\n')

// LF + BOM mod file carrying a non-rewritable colour form
const MOD_EXTRA = ['﻿k_hsv = {', '\tcolor = hsv{ 0.5 1 1 }', '}', ''].join('\n')

const GAME_GOV = ['feudal_government = {', '\tcreate_cadet_branches = yes', '}', ''].join('\n')
const MOD_GOV = ['aristocratic_government = {', '}', ''].join('\n')

const GAME_LAWS = [
  'succession_gender_laws = {',
  '\tcan_change_law_group = no',
  '\tmale_only_law = { flag = x }',
  '\tequal_law = { }',
  '}',
  'title_succession_laws = {',
  '\tnoble_family_succession_law = { succession = { order_of_succession = x } }',
  '}',
  'crown_authority = {',
  '\tcrown_authority_0 = { }',
  '}',
  ''
].join('\n')

const LOC = [
  'l_english:',
  ' k_hellas:0 "Hellás"',
  ' c_athens:0 "Athens"',
  ' e_empire:0 "The Empire"',
  ' male_only_law:0 "Male Only"',
  ' feudal_government:0 "Feudal"',
  ''
].join('\n')

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  writeFixture(gameDir, 'common/landed_titles/00_landed_titles.txt', GAME_TITLES)
  writeFixture(gameDir, 'common/landed_titles/01_nf.txt', GAME_NF)
  writeFixture(gameDir, 'common/governments/00_gov.txt', GAME_GOV)
  writeFixture(gameDir, 'common/laws/00_laws.txt', GAME_LAWS)
  writeFixture(modPath, 'common/landed_titles/mod_titles.txt', MOD_TITLES)
  writeFixture(modPath, 'common/landed_titles/mod_extra.txt', MOD_EXTRA)
  writeFixture(modPath, 'common/governments/HAAO_gov.txt', MOD_GOV)
  writeFixture(modPath, 'localization/english/titles_l_english.yml', LOC)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const load = () => getTitleData(gameDir, modPath, [])
const detail = (id: string) => getTitle(gameDir, modPath, [], id)
const modFile = (file: string) => join(modPath, 'common', 'landed_titles', file)
const read = (file: string) => readFileSync(modFile(file), 'utf-8')

const noFlags = (): TitleFlags => {
  const flags = {} as TitleFlags
  for (const key of TITLE_FLAG_KEYS) flags[key] = null
  return flags
}

/** A save patch reproducing the title exactly as parsed — the no-op patch. */
function patchOf(id: string): TitlePatch {
  const def = detail(id)!
  return {
    color: def.color?.hex ?? null,
    capital: def.capital,
    province: def.province,
    flags: def.flags,
    culturalNames: def.culturalNames
  }
}

describe('getTitleData', () => {
  it('walks the nested de jure tree with parent pointers and tiers', () => {
    const byId = new Map(load().titles.map((t) => [t.id, t]))
    expect(byId.get('e_empire')).toMatchObject({ tier: 'empire', parent: null, inMod: false })
    expect(byId.get('k_kingdom')).toMatchObject({ tier: 'kingdom', parent: 'e_empire' })
    expect(byId.get('d_duchy')).toMatchObject({ tier: 'duchy', parent: 'k_kingdom' })
    expect(byId.get('c_capital')).toMatchObject({ tier: 'county', parent: 'd_duchy' })
    expect(byId.get('b_seat')).toMatchObject({
      tier: 'barony',
      parent: 'c_capital',
      province: '1234'
    })
    expect(byId.get('b_other')).toMatchObject({ province: '1235' })
    expect(byId.get('b_athens')).toMatchObject({ parent: 'c_athens', inMod: true })
  })

  it('resolves colors, including glued hsv{ and a missing-space triple', () => {
    const byId = new Map(load().titles.map((t) => [t.id, t]))
    expect(byId.get('e_empire')!.color).toBe('#a70a00')
    expect(byId.get('c_capital')!.color).toBe('#7cfc00')
    expect(byId.get('k_kingdom')!.color).not.toBeNull()
    expect(byId.get('k_hsv')!.color).not.toBeNull()
  })

  it('reads the special-title flags into the summary', () => {
    const byId = new Map(load().titles.map((t) => [t.id, t]))
    expect(byId.get('c_nf_yamato')).toMatchObject({ landless: 'yes', nobleFamily: 'yes' })
    expect(byId.get('d_laamp_wanderer')).toMatchObject({ landless: 'yes', nobleFamily: null })
    expect(byId.get('d_duchy')).toMatchObject({ landless: null, nobleFamily: null })
  })

  it('lets a mod definition beat the game on an id clash, and first-wins within a file', () => {
    const titles = load().titles
    const titular = titles.filter((t) => t.id === 'd_titular')
    expect(titular).toHaveLength(1)
    expect(titular[0]).toMatchObject({ inMod: true, landless: 'yes', color: '#000000' })
    const yamato = titles.filter((t) => t.id === 'c_nf_yamato')
    expect(yamato).toHaveLength(1)
    expect(yamato[0].color).toBe('#646464')
  })

  it('does not mistake a pasted date-keyed history block for a child title', () => {
    expect(load().titles.some((t) => t.id === '1.1.1')).toBe(false)
    expect(detail('c_athens')!.children).toEqual(['b_athens'])
  })

  it('resolves display names from localization', () => {
    const byId = new Map(load().titles.map((t) => [t.id, t]))
    expect(byId.get('k_hellas')!.localizedName).toBe('Hellás')
    expect(byId.get('e_empire')!.localizedName).toBe('The Empire')
    expect(byId.get('d_titular')!.localizedName).toBeNull()
  })

  it('collects governments (layered) and succession laws (laws only)', () => {
    const data = load()
    expect(data.governments.map((g) => g.id)).toEqual([
      'aristocratic_government',
      'feudal_government'
    ])
    expect(data.governments.find((g) => g.id === 'feudal_government')!.name).toBe('Feudal')
    expect(data.successionLaws.map((l) => l.id)).toEqual([
      'equal_law',
      'male_only_law',
      'noble_family_succession_law'
    ])
  })

  it('honors replace_path by dropping the game folder', () => {
    const titles = getTitleData(gameDir, modPath, ['common/landed_titles']).titles
    expect(titles.every((t) => t.inMod)).toBe(true)
    expect(titles.some((t) => t.id === 'e_empire')).toBe(false)
    expect(titles.some((t) => t.id === 'k_hellas')).toBe(true)
  })
})

describe('getTitle', () => {
  it('parses the full detail of a nested title', () => {
    const def = detail('c_capital')!
    expect(def).toMatchObject({
      tier: 'county',
      file: '00_landed_titles.txt',
      inMod: false,
      dejurePath: ['e_empire', 'k_kingdom', 'd_duchy'],
      parent: 'd_duchy',
      children: ['b_seat', 'b_other']
    })
    expect(def.color!.hex).toBe('#7cfc00')
    expect(def.culturalNames).toEqual([
      { key: 'name_list_x', value: 'cn_foo' },
      { key: 'bare_word', value: 'cn_bar' }
    ])
  })

  it('reads flags raw and lists opaque script blocks', () => {
    const def = detail('e_empire')!
    expect(def.flags.definite_form).toBe('yes')
    expect(def.flags.landless).toBeNull()
    expect(def.capital).toBe('c_capital')
    expect(def.scriptBlocks).toEqual(['ai_primary_priority'])
    expect(detail('c_nf_yamato')!.flags.noble_family).toBe('yes')
  })

  it('marks non-triple colors as not editable', () => {
    expect(detail('k_hsv')!.color).toMatchObject({ editable: false })
    expect(detail('c_athens')!.color).toMatchObject({ editable: true, hex: '#323c46' })
  })

  it('returns null for an unknown id', () => {
    expect(detail('k_atlantis')).toBeNull()
  })
})

describe('saveTitle', () => {
  it('keeps a no-op save byte-identical (CRLF mod file, cultural_names included)', () => {
    const before = read('mod_titles.txt')
    expect(saveTitle(modPath, 'mod_titles.txt', 'c_athens', patchOf('c_athens'))).toEqual({
      ok: true
    })
    expect(saveTitle(modPath, 'mod_titles.txt', 'k_hellas', patchOf('k_hellas'))).toEqual({
      ok: true
    })
    expect(read('mod_titles.txt')).toBe(before)
  })

  it('keeps a no-op save byte-identical for a non-rewritable colour (BOM + LF file)', () => {
    const before = read('mod_extra.txt')
    expect(saveTitle(modPath, 'mod_extra.txt', 'k_hsv', patchOf('k_hsv'))).toEqual({ ok: true })
    expect(read('mod_extra.txt')).toBe(before)
  })

  it('edits scalars surgically, inserting new ones above the first child block', () => {
    const patch = patchOf('k_hellas')
    patch.capital = 'c_athens'
    patch.flags.definite_form = 'yes'
    expect(saveTitle(modPath, 'mod_titles.txt', 'k_hellas', patch)).toEqual({ ok: true })
    const text = read('mod_titles.txt')
    const lines = text.split('\r\n')
    const opener = lines.indexOf('k_hellas = {')
    const child = lines.indexOf('\tc_athens = {')
    const capital = lines.indexOf('\tcapital = c_athens')
    const flag = lines.indexOf('\tdefinite_form = yes')
    expect(capital).toBeGreaterThan(opener)
    expect(capital).toBeLessThan(child)
    expect(flag).toBeGreaterThan(opener)
    expect(flag).toBeLessThan(child)
    // No LF-only line snuck into the CRLF file
    expect(text).not.toMatch(/[^\r]\n/)
    expect(detail('k_hellas')).toMatchObject({ capital: 'c_athens' })
  })

  it('rewrites the colour triple in place and removes a cleared flag line', () => {
    const patch = patchOf('d_titular')
    patch.color = '#0a141e'
    patch.flags.landless = null
    expect(saveTitle(modPath, 'mod_titles.txt', 'd_titular', patch)).toEqual({ ok: true })
    const text = read('mod_titles.txt')
    expect(text).toContain('d_titular = {\r\n\tcolor = { 10 20 30 }\r\n}')
    expect(text).not.toContain('landless')
    expect(detail('d_titular')!.flags.landless).toBeNull()
  })

  it('rewrites cultural_names only when the list actually changed', () => {
    const patch = patchOf('c_athens')
    patch.culturalNames = [
      { key: 'name_list_attic', value: 'cn_athenai' },
      { key: 'name_list_doric', value: 'cn_athana' }
    ]
    expect(saveTitle(modPath, 'mod_titles.txt', 'c_athens', patch)).toEqual({ ok: true })
    const text = read('mod_titles.txt')
    expect(text).toContain('\t\t\tname_list_attic = cn_athenai')
    expect(text).toContain('\t\t\tname_list_doric = cn_athana')
    expect(detail('c_athens')!.culturalNames).toHaveLength(2)
    // The rest of the county survived
    expect(text).toContain('\t\t\tspecial_building_slot = acropolis')
  })

  it('leaves the file untouched when the colour form is not a rewritable triple', () => {
    const before = read('mod_extra.txt')
    const patch = patchOf('k_hsv')
    patch.color = '#123456'
    expect(saveTitle(modPath, 'mod_extra.txt', 'k_hsv', patch)).toEqual({ ok: true })
    expect(read('mod_extra.txt')).toBe(before)
  })

  it('reports a missing file and a missing title', () => {
    expect(saveTitle(modPath, 'nope.txt', 'k_hellas', patchOf('k_hellas'))).toEqual({
      ok: false,
      error: 'File not found: nope.txt'
    })
    expect(saveTitle(modPath, 'mod_titles.txt', 'k_atlantis', patchOf('k_hellas'))).toEqual({
      ok: false,
      error: 'k_atlantis not found in mod_titles.txt'
    })
  })
})

describe('createTitle', () => {
  const newTitle = (over: Partial<NewTitle>): NewTitle => ({
    id: 'd_new',
    parent: null,
    file: 'new_titles.txt',
    color: '#112233',
    capital: null,
    province: null,
    flags: noFlags(),
    ...over
  })

  it('appends a top-level block to a fresh file, exactly', () => {
    const def = newTitle({ id: 'd_oracle', capital: 'c_athens' })
    def.flags.landless = 'yes'
    def.flags.require_landless = 'yes'
    expect(createTitle(modPath, def)).toEqual({ ok: true })
    expect(read('new_titles.txt')).toBe(
      [
        'd_oracle = {',
        '\tcolor = { 17 34 51 }',
        '\tcapital = c_athens',
        '\tlandless = yes',
        '\trequire_landless = yes',
        '}',
        ''
      ].join('\n')
    )
    expect(detail('d_oracle')).toMatchObject({ tier: 'duchy', inMod: true, capital: 'c_athens' })
  })

  it('appends after existing content without touching it', () => {
    const before = read('mod_extra.txt')
    expect(createTitle(modPath, newTitle({ file: 'mod_extra.txt' }))).toEqual({ ok: true })
    expect(read('mod_extra.txt').startsWith(before)).toBe(true)
    expect(listTitleFiles(modPath)).toContain('mod_extra.txt')
  })

  it('nests a new title into a mod-defined parent, matching indent and CRLF', () => {
    const before = read('mod_titles.txt')
    const def = newTitle({ id: 'b_piraeus', parent: 'c_athens', file: null, province: '101' })
    expect(createTitle(modPath, def)).toEqual({ ok: true })
    const after = read('mod_titles.txt')
    const block = [
      '\t\tb_piraeus = {',
      '\t\t\tcolor = { 17 34 51 }',
      '\t\t\tprovince = 101',
      '\t\t}'
    ].join('\r\n')
    expect(after).toContain(block)
    // Everything else is byte-identical: removing the inserted lines restores the file
    expect(after.replace('\r\n\r\n' + block, '')).toBe(before)
    expect(detail('b_piraeus')).toMatchObject({
      parent: 'c_athens',
      dejurePath: ['k_hellas', 'c_athens']
    })
    // The created title round-trips through a no-op save
    expect(saveTitle(modPath, 'mod_titles.txt', 'b_piraeus', patchOf('b_piraeus'))).toEqual({
      ok: true
    })
    expect(read('mod_titles.txt')).toBe(after)
  })

  it('refuses a parent that only the game defines', () => {
    expect(createTitle(modPath, newTitle({ parent: 'c_capital', file: null }))).toEqual({
      ok: false,
      error:
        "Title c_capital isn't defined in the mod — copy it into the mod before nesting new titles under it"
    })
  })

  it('enforces the tier order against the parent', () => {
    expect(createTitle(modPath, newTitle({ id: 'k_upper', parent: 'd_titular', file: null }))).toEqual(
      {
        ok: false,
        error: "A kingdom can't be de jure part of a duchy — pick a higher-tier parent"
      }
    )
  })

  it('validates the id, the file name and the province rule', () => {
    expect(createTitle(modPath, newTitle({ id: '' })).ok).toBe(false)
    expect(createTitle(modPath, newTitle({ id: 'athens' }))).toEqual({
      ok: false,
      error:
        'Invalid ID "athens" — a title id starts with its tier prefix (e_, k_, d_, c_, b_ or h_)'
    })
    expect(createTitle(modPath, newTitle({ id: 'd_bad', province: '5' }))).toEqual({
      ok: false,
      error: 'Only a barony title can carry a province'
    })
    expect(createTitle(modPath, newTitle({ file: 'sub\\dir.txt' })).ok).toBe(false)
  })

  it('rejects an id the mod already defines, but allows shadowing a game id', () => {
    expect(createTitle(modPath, newTitle({ id: 'c_athens' }))).toEqual({
      ok: false,
      error: 'ID c_athens already exists in mod_titles.txt'
    })
    expect(createTitle(modPath, newTitle({ id: 'd_laamp_wanderer' }))).toEqual({ ok: true })
  })
})

describe('locateRef for titles', () => {
  it('finds a nested mod title with its line number', () => {
    const loc = locateRef(gameDir, modPath, [], 'title', 'b_athens')
    expect(loc).not.toBeNull()
    expect(loc!.inMod).toBe(true)
    expect(loc!.line).toBe(8)
  })

  it('falls back to the game definition', () => {
    const loc = locateRef(gameDir, modPath, [], 'title', 'd_duchy')
    expect(loc).toMatchObject({ inMod: false })
  })
})
