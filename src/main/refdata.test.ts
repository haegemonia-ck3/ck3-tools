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
writeFixture(modPath, 'common/dynasties/my_dynasties.txt', 'dynn_Foo = {\n\tname = "Foo"\n}\n')
writeFixture(modPath, 'common/dynasty_houses/my_houses.txt', 'house_Bar = {\n}\n')

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('getReferenceData dynasties', () => {
  it('unions dynasty and dynasty-house ids', () => {
    const data = getReferenceData(gameDir, modPath, [])
    expect(data.dynasties).toEqual(['dynn_Foo', 'house_Bar'])
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
