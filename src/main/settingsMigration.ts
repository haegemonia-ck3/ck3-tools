import { entryKey } from '@shared/entries'
import type { AppSettings, CharacterDetail, EntryDraft, EntryRef } from '@shared/types'

/**
 * The character-only stores as settings.json held them before, keyed by mod.
 * Typed loose because the file is whatever is on disk — a hand-edited or much
 * older one may not hold the per-mod maps at all.
 */
export interface LegacyStores {
  recentCharacters?: unknown
  favoriteCharacters?: unknown
  draftCharacters?: unknown
}

interface LegacyRef {
  /** File name within history/characters, e.g. "HAAO_Attica.txt" */
  file: string
  id: string
  name: string | null
}

interface LegacyDraft {
  draft: CharacterDetail
  original: CharacterDetail
}

const refsByMod = (byMod: Record<string, LegacyRef[]> | undefined): Record<string, EntryRef[]> =>
  Object.fromEntries(
    Object.entries(byMod ?? {}).map(([mod, list]) => [
      mod,
      list.map((r) => ({ id: r.id, name: r.name, scope: r.file }))
    ])
  )

const draftsByMod = (
  byMod: Record<string, Record<string, LegacyDraft>> | undefined
): Record<string, Record<string, EntryDraft>> => {
  const out: Record<string, Record<string, EntryDraft>> = {}
  for (const [mod, byKey] of Object.entries(byMod ?? {})) {
    out[mod] = {}
    for (const entry of Object.values(byKey)) {
      // Keyed off the parse rather than the old "file:id" key, which spelled
      // the id exactly as the file did rather than normalized
      const ref: EntryRef = {
        id: entry.original.id,
        name: entry.draft.name,
        scope: entry.original.file
      }
      out[mod][entryKey(ref)] = { draft: entry.draft, original: entry.original, ref }
    }
  }
  return out
}

/**
 * Favorites, recents and drafts started out as character-only stores, keyed
 * straight by mod. Fold what a pre-existing settings.json holds into the
 * per-tool stores under `characters`, dropping the old keys so the next save
 * writes the file without them. A character's history file is what its ref
 * carries as scope, so nothing about which row a key names changes.
 */
export function migrateCharacterStores(settings: AppSettings & LegacyStores): AppSettings {
  const { recentCharacters, favoriteCharacters, draftCharacters, ...rest } = settings
  if (!recentCharacters && !favoriteCharacters && !draftCharacters) return rest

  // Guard the shape: a hand-edited (or much older) file may not hold the
  // per-mod maps this expects, and losing a store beats crashing on startup.
  const perMod = <T>(value: unknown): Record<string, T> | undefined =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, T>)
      : undefined

  return {
    ...rest,
    recentEntries: { ...rest.recentEntries, characters: refsByMod(perMod(recentCharacters)) },
    favoriteEntries: { ...rest.favoriteEntries, characters: refsByMod(perMod(favoriteCharacters)) },
    entryDrafts: { ...rest.entryDrafts, characters: draftsByMod(perMod(draftCharacters)) }
  }
}
