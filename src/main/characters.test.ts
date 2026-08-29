import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { getCharacter, saveCharacter } from './characters'

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
