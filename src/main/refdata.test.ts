import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { getReferenceData, locateRef } from './refdata'

// Synthetic game/mod layout in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-refdata-'))
const gameDir = join(root, 'game')
const modPath = join(root, 'mod')

function writeFixture(base: string, rel: string, content: string): void {
  const full = join(base, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

writeFixture(
  gameDir,
  'common/traits/00_traits.txt',
  '# game traits\nbrave = {\n\tmonthly_prestige = 0.1\n}\nambitious = {\n}\n'
)
writeFixture(
  modPath,
  'common/traits/zz_mod_traits.txt',
  'brave = {\n\t# mod override\n}\nmod_only_trait = {\n}\n'
)
writeFixture(
  modPath,
  'common/religion/religion_types/my_religions.txt',
  'religion_one = {\n\tdoctrine = x\n\tfaiths = {\n\t\tfaith_a = {\n\t\t\tcolor = { 1 2 3 }\n\t\t}\n\t\tfaith_b = {\n\t\t}\n\t}\n}\n'
)
writeFixture(
  modPath,
  'common/dynasties/my_dynasties.txt',
  'dynn_Foo = {\n\tname = "dynn_Foo"\n}\ndynn_Nameless = {\n}\n'
)
writeFixture(modPath, 'common/dynasty_houses/my_houses.txt', 'house_Bar = {\n\tname = house_Bar\n}\n')
writeFixture(modPath, 'common/culture/cultures/my_cultures.txt', 'attic = {\n}\n')

// Localization the names resolve through. The game's copy sits in a DLC
// subfolder to prove the scan isn't limited to the tree's top level, and the
// mod's entry for `brave` layers over the game's.
writeFixture(
  gameDir,
  'localization/english/dlc/ep1/traits_l_english.yml',
  'l_english:\n trait_brave:0 "Brave"\n trait_ambitious:0 "Ambitious"\n'
)
writeFixture(
  modPath,
  'localization/english/mod_l_english.yml',
  'l_english:\n trait_brave:0 "Bold"\n attic:0 "Attic"\n faith_a:0 "Faith A"\n dynn_Foo:0 "Foo"\n house_Bar:0 "Bar"\n'
)

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('getReferenceData dynasties', () => {
  // Character `dynasty` and `dynasty_house` are separate fields, so each gets
  // its own option list rather than one merged pool
  it('keeps dynasty and dynasty-house ids apart', () => {
    const data = getReferenceData(gameDir, modPath, [])
    expect(data.dynasties.map((d) => d.id)).toEqual(['dynn_Foo', 'dynn_Nameless'])
    expect(data.houses.map((h) => h.id)).toEqual(['house_Bar'])
  })
})

describe('getReferenceData names', () => {
  it('resolves each kind through its own localization key', () => {
    const data = getReferenceData(gameDir, modPath, [])
    // cultures and faiths key off the id itself, traits off `trait_<id>`
    expect(data.cultures).toEqual([{ id: 'attic', name: 'Attic' }])
    expect(data.faiths).toContainEqual({ id: 'faith_a', name: 'Faith A' })
    expect(data.traits).toContainEqual({ id: 'ambitious', name: 'Ambitious' })
    // dynasties and houses key off their `name` scalar, quoted or not
    expect(data.dynasties).toContainEqual({ id: 'dynn_Foo', name: 'Foo' })
    expect(data.houses).toEqual([{ id: 'house_Bar', name: 'Bar' }])
  })

  it('layers mod localization over the game files', () => {
    const data = getReferenceData(gameDir, modPath, [])
    expect(data.traits).toContainEqual({ id: 'brave', name: 'Bold' })
  })

  it('leaves a name null when nothing localizes it', () => {
    const data = getReferenceData(gameDir, modPath, [])
    // no `name` line at all, and ids whose localization key is missing
    expect(data.dynasties).toContainEqual({ id: 'dynn_Nameless', name: null })
    expect(data.traits).toContainEqual({ id: 'mod_only_trait', name: null })
    expect(data.faiths).toContainEqual({ id: 'faith_b', name: null })
  })
})

describe('locateRef', () => {
  it('finds a top-level definition with its line number', () => {
    const loc = locateRef(gameDir, modPath, [], 'trait', 'ambitious')
    expect(loc).toEqual({
      path: join(gameDir, 'common', 'traits', '00_traits.txt'),
      line: 5,
      inMod: false
    })
  })

  it('prefers a mod definition over the game one', () => {
    const loc = locateRef(gameDir, modPath, [], 'trait', 'brave')
    expect(loc).toEqual({
      path: join(modPath, 'common', 'traits', 'zz_mod_traits.txt'),
      line: 1,
      inMod: true
    })
  })

  it('finds faiths nested inside religion blocks', () => {
    const loc = locateRef(gameDir, modPath, [], 'faith', 'faith_b')
    expect(loc).toEqual({
      path: join(modPath, 'common', 'religion', 'religion_types', 'my_religions.txt'),
      line: 7,
      inMod: true
    })
  })

  it('looks across both dynasty directories', () => {
    expect(locateRef(gameDir, modPath, [], 'dynasty', 'dynn_Foo')?.line).toBe(1)
    expect(locateRef(gameDir, modPath, [], 'dynasty', 'house_Bar')?.inMod).toBe(true)
  })

  it('returns null for an unknown id', () => {
    expect(locateRef(gameDir, modPath, [], 'trait', 'nonexistent')).toBeNull()
  })
})
