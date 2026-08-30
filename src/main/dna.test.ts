import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { applyRulerDesignerDna, getDnaPasteInfo, parseRulerDesignerDna } from './dna'

// Synthetic game + mod layout in a temp dir — never touches real CK3 files
const base = mkdtempSync(join(tmpdir(), 'ck3-tools-dna-'))
const gameDir = join(base, 'game')
const modPath = join(base, 'mod')
const historyFile = 'test_characters.txt'
const historyPath = join(modPath, 'history', 'characters', historyFile)

// A trimmed common/genes tree: templates the lookup should find, with the
// scripted_character one preferred for beards
const GENES = [
  'special_genes = {',
  '\taccessory_genes = {',
  '\t\thairstyles = {',
  '\t\t\tgroup = hair',
  '\t\t\tall_hairstyles = {',
  '\t\t\t\tindex = 0',
  '\t\t\t\tmale = {',
  '\t\t\t\t\t1 = male_hair_western_01',
  '\t\t\t\t\t1 = male_hair_mena_02',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t}',
  '\t\tbeards = {',
  '\t\t\tgroup = beard',
  '\t\t\tall_beards = {',
  '\t\t\t\tindex = 1',
  '\t\t\t\tmale = {',
  '\t\t\t\t\t1 = male_beard_fp2_iberian_christian_01',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t\tscripted_character_beards_01 = {',
  '\t\t\t\tindex = 2',
  '\t\t\t\tmale = {',
  '\t\t\t\t\t1 = male_beard_fp2_iberian_christian_01',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t}',
  '\t}',
  '}',
  ''
].join('\n')

const HISTORY = [
  '219 = {',
  '\tname = "Alexios"',
  '\tculture = greek',
  '\treligion = orthodox',
  '\t1050.1.1 = {',
  '\t\tbirth = yes',
  '\t}',
  '}',
  ''
].join('\n')

const PASTE = [
  'ruler_designer_3322121390={',
  '\ttype=male',
  '\tid=0',
  '\trandom_seed=0',
  '\tgenes={ \t\thair_color={ 64 250 64 250 }',
  ' \t\tgene_chin_forward={ "chin_forward_neg" 120 "chin_forward_neg" 111 }',
  ' \t\thairstyles={ "western_hairstyles_wavy" 232 "all_hairstyles" 0 }',
  ' \t\tbeards={ "fp2_beards_straight" 42 "no_beard" 0 }',
  ' \t\tclothes={ "western_bedchamber" 79 "most_clothes" 0 }',
  ' }',
  '\toverride={',
  '\t\tportrait_modifier_overrides={',
  '\t\t\tcustom_hair=male_hair_mena_02',
  '\t\t\tcustom_beards=male_beard_fp2_iberian_christian_01',
  '\t\t}',
  '\t}',
  '',
  '\tentity={ 0 0 }',
  '}'
].join('\n')

const dnaPath = join(modPath, 'common', 'dna_data', 'my_dna.txt')
const pmPath = join(modPath, 'gfx', 'portraits', 'portrait_modifiers', 'my_modifiers.txt')

beforeEach(() => {
  rmSync(modPath, { recursive: true, force: true })
  mkdirSync(join(gameDir, 'common', 'genes'), { recursive: true })
  writeFileSync(join(gameDir, 'common', 'genes', '99_genes.txt'), GENES, 'utf-8')
  mkdirSync(join(modPath, 'history', 'characters'), { recursive: true })
  writeFileSync(historyPath, HISTORY, 'utf-8')
})
afterAll(() => rmSync(base, { recursive: true, force: true }))

const apply = (paste = PASTE): ReturnType<typeof applyRulerDesignerDna> =>
  applyRulerDesignerDna(
    gameDir,
    modPath,
    [],
    historyFile,
    '219',
    paste,
    'my_dna.txt',
    'my_modifiers.txt'
  )

describe('parseRulerDesignerDna', () => {
  it('extracts genes and the custom hair/beard overrides', () => {
    const parsed = parseRulerDesignerDna(PASTE)
    expect(parsed).not.toHaveProperty('error')
    if ('error' in parsed) return
    expect(parsed.genes.map((g) => g.key)).toEqual([
      'hair_color',
      'gene_chin_forward',
      'hairstyles',
      'beards',
      'clothes'
    ])
    expect(parsed.genes[0].value).toBe('64 250 64 250')
    expect(parsed.customHair).toBe('male_hair_mena_02')
    expect(parsed.customBeards).toBe('male_beard_fp2_iberian_christian_01')
  })

  it('rejects a paste with no genes block', () => {
    expect(parseRulerDesignerDna('foo = { bar = 1 }')).toHaveProperty('error')
    expect(parseRulerDesignerDna('not a block at all')).toHaveProperty('error')
  })
})

describe('applyRulerDesignerDna', () => {
  it('writes a vanilla-style DNA block keyed by the character id', () => {
    expect(apply()).toEqual({ ok: true })
    const dna = readFileSync(dnaPath, 'utf-8')
    expect(dna).toContain('219_dna = {')
    expect(dna).toContain('\tportrait_info = {')
    expect(dna).toContain('\t\t\thair_color = { 64 250 64 250 }')
    expect(dna).toContain('\t\t\tgene_chin_forward = { "chin_forward_neg" 120 "chin_forward_neg" 111 }')
    expect(dna).toContain('\tenabled = yes')
    // The Ruler Designer's outfit genes never reach a scripted DNA: clothes
    // always go, hair/beard genes are replaced by the portrait modifier
    expect(dna).not.toContain('hairstyles')
    expect(dna).not.toContain('beards')
    expect(dna).not.toContain('clothes')
  })

  it('writes the hair/beard portrait modifier gated on the character', () => {
    expect(apply()).toEqual({ ok: true })
    const pm = readFileSync(pmPath, 'utf-8')
    expect(pm).toContain('my_modifiers = {')
    expect(pm).toContain('\tusage = game')
    expect(pm).toContain('\tselection_behavior = max')
    expect(pm).toContain('219_scripted_appearance = {')
    expect(pm).toContain('gene = hairstyles')
    expect(pm).toContain('template = all_hairstyles')
    expect(pm).toContain('accessory = male_hair_mena_02')
    // Prefers the frozen scripted_character template when the accessory is in one
    expect(pm).toContain('template = scripted_character_beards_01')
    expect(pm).toContain('accessory = male_beard_fp2_iberian_christian_01')
    expect(pm).toContain('this = character:219')
  })

  it('wires the history entry: dna scalar plus the scripted-appearance flag', () => {
    expect(apply()).toEqual({ ok: true })
    const history = readFileSync(historyPath, 'utf-8')
    expect(history).toContain('\tdna = 219_dna\n')
    expect(history).toContain('\t1050.1.1 = {\n\t\tadd_character_flag = has_scripted_appearance\n\t\tbirth = yes')
  })

  it('is idempotent: a second apply replaces instead of duplicating', () => {
    expect(apply()).toEqual({ ok: true })
    expect(apply()).toEqual({ ok: true })
    const dna = readFileSync(dnaPath, 'utf-8')
    expect(dna.match(/219_dna = \{/g)).toHaveLength(1)
    const pm = readFileSync(pmPath, 'utf-8')
    expect(pm.match(/219_scripted_appearance = \{/g)).toHaveLength(1)
    const history = readFileSync(historyPath, 'utf-8')
    expect(history.match(/dna = 219_dna/g)).toHaveLength(1)
    expect(history.match(/has_scripted_appearance/g)).toHaveLength(1)
  })

  it('keeps hair/beard genes and skips the modifier when nothing was styled', () => {
    const noOverride = PASTE.replace(/\toverride=\{[\s\S]*?\n\t\}\n/, '')
    expect(apply(noOverride)).toEqual({ ok: true })
    const dna = readFileSync(dnaPath, 'utf-8')
    expect(dna).toContain('hairstyles = { "western_hairstyles_wavy" 232 "all_hairstyles" 0 }')
    expect(dna).toContain('beards = { "fp2_beards_straight" 42 "no_beard" 0 }')
    expect(dna).not.toContain('clothes')
    expect(() => readFileSync(pmPath, 'utf-8')).toThrow()
    expect(readFileSync(historyPath, 'utf-8')).not.toContain('has_scripted_appearance')
  })

  it('appends a new group to a comment-only modifier file (the mod-shipped example.txt case)', () => {
    mkdirSync(join(modPath, 'gfx', 'portraits', 'portrait_modifiers'), { recursive: true })
    const comments = '# The choice is made based on a weighted random\n#my_group = {\n#}\n'
    writeFileSync(pmPath, comments, 'utf-8')
    expect(apply()).toEqual({ ok: true })
    const pm = readFileSync(pmPath, 'utf-8')
    expect(pm.startsWith(comments)).toBe(true)
    expect(pm).toContain('my_modifiers = {')
    expect(pm).toContain('\tusage = game')
    expect(pm).toContain('219_scripted_appearance = {')
  })

  it('never adds the entry to a customization group — a new group is appended instead', () => {
    mkdirSync(join(modPath, 'gfx', 'portraits', 'portrait_modifiers'), { recursive: true })
    const custom = 'custom_beards = {\n\tusage = customization\n\tinterface_position = 1\n}\n'
    writeFileSync(pmPath, custom, 'utf-8')
    expect(apply()).toEqual({ ok: true })
    const pm = readFileSync(pmPath, 'utf-8')
    expect(pm.startsWith(custom)).toBe(true)
    expect(pm).toContain('my_modifiers = {')
    expect(pm).toContain('219_scripted_appearance = {')
  })

  it('fails before touching files when an accessory is unknown', () => {
    const bad = PASTE.replace('male_hair_mena_02', 'male_hair_does_not_exist')
    const result = apply(bad)
    expect(result.ok).toBe(false)
    expect(() => readFileSync(dnaPath, 'utf-8')).toThrow()
    expect(readFileSync(historyPath, 'utf-8')).toBe(HISTORY)
  })

  it('reuses an existing dna key and appends into an existing modifier group', () => {
    // Character already wired to a DNA under a different key, defined in the mod
    writeFileSync(historyPath, HISTORY.replace('\tname = "Alexios"', '\tname = "Alexios"\n\tdna = old_alexios'), 'utf-8')
    mkdirSync(join(modPath, 'common', 'dna_data'), { recursive: true })
    writeFileSync(dnaPath, 'old_alexios = {\n\tportrait_info = {\n\t\tgenes = {\n\t\t}\n\t}\n}\n', 'utf-8')
    expect(apply()).toEqual({ ok: true })
    const dna = readFileSync(dnaPath, 'utf-8')
    expect(dna.match(/old_alexios = \{/g)).toHaveLength(1)
    expect(dna).toContain('hair_color = { 64 250 64 250 }')
    expect(dna).not.toContain('219_dna')
    expect(readFileSync(historyPath, 'utf-8')).toContain('dna = old_alexios')
  })
})

describe('getDnaPasteInfo', () => {
  it('offers no locks for a character with nothing on disk yet', () => {
    const info = getDnaPasteInfo(modPath, historyFile, '219')
    expect(info.dnaKey).toBe('219_dna')
    expect(info.lockedDnaFile).toBeNull()
    expect(info.lockedModifierFile).toBeNull()
  })

  it('locks both pickers to the files an apply used', () => {
    expect(apply()).toEqual({ ok: true })
    const info = getDnaPasteInfo(modPath, historyFile, '219')
    expect(info.dnaKey).toBe('219_dna')
    expect(info.dnaFiles).toContain('my_dna.txt')
    expect(info.modifierFiles).toContain('my_modifiers.txt')
    expect(info.lockedDnaFile).toBe('my_dna.txt')
    expect(info.lockedModifierFile).toBe('my_modifiers.txt')
  })
})
