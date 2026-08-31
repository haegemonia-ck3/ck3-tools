import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { entryKey } from '@shared/entries'
import type { AppSettings, CharacterDetail, EntryDraft, EntryRef } from '@shared/types'

const DEFAULTS: AppSettings = {
  gameDir: null,
  modDir: null,
  selectedModFile: null,
  recentEntries: {},
  favoriteEntries: {},
  entryDrafts: {},
  textEditorPath: null,
  useModFonts: true
}

/** The character-only shape of the stores, as settings.json held them before. */
interface LegacyStores {
  recentCharacters?: Record<string, { file: string; id: string; name: string | null }[]>
  favoriteCharacters?: Record<string, { file: string; id: string; name: string | null }[]>
  draftCharacters?: Record<
    string,
    Record<string, { draft: CharacterDetail; original: CharacterDetail }>
  >
}

/**
 * Favorites, recents and drafts started out as character-only stores, keyed
 * straight by mod. Fold what a pre-existing settings.json holds into the
 * per-tool stores under `characters`, dropping the old keys so the fold runs
 * once. A character's history file is its ref scope, so the keys survive.
 */
function migrateCharacterStores(settings: AppSettings & LegacyStores): AppSettings {
  const { recentCharacters, favoriteCharacters, draftCharacters, ...rest } = settings
  if (!recentCharacters && !favoriteCharacters && !draftCharacters) return settings

  const refs = (
    byMod: Record<string, { file: string; id: string; name: string | null }[]> | undefined
  ): Record<string, EntryRef[]> =>
    Object.fromEntries(
      Object.entries(byMod ?? {}).map(([mod, list]) => [
        mod,
        list.map((r) => ({ id: r.id, name: r.name, scope: r.file }))
      ])
    )

  const drafts: Record<string, Record<string, EntryDraft>> = {}
  for (const [mod, byKey] of Object.entries(draftCharacters ?? {})) {
    drafts[mod] = {}
    for (const entry of Object.values(byKey)) {
      const ref: EntryRef = {
        id: entry.original.id,
        name: entry.draft.name,
        scope: entry.original.file
      }
      drafts[mod][entryKey(ref)] = { draft: entry.draft, original: entry.original, ref }
    }
  }

  return {
    ...rest,
    recentEntries: { ...rest.recentEntries, characters: refs(recentCharacters) },
    favoriteEntries: { ...rest.favoriteEntries, characters: refs(favoriteCharacters) },
    entryDrafts: { ...rest.entryDrafts, characters: drafts }
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    return migrateCharacterStores({ ...DEFAULTS, ...JSON.parse(raw) })
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...patch }
  const file = settingsPath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(merged, null, 2), 'utf-8')
  return merged
}
