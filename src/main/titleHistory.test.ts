import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import {
  addTitleHistoryEntry,
  deleteTitleHistoryEntry,
  getTitleHistory,
  listTitleHistoryFiles,
  saveTitleHistoryEntry
} from './titleHistory'
import type { TitleHistoryEntry, TitleHistoryEntryPatch } from '@shared/types'

// Synthetic game/mod layout in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-title-history-'))
const gameDir = join(root, 'game')
const modPath = join(root, 'mod')

function writeFixture(base: string, rel: string, content: string): void {
  const full = join(base, ...rel.split('/'))
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, content, 'utf-8')
}

// Deliberately messy, mirroring real title-history files: BOM + CRLF, a
// single-line dated block with a tab inside the braces and an era comment,
// out-of-order dates (dev lines first — the vanilla house style), a duplicate
// date split across two blocks (one holding only an effect), a quoted liege, a
// two-part date, a trailing-dot date, an annotated holder line, an empty title
// block, and the same title re-opened by a second block in the same file.
const MOD_HISTORY = [
  '﻿###Kingdom of Hellas',
  'k_hellas = {',
  '\t3200.1.1 = {\tchange_development_level = 2 } # 800 BCE',
  '\t3400.1.1 = {',
  '\t\tchange_development_level = 5',
  '\t}',
  '\t#Founders',
  '\t3254.1.1 = {',
  '\t\tholder = Neleidae_1 #Neleus the Elder',
  '\t\tliege = "e_hellas"',
  '\t\tgovernment = aristocratic_government',
  '\t\tsuccession_laws = {',
  '\t\t\tmale_only_law # men only',
  '\t\t}',
  '\t}',
  '\t3254.1.1 = {',
  '\t\teffect = {',
  '\t\t\tset_variable = { name = adventurer_reason value = flag:historical }',
  '\t\t}',
  '\t}',
  '\t3300.1 = {',
  '\t\tholder = 0',
  '\t}',
  '}',
  '',
  'd_empty = {',
  '}',
  'd_empty = {',
  '\t3210.1.1. = { holder = 77 }',
  '}',
  ''
].join('\r\n')

const GAME_HISTORY = [
  'k_hellas = {',
  '\t800.1.1 = { holder = 111 }',
  '}',
  'k_game_only = {',
  '\t867.1.1 = { holder = 5 de_jure_liege = "e_hre" }',
  '}',
  ''
].join('\n')

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  writeFixture(modPath, 'history/titles/k_hellas.txt', MOD_HISTORY)
  writeFixture(gameDir, 'history/titles/k_game.txt', GAME_HISTORY)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

const history = (id: string) => getTitleHistory(gameDir, modPath, [], id)
const read = () => readFileSync(join(modPath, 'history', 'titles', 'k_hellas.txt'), 'utf-8')

/** A patch reproducing the entry exactly as parsed — the no-op patch. */
function patchOf(entry: TitleHistoryEntry): TitleHistoryEntryPatch {
  const { file, inMod, titleBlock, index, opaqueBlocks, extra, ...patch } = entry
  return patch
}

const emptyPatch = (date: string): TitleHistoryEntryPatch => ({
  date,
  holder: null,
  liege: null,
  deJureLiege: null,
  government: null,
  changeDevelopmentLevel: null,
  developmentLevel: null,
  name: null,
  resetName: null,
  insertTitleHistory: null,
  removeSuccessionLaws: null,
  holderIgnoreHeadOfFaithRequirement: null,
  successionLaws: null
})

describe('getTitleHistory', () => {
  it('aggregates entries across game and mod files, keeping file order', () => {
    const entries = history('k_hellas')
    expect(entries.map((e) => e.date)).toEqual([
      '800.1.1',
      '3200.1.1',
      '3400.1.1',
      '3254.1.1',
      '3254.1.1',
      '3300.1'
    ])
    expect(entries[0]).toMatchObject({ inMod: false, file: 'k_game.txt', holder: '111' })
    expect(entries.slice(1).every((e) => e.inMod)).toBe(true)
  })

  it('parses scalars, quoted values, laws and vacancy', () => {
    const entries = history('k_hellas')
    const founder = entries[3]
    expect(founder).toMatchObject({
      holder: 'Neleidae_1',
      liege: 'e_hellas',
      government: 'aristocratic_government',
      successionLaws: ['male_only_law'],
      titleBlock: 0,
      index: 2
    })
    expect(entries[1]).toMatchObject({ changeDevelopmentLevel: '2', holder: null })
    expect(entries[5]).toMatchObject({ date: '3300.1', holder: '0' })
    expect(history('k_game_only')[0]).toMatchObject({ deJureLiege: 'e_hre' })
  })

  it('keeps duplicate-date blocks distinct and treats effect as opaque', () => {
    const entries = history('k_hellas')
    const effectOnly = entries[4]
    expect(effectOnly).toMatchObject({ index: 3, holder: null, opaqueBlocks: ['effect'] })
    // holder/name inside the effect must not leak into the entry's fields
    expect(effectOnly.name).toBeNull()
    expect(effectOnly.extra).toEqual([])
  })

  it('addresses a re-opened title block by its ordinal, and skips empty blocks', () => {
    const entries = history('d_empty')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ date: '3210.1.1.', titleBlock: 1, index: 0, holder: '77' })
  })

  it('returns [] for a title with no history', () => {
    expect(history('c_nowhere')).toEqual([])
  })
})

describe('saveTitleHistoryEntry', () => {
  it('keeps a no-op save byte-identical for every entry shape', () => {
    const before = read()
    for (const entry of history('k_hellas').filter((e) => e.inMod)) {
      expect(
        saveTitleHistoryEntry(modPath, entry.file, 'k_hellas', entry.titleBlock, entry.index, patchOf(entry))
      ).toEqual({ ok: true })
    }
    const trailingDot = history('d_empty')[0]
    expect(
      saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'd_empty', 1, 0, patchOf(trailingDot))
    ).toEqual({ ok: true })
    expect(read()).toBe(before)
  })

  it('replaces a value in place, keeping the line comment and quote style', () => {
    const founder = history('k_hellas')[3]
    const patch = patchOf(founder)
    patch.holder = 'Neleidae_2'
    patch.liege = 'e_argos'
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 2, patch)).toEqual({
      ok: true
    })
    const text = read()
    expect(text).toContain('\t\tholder = Neleidae_2 #Neleus the Elder')
    expect(text).toContain('\t\tliege = "e_argos"')
  })

  it('edits a single-line block in place, comment intact', () => {
    const entry = history('k_hellas')[1]
    const patch = patchOf(entry)
    patch.changeDevelopmentLevel = '3'
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 0, patch)).toEqual({
      ok: true
    })
    expect(read()).toContain('\t3200.1.1 = {\tchange_development_level = 3 } # 800 BCE')
  })

  it('renames the date key without touching the body', () => {
    const entry = history('k_hellas')[5]
    const patch = patchOf(entry)
    patch.date = '3300.1.1'
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 4, patch)).toEqual({
      ok: true
    })
    const text = read()
    expect(text).toContain('\t3300.1.1 = {')
    expect(text).toContain('\t\tholder = 0')
    expect(history('k_hellas')[5].date).toBe('3300.1.1')
  })

  it('adds and removes scalars inside an existing block', () => {
    const founder = history('k_hellas')[3]
    const patch = patchOf(founder)
    patch.government = null
    patch.name = 'KINGDOM_OF_HELLAS'
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 2, patch)).toEqual({
      ok: true
    })
    const text = read()
    expect(text).not.toContain('aristocratic_government')
    expect(text).toContain('\t\tname = KINGDOM_OF_HELLAS')
  })

  it('rewrites succession_laws only when the list changed', () => {
    // Unchanged list: the annotated law line survives verbatim
    const founder = history('k_hellas')[3]
    expect(
      saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 2, patchOf(founder))
    ).toEqual({ ok: true })
    expect(read()).toContain('\t\t\tmale_only_law # men only')
    // Changed list: rewritten, keeping the block's indentation
    const patch = patchOf(founder)
    patch.successionLaws = ['male_only_law', 'noble_family_succession_law']
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 2, patch)).toEqual({
      ok: true
    })
    expect(read()).toContain('\t\t\tnoble_family_succession_law')
    // Cleared: the whole statement goes
    const cleared = patchOf(history('k_hellas')[3])
    cleared.successionLaws = null
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 2, cleared)).toEqual({
      ok: true
    })
    expect(read()).not.toContain('succession_laws')
  })

  it('preserves the effect block through unrelated edits', () => {
    const effectOnly = history('k_hellas')[4]
    const patch = patchOf(effectOnly)
    patch.holder = '42'
    expect(saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 3, patch)).toEqual({
      ok: true
    })
    const text = read()
    expect(text).toContain('set_variable = { name = adventurer_reason value = flag:historical }')
    expect(history('k_hellas')[4]).toMatchObject({ holder: '42', opaqueBlocks: ['effect'] })
  })

  it('validates the date and reports a stale address', () => {
    expect(
      saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 0, emptyPatch('garbage'))
    ).toEqual({ ok: false, error: 'Invalid date "garbage" (expected Y.M.D)' })
    expect(
      saveTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 99, emptyPatch('1.1.1'))
    ).toEqual({
      ok: false,
      error: 'History entry not found in k_hellas.txt — the file may have changed on disk'
    })
    expect(
      saveTitleHistoryEntry(modPath, 'k_game.txt', 'k_hellas', 0, 0, emptyPatch('1.1.1'))
    ).toEqual({ ok: false, error: 'File not found: k_game.txt' })
  })
})

describe('addTitleHistoryEntry', () => {
  it('appends a dated block to the end of the title block, in the file style', () => {
    const before = read()
    const patch = emptyPatch('3500.1.1')
    patch.holder = 'Neleidae_9'
    patch.successionLaws = ['male_only_law']
    expect(addTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', patch)).toEqual({ ok: true })
    const after = read()
    const block = [
      '\t3500.1.1 = {',
      '\t\tholder = Neleidae_9',
      '\t\tsuccession_laws = { male_only_law }',
      '\t}'
    ].join('\r\n')
    expect(after).toContain(block)
    expect(after.replace(block + '\r\n', '')).toBe(before)
    const added = history('k_hellas').find((e) => e.date === '3500.1.1')!
    expect(added).toMatchObject({ holder: 'Neleidae_9', successionLaws: ['male_only_law'] })
    // The added entry round-trips through a no-op save
    const { file, inMod, titleBlock, index, opaqueBlocks, extra, ...noop } = added
    expect(saveTitleHistoryEntry(modPath, file, 'k_hellas', titleBlock, index, noop)).toEqual({
      ok: true
    })
    expect(read()).toBe(after)
  })

  it('lands in the last block when the title is re-opened', () => {
    const patch = emptyPatch('3220.1.1')
    patch.changeDevelopmentLevel = '1'
    expect(addTitleHistoryEntry(modPath, 'k_hellas.txt', 'd_empty', patch)).toEqual({ ok: true })
    const added = history('d_empty').find((e) => e.date === '3220.1.1')
    expect(added).toMatchObject({ titleBlock: 1, index: 1 })
  })

  it('creates a whole new title block when the file has none', () => {
    const before = read()
    const patch = emptyPatch('3100.1.1')
    patch.holder = '55'
    expect(addTitleHistoryEntry(modPath, 'k_hellas.txt', 'c_corinth', patch)).toEqual({ ok: true })
    const after = read()
    expect(after.startsWith(before.replace(/\r?\n$/, ''))).toBe(true)
    expect(after).toContain(
      ['c_corinth = {', '\t3100.1.1 = {', '\t\tholder = 55', '\t}', '}'].join('\r\n')
    )
    expect(history('c_corinth')).toHaveLength(1)
  })

  it('creates the file itself when missing', () => {
    const patch = emptyPatch('3100.1.1')
    patch.holder = 'lindos'
    expect(addTitleHistoryEntry(modPath, 'fresh.txt', 'd_rhodes', patch)).toEqual({ ok: true })
    expect(listTitleHistoryFiles(modPath)).toEqual(['fresh.txt', 'k_hellas.txt'])
    expect(readFileSync(join(modPath, 'history', 'titles', 'fresh.txt'), 'utf-8')).toBe(
      ['d_rhodes = {', '\t3100.1.1 = {', '\t\tholder = lindos', '\t}', '}', ''].join('\n')
    )
  })

  it('validates the date, the id and the file name', () => {
    expect(addTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', emptyPatch('bad')).ok).toBe(
      false
    )
    expect(addTitleHistoryEntry(modPath, 'sub\\dir.txt', 'k_hellas', emptyPatch('1.1.1')).ok).toBe(
      false
    )
    expect(addTitleHistoryEntry(modPath, 'k_hellas.txt', 'bad id', emptyPatch('1.1.1')).ok).toBe(
      false
    )
  })
})

describe('deleteTitleHistoryEntry', () => {
  it('cuts one dated block, leaving the rest byte-identical', () => {
    const before = read()
    expect(deleteTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 0, 3)).toEqual({
      ok: true
    })
    const after = read()
    expect(after).not.toContain('set_variable')
    const cut = [
      '\t3254.1.1 = {',
      '\t\teffect = {',
      '\t\t\tset_variable = { name = adventurer_reason value = flag:historical }',
      '\t\t}',
      '\t}',
      ''
    ].join('\r\n')
    expect(before.replace(cut, '')).toBe(after)
    expect(history('k_hellas').filter((e) => e.inMod)).toHaveLength(4)
  })

  it('leaves an emptied title block in place', () => {
    expect(deleteTitleHistoryEntry(modPath, 'k_hellas.txt', 'd_empty', 1, 0)).toEqual({ ok: true })
    expect(history('d_empty')).toEqual([])
    expect(read()).toContain('d_empty = {')
  })

  it('reports a stale address', () => {
    expect(deleteTitleHistoryEntry(modPath, 'k_hellas.txt', 'k_hellas', 5, 0)).toEqual({
      ok: false,
      error: 'History entry not found in k_hellas.txt — the file may have changed on disk'
    })
  })
})
