import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { MOD_PROFILE_FILE, readModProfile } from './modProfile'

// Synthetic mod folders in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-profile-'))

function modWithProfile(name: string, content: string | null): string {
  const modPath = join(root, name)
  mkdirSync(modPath, { recursive: true })
  if (content !== null) writeFileSync(join(modPath, MOD_PROFILE_FILE), content, 'utf-8')
  return modPath
}

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('readModProfile', () => {
  it('reads a full calendar config', () => {
    const modPath = modWithProfile(
      'full',
      '{ "calendar": { "epochYear": 4000, "beforeLabel": "BC", "afterLabel": "AD" } }'
    )
    expect(readModProfile(modPath)).toEqual({
      calendar: { epochYear: 4000, beforeLabel: 'BC', afterLabel: 'AD' }
    })
  })

  it('defaults missing era labels to BC/AD', () => {
    const modPath = modWithProfile('labels', '{ "calendar": { "epochYear": 500 } }')
    expect(readModProfile(modPath)).toEqual({
      calendar: { epochYear: 500, beforeLabel: 'BC', afterLabel: 'AD' }
    })
  })

  it('returns null when the file is absent', () => {
    expect(readModProfile(modWithProfile('absent', null))).toBeNull()
    expect(readModProfile(join(root, 'no-such-mod'))).toBeNull()
    expect(readModProfile(null)).toBeNull()
  })

  it('degrades malformed content to null instead of erroring', () => {
    expect(readModProfile(modWithProfile('bad-json', 'not json {'))).toBeNull()
    expect(readModProfile(modWithProfile('array', '[1, 2]'))).toEqual({ calendar: null })
    expect(
      readModProfile(modWithProfile('bad-epoch', '{ "calendar": { "epochYear": "4000" } }'))
    ).toEqual({ calendar: null })
    expect(
      readModProfile(modWithProfile('no-calendar', '{ "somethingElse": true }'))
    ).toEqual({ calendar: null })
  })
})
