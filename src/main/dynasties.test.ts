import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getDynastyData, saveDynasty, saveHouse } from './dynasties'

// Synthetic game/mod layout in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-dynasties-'))
const gameDir = join(root, 'game')
const modPath = join(root, 'mod')

function writeFixture(base: string, rel: string, content: string): void {
  const full = join(base, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

// Deliberately messy, mirroring real mod files: trailing spaces, glued
// comments, mixed quoting, a key with unexpected case
const DYN_SOURCE = [
  '# mod dynasties',
  'dynn_Alpha = {',
  '\tname = "dynn_Alpha"  ',
  '\tprefix = dynn_prefix#glued',
  '\tmotto = "creed_Alpha"',
  '\tculture = greek # main culture',
  '}',
  '',
  '25061 = {',
  '\tname = dynn_Karling',
  '\tculture = "frankish"',
  '}',
  '',
  'dynn_Shared = {',
  '\tname = dynn_Shared',
  '}',
  '',
  'dynn_ModOnly = {',
  '\tname = dynn_ModOnly',
  '}',
  '',
  'dynn_Caps = {',
  '\tName = "dynn_Caps"',
  '}',
  ''
].join('\n')

const HOUSE_SOURCE = [
  'house_Beta = {',
  '    name = "house_Beta"',
  '    dynasty = 25061#Karling',
  '}',
  '2 = { name = "inline" }',
  'house_Parent = {',
  '\tname = house_Parent',
  '\tdynasty = dynn_GameParent',
  '}',
  ''
].join('\n')

const CHARS_A = [
  '100 = {',
  '\tname = "Basil"',
  '\tFather = 99',
  '\tMother=98',
  '\tdynasty = "7"',
  '\t3220.1.1. = {',
  '\t\tbirth = yes',
  '\t}',
  '\t3250.1.1 = {',
  '\t\tadd_spouse = 200',
  '\t}',
  '\t3255.1.1 = {',
  '\t\tadd_matrilineal_spouse = "201"',
  '\t\tadd_spouse = 200',
  '\t}',
  '\t3290.1.1 = {',
  '\t\tdeath = {',
  '\t\t\tdeath_reason = death_murder',
  '\t\t}',
  '\t}',
  '}',
  '101 = {',
  '\tname = "Irene"',
  '\tFemale=yes',
  '\tdynasty_house = house_Beta',
  '\t3212.1 = {',
  '\t\tbirth = "3212.1.5"',
  '\t}',
  '}',
  '102 = {',
  'name = "Ghost"',
  '}',
  '103 = {',
  '\t1000.1.1 = { birth = yes }',
  '\t1050.1.1 = {',
  '\t\tdeath = yes\t}\t#Unknown',
  '}',
  ''
].join('\n')

const CHARS_B = [
  '200 = {',
  '\tname = "Ref"',
  '\tdynasty = dynn_Referenced',
  '}',
  '201 = {',
  '\tname = "Phok"',
  '\tdynasty = phokus',
  '}',
  ''
].join('\n')

writeFixture(
  gameDir,
  'common/dynasties/00_dynasties.txt',
  [
    'dynn_Referenced = {\n\tname = dynn_Referenced\n}',
    'dynn_Unused = {\n\tname = dynn_Unused\n}',
    'Phokus = {\n\tname = dynn_Phokus\n}',
    'dynn_Shared = {\n\tname = dynn_SharedGame\n}',
    'dynn_GameParent = {\n\tname = dynn_GameParent\n}',
    '7 = {\n\tname = dynn_Seven\n}',
    ''
  ].join('\n')
)
writeFixture(
  gameDir,
  'common/dynasty_houses/00_houses.txt',
  'house_GameOnly = {\n\tname = house_GameOnly\n}\n'
)
writeFixture(
  gameDir,
  'localization/english/dynasties/dynn_l_english.yml',
  String.fromCharCode(0xfeff) +
    [
      'l_english:',
      ' dynn_Referenced:0 "Referenced Game"',
      ' dynn_Shared:0 "Shared Game"',
      ' dynn_Alpha:0 "Alpha Game"',
      ''
    ].join('\n')
)
writeFixture(
  modPath,
  'localization/dynn/mod_dynn_l_english.yml',
  ['l_english:', 'dynn_Alpha:0 "Alpha Mod" # override', ' dynn_Karling:0 "Karling"', ''].join('\n')
)
writeFixture(
  modPath,
  'localization/french/mod_dynn_l_french.yml',
  ['l_french:', ' dynn_ModOnly:0 "Nope"', ''].join('\n')
)
writeFixture(modPath, 'history/characters/chars_a.txt', CHARS_A)
writeFixture(modPath, 'history/characters/chars_b.txt', CHARS_B)

const dynPath = join(modPath, 'common', 'dynasties', 'mod_dyn.txt')
const housePath = join(modPath, 'common', 'dynasty_houses', 'mod_houses.txt')

beforeEach(() => {
  writeFixture(modPath, 'common/dynasties/mod_dyn.txt', DYN_SOURCE)
  writeFixture(modPath, 'common/dynasty_houses/mod_houses.txt', HOUSE_SOURCE)
})
afterAll(() => rmSync(root, { recursive: true, force: true }))

function data(replacePaths: string[] = []) {
  return getDynastyData(gameDir, modPath, replacePaths)
}

describe('character parsing', () => {
  it('reads scalar keys case-insensitively and keeps dynasty vs house separate', () => {
    const basil = data().characters.find((c) => c.id === '100')!
    expect(basil.name).toBe('Basil')
    expect(basil.father).toBe('99')
    expect(basil.mother).toBe('98')
    expect(basil.dynasty).toBe('7')
    expect(basil.house).toBeNull()
    expect(basil.female).toBe(false)
    const irene = data().characters.find((c) => c.id === '101')!
    expect(irene.female).toBe(true)
    expect(irene.dynasty).toBeNull()
    expect(irene.house).toBe('house_Beta')
  })

  it('tolerates date typos and the string birth form', () => {
    const basil = data().characters.find((c) => c.id === '100')!
    expect(basil.birth).toBe('3220.1.1')
    expect(basil.death).toBe('3290.1.1')
    const irene = data().characters.find((c) => c.id === '101')!
    expect(irene.birth).toBe('3212.1')
    expect(irene.death).toBeNull()
  })

  it('reads a one-line death block glued to the closing brace', () => {
    const ghost = data().characters.find((c) => c.id === '103')!
    expect(ghost.birth).toBe('1000.1.1')
    expect(ghost.death).toBe('1050.1.1')
  })

  it('reads a character with neither parent and a name at column 0', () => {
    const ghost = data().characters.find((c) => c.id === '102')!
    expect(ghost.name).toBe('Ghost')
    expect(ghost.father).toBeNull()
    expect(ghost.mother).toBeNull()
  })

  it('collects spouses from dated blocks, deduped in file order', () => {
    const basil = data().characters.find((c) => c.id === '100')!
    expect(basil.spouses).toEqual(['200', '201'])
    expect(data().characters.find((c) => c.id === '101')!.spouses).toEqual([])
  })
})

describe('definition layering', () => {
  it('includes all mod defs plus only the referenced game defs', () => {
    const ids = data().dynasties.map((d) => d.id).sort()
    expect(ids).toEqual(
      ['dynn_Alpha', '25061', 'dynn_Shared', 'dynn_ModOnly', 'dynn_Caps', 'dynn_Referenced', 'Phokus', 'dynn_GameParent', '7'].sort()
    )
  })

  it('matches references to defs case-insensitively but keeps the raw spelling', () => {
    const phokus = data().dynasties.find((d) => d.id === 'Phokus')!
    expect(phokus.inMod).toBe(false)
  })

  it('pulls in a game dynasty referenced only by a mod house', () => {
    expect(data().dynasties.some((d) => d.id === 'dynn_GameParent')).toBe(true)
  })

  it('drops the game def when the mod defines the same id', () => {
    const shared = data().dynasties.filter((d) => d.id === 'dynn_Shared')
    expect(shared).toHaveLength(1)
    expect(shared[0].inMod).toBe(true)
    expect(shared[0].name).toBe('dynn_Shared')
  })

  it('excludes unreferenced game defs', () => {
    expect(data().dynasties.some((d) => d.id === 'dynn_Unused')).toBe(false)
    expect(data().houses.some((h) => h.id === 'house_GameOnly')).toBe(false)
    expect(data().houses.map((h) => h.id).sort()).toEqual(['2', 'house_Beta', 'house_Parent'])
  })

  it('honors replace_path by dropping game defs entirely', () => {
    const ids = data(['common/dynasties']).dynasties.map((d) => d.id).sort()
    expect(ids).toEqual(['dynn_Alpha', '25061', 'dynn_Shared', 'dynn_ModOnly', 'dynn_Caps'].sort())
  })

  it('parses def scalars through glued comments and mixed quoting', () => {
    const alpha = data().dynasties.find((d) => d.id === 'dynn_Alpha')!
    expect(alpha.prefix).toBe('dynn_prefix')
    expect(alpha.motto).toBe('creed_Alpha')
    expect(alpha.culture).toBe('greek')
    const beta = data().houses.find((h) => h.id === 'house_Beta')!
    expect(beta.dynasty).toBe('25061')
    expect(data().dynasties.find((d) => d.id === 'dynn_Caps')!.name).toBe('dynn_Caps')
  })
})

describe('localization', () => {
  it('resolves names through a BOM and a column-0 entry, mod over game', () => {
    const d = data()
    expect(d.dynasties.find((x) => x.id === 'dynn_Alpha')!.localizedName).toBe('Alpha Mod')
    expect(d.dynasties.find((x) => x.id === '25061')!.localizedName).toBe('Karling')
    expect(d.dynasties.find((x) => x.id === 'dynn_Referenced')!.localizedName).toBe(
      'Referenced Game'
    )
    expect(d.dynasties.find((x) => x.id === 'dynn_Shared')!.localizedName).toBe('Shared Game')
  })

  it('leaves localizedName null for unresolved keys (non-english yml ignored)', () => {
    expect(data().dynasties.find((x) => x.id === 'dynn_ModOnly')!.localizedName).toBeNull()
  })
})

describe('saving', () => {
  it('round-trips byte-for-byte on a no-op dynasty save', () => {
    for (const def of data().dynasties.filter((d) => d.inMod)) {
      expect(
        saveDynasty(modPath, def.file, def.id, {
          name: def.name,
          prefix: def.prefix,
          motto: def.motto,
          culture: def.culture
        })
      ).toEqual({ ok: true })
    }
    expect(readFileSync(dynPath, 'utf-8')).toBe(DYN_SOURCE)
  })

  it('round-trips byte-for-byte on a no-op house save', () => {
    for (const def of data().houses.filter((h) => h.inMod)) {
      expect(
        saveHouse(modPath, def.file, def.id, {
          name: def.name,
          prefix: def.prefix,
          motto: def.motto,
          dynasty: def.dynasty
        })
      ).toEqual({ ok: true })
    }
    expect(readFileSync(housePath, 'utf-8')).toBe(HOUSE_SOURCE)
  })

  it('preserves quote style, trailing comments and unrelated lines when editing', () => {
    const result = saveDynasty(modPath, 'mod_dyn.txt', 'dynn_Alpha', {
      name: 'dynn_Alpha',
      prefix: 'dynn_prefix',
      motto: 'creed_Beta',
      culture: 'roman'
    })
    expect(result).toEqual({ ok: true })
    const text = readFileSync(dynPath, 'utf-8')
    expect(text).toBe(
      DYN_SOURCE.replace('\tmotto = "creed_Alpha"', '\tmotto = "creed_Beta"').replace(
        '\tculture = greek # main culture',
        '\tculture = roman # main culture'
      )
    )
  })

  it('preserves a comment glued to the value when editing', () => {
    const result = saveHouse(modPath, 'mod_houses.txt', 'house_Beta', {
      name: 'house_Beta',
      prefix: null,
      motto: null,
      dynasty: '31'
    })
    expect(result).toEqual({ ok: true })
    expect(readFileSync(housePath, 'utf-8')).toContain('    dynasty = 31#Karling\n')
  })

  it('edits a key spelled with unexpected case in place', () => {
    const result = saveDynasty(modPath, 'mod_dyn.txt', 'dynn_Caps', {
      name: 'dynn_Caps2',
      prefix: null,
      motto: null,
      culture: null
    })
    expect(result).toEqual({ ok: true })
    expect(readFileSync(dynPath, 'utf-8')).toContain('\tName = "dynn_Caps2"\n')
  })

  it('removes the line when a field is cleared', () => {
    const result = saveDynasty(modPath, 'mod_dyn.txt', 'dynn_Alpha', {
      name: 'dynn_Alpha',
      prefix: null,
      motto: 'creed_Alpha',
      culture: 'greek'
    })
    expect(result).toEqual({ ok: true })
    expect(readFileSync(dynPath, 'utf-8')).toBe(
      DYN_SOURCE.replace('\tprefix = dynn_prefix#glued\n', '')
    )
  })

  it('inserts a missing motto at the end of a tab-indented block', () => {
    const result = saveDynasty(modPath, 'mod_dyn.txt', '25061', {
      name: 'dynn_Karling',
      prefix: null,
      motto: 'creed_Karling',
      culture: 'frankish'
    })
    expect(result).toEqual({ ok: true })
    const text = readFileSync(dynPath, 'utf-8')
    expect(text).toContain('\tculture = "frankish"\n\tmotto = "creed_Karling"\n}')
    // Re-parse to prove the file is still structurally valid
    expect(data().dynasties.find((d) => d.id === '25061')!.motto).toBe('creed_Karling')
  })

  it('inserts a missing motto into a 4-space-indented block', () => {
    const result = saveHouse(modPath, 'mod_houses.txt', 'house_Beta', {
      name: 'house_Beta',
      prefix: null,
      motto: 'house_words',
      dynasty: '25061'
    })
    expect(result).toEqual({ ok: true })
    const text = readFileSync(housePath, 'utf-8')
    expect(text).toContain('    dynasty = 25061#Karling\n    motto = "house_words"\n}')
    expect(data().houses.find((h) => h.id === 'house_Beta')!.motto).toBe('house_words')
  })

  it('inserts inline into a single-line block, keeping it on one line', () => {
    const result = saveHouse(modPath, 'mod_houses.txt', '2', {
      name: 'inline',
      prefix: null,
      motto: 'word',
      dynasty: null
    })
    expect(result).toEqual({ ok: true })
    expect(readFileSync(housePath, 'utf-8')).toContain('2 = { name = "inline" motto = "word" }')
    const house = data().houses.find((h) => h.id === '2')!
    expect(house.name).toBe('inline')
    expect(house.motto).toBe('word')
  })

  it('reports a missing file or id instead of throwing', () => {
    const patch = { name: null, prefix: null, motto: null, culture: null }
    expect(saveDynasty(modPath, 'nope.txt', 'dynn_Alpha', patch).ok).toBe(false)
    expect(saveDynasty(modPath, 'mod_dyn.txt', 'nope', patch).ok).toBe(false)
  })
})

// ---------- Regressions from the adversarial review ----------
// Fully isolated fixtures so the shared beforeEach above can't interfere

const root2 = mkdtempSync(join(tmpdir(), 'ck3-tools-dynasties-regr-'))
const gameDir2 = join(root2, 'game')
const modPath2 = join(root2, 'mod')

afterAll(() => rmSync(root2, { recursive: true, force: true }))

describe('review regressions', () => {
  beforeEach(() => {
    rmSync(modPath2, { recursive: true, force: true })
    rmSync(gameDir2, { recursive: true, force: true })
    writeFixture(
      modPath2,
      'history/characters/oneline.txt',
      // A statement FOLLOWING an inline sub-block must not be swallowed as the
      // block key's "value"
      '900 = { 1000.1.1 = { birth = yes } Female=yes dynasty = phokas name = "Anna" }\n'
    )
    writeFixture(modPath2, 'history/characters/vanilla_graft.txt', [
      '901 = {',
      '\tname = "Grafted"',
      '\tdynasty_house = house_GameChain',
      '}',
      ''
    ].join('\n'))
    writeFixture(modPath2, 'common/dynasties/regr_dyn.txt', [
      'd_1 = { name = "A" motto = "B" }',
      'd_2 = {',
      '\tmotto = "A#B"',
      '\tname = "x"',
      '}',
      ''
    ].join('\n'))
    writeFixture(gameDir2, 'common/dynasties/game_dyn.txt', [
      'dynn_GameChain = {',
      '\tname = "dynn_GameChain"',
      '}',
      ''
    ].join('\n'))
    writeFixture(gameDir2, 'common/dynasty_houses/game_houses.txt', [
      'house_GameChain = {',
      '\tname = "dynn_GameChain"',
      '\tdynasty = dynn_GameChain',
      '}',
      ''
    ].join('\n'))
  })

  const data2 = () => getDynastyData(gameDir2, modPath2, [])

  it('keeps statements that follow an inline sub-block on one line', () => {
    const c = data2().characters.find((x) => x.id === '900')!
    expect(c.birth).toBe('1000.1.1')
    expect(c.female).toBe(true)
    expect(c.dynasty).toBe('phokas')
    expect(c.name).toBe('Anna')
  })

  it('pulls in the game parent dynasty of a game house the mod grafts onto', () => {
    const d = data2()
    const house = d.houses.find((h) => h.id === 'house_GameChain')
    expect(house).toBeDefined()
    expect(house!.inMod).toBe(false)
    const parent = d.dynasties.find((x) => x.id === 'dynn_GameChain')
    expect(parent).toBeDefined()
    expect(parent!.inMod).toBe(false)
  })

  it('edits multi-statement one-line defs without duplicating keys', () => {
    const path2 = join(modPath2, 'common', 'dynasties', 'regr_dyn.txt')
    const patch = { name: 'New', prefix: null, motto: 'B', culture: null }
    expect(saveDynasty(modPath2, 'regr_dyn.txt', 'd_1', patch)).toEqual({ ok: true })
    const afterFirst = readFileSync(path2, 'utf-8')
    expect(afterFirst).toContain('d_1 = { name = "New" motto = "B" }')
    // A second identical save must change nothing
    expect(saveDynasty(modPath2, 'regr_dyn.txt', 'd_1', patch)).toEqual({ ok: true })
    expect(readFileSync(path2, 'utf-8')).toBe(afterFirst)
    expect(data2().dynasties.find((x) => x.id === 'd_1')!.name).toBe('New')
  })

  it('no-op save round-trips a quoted value containing #', () => {
    const path2 = join(modPath2, 'common', 'dynasties', 'regr_dyn.txt')
    const before = readFileSync(path2, 'utf-8')
    const d = data2().dynasties.find((x) => x.id === 'd_2')!
    expect(d.motto).toBe('A#B')
    expect(
      saveDynasty(modPath2, 'regr_dyn.txt', 'd_2', {
        name: d.name,
        prefix: d.prefix,
        motto: d.motto,
        culture: d.culture
      })
    ).toEqual({ ok: true })
    expect(readFileSync(path2, 'utf-8')).toBe(before)
  })
})

// .mod descriptors write `path` with forward slashes; a mod path in that form
// must still identify its own files as editable (Hegemonia showed every
// dynasty as vanilla because the prefix comparison assumed native separators).
describe('forward-slash mod path', () => {
  const slashed = modPath.replace(/\\/g, '/')

  it('marks mod defs as in-mod', () => {
    const d = getDynastyData(gameDir, slashed, [])
    expect(d.dynasties.find((x) => x.id === 'dynn_Alpha')!.inMod).toBe(true)
    expect(d.houses.find((x) => x.id === 'house_Beta')!.inMod).toBe(true)
    expect(d.dynasties.find((x) => x.id === 'Phokus')!.inMod).toBe(false)
  })

  it('keeps mod defs that no character references', () => {
    // These survive only because they are recognized as mod content
    expect(getDynastyData(gameDir, slashed, []).dynasties.some((x) => x.id === 'dynn_ModOnly')).toBe(
      true
    )
  })
})
