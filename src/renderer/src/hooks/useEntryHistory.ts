import { useCallback, useRef } from 'react'
import { useApp } from '../AppContext'
import { entryKey, sameEntry } from '@shared/entries'
import type { AppSettings, EntryDraft, EntryRef, ToolKey } from '@shared/types'

/** How many recents an editor remembers per mod. */
export const RECENTS_CAP = 10
/** How many of them show before the row offers "Show more". */
export const RECENTS_COLLAPSED = 5

type ListKey = 'recentEntries' | 'favoriteEntries'

export interface EntryHistory {
  /** Starred rows, in the order they were starred */
  favorites: EntryRef[]
  /** Visited rows, most recent first */
  recents: EntryRef[]
  /** Rows with unsaved edits, keyed by `entryKey` */
  drafts: Record<string, EntryDraft>
  isFavorite: (ref: EntryRef) => boolean
  toggleFavorite: (ref: EntryRef) => void
  /** Move a row to the front of the recents, recording the name it reads by */
  recordVisit: (ref: EntryRef) => void
  /** Drop a row from the recents (the chip's ×) */
  forget: (ref: EntryRef) => void
  /** Point the lists at a row's new id after a save renames it */
  rename: (from: EntryRef, to: EntryRef) => void
  /** Store (or, with null, clear) a row's unsaved edits */
  persistDraft: (ref: EntryRef, entry: EntryDraft | null) => void
}

/**
 * One editor's remembered rows — favorites, recents and unsaved drafts — for
 * the selected mod. All three live in settings.json under the tool's key, so
 * they survive navigation, mod switches and app restarts; nothing is written
 * while no mod is selected.
 */
export function useEntryHistory(tool: ToolKey): EntryHistory {
  const { settings, selectedMod, updateSettings } = useApp()
  const modKey = selectedMod?.file ?? null

  const favorites = (modKey && settings?.favoriteEntries?.[tool]?.[modKey]) || []
  const recents = (modKey && settings?.recentEntries?.[tool]?.[modKey]) || []
  const drafts = (modKey && settings?.entryDrafts?.[tool]?.[modKey]) || {}

  // Ref so the writers below can stay referentially stable — a panel's persist
  // effect depends on one, and a fresh closure per render would re-arm it.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const writeList = useCallback(
    (key: ListKey, list: EntryRef[]): void => {
      if (!modKey) return
      const all = settingsRef.current?.[key] ?? {}
      void updateSettings({ [key]: { ...all, [tool]: { ...all[tool], [modKey]: list } } })
    },
    [tool, modKey, updateSettings]
  )

  const isFavorite = (ref: EntryRef): boolean => favorites.some((r) => sameEntry(r, ref))

  return {
    favorites,
    recents,
    drafts,
    isFavorite,
    toggleFavorite: (ref) =>
      writeList(
        'favoriteEntries',
        isFavorite(ref) ? favorites.filter((r) => !sameEntry(r, ref)) : [...favorites, ref]
      ),
    recordVisit: (ref) =>
      writeList('recentEntries', [ref, ...recents.filter((r) => !sameEntry(r, ref))].slice(0, RECENTS_CAP)),
    forget: (ref) => writeList('recentEntries', recents.filter((r) => !sameEntry(r, ref))),
    rename: (from, to) => {
      if (!modKey || entryKey(from) === entryKey(to)) return
      const patch: Partial<AppSettings> = {}
      for (const key of ['recentEntries', 'favoriteEntries'] as ListKey[]) {
        const all = settingsRef.current?.[key] ?? {}
        const list = all[tool]?.[modKey] ?? []
        if (!list.some((r) => sameEntry(r, from))) continue
        patch[key] = {
          ...all,
          [tool]: { ...all[tool], [modKey]: list.map((r) => (sameEntry(r, from) ? to : r)) }
        }
      }
      if (Object.keys(patch).length > 0) void updateSettings(patch)
    },
    persistDraft: useCallback(
      (ref, entry) => {
        if (!modKey) return
        const all = settingsRef.current?.entryDrafts ?? {}
        const forMod = { ...all[tool]?.[modKey] }
        const key = entryKey(ref)
        if (entry === null) {
          if (!(key in forMod)) return
          delete forMod[key]
        } else {
          forMod[key] = entry
        }
        void updateSettings({ entryDrafts: { ...all, [tool]: { ...all[tool], [modKey]: forMod } } })
      },
      [tool, modKey, updateSettings]
    )
  }
}
