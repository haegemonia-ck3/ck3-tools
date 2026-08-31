import type { EntryRef } from './types'

/**
 * Keys for the per-tool favorites, recents and draft stores. Ids are matched
 * the way the scanners spell them everywhere else — trimmed and lowercased —
 * so a row reached as `Phokus` and one reached as `phokus` are one entry.
 */
export const normEntryId = (id: string): string => id.trim().toLowerCase()

/**
 * The key an entry is stored under. An id identifies a row on its own in most
 * tools; a character needs the history file it is defined in and a lineage
 * needs `dynasty` vs `house`, which is what `scope` carries.
 */
export function entryKey(ref: EntryRef): string {
  const id = normEntryId(ref.id)
  return ref.scope === undefined ? id : `${ref.scope}:${id}`
}

/** Whether two refs point at the same entry. */
export const sameEntry = (a: EntryRef, b: EntryRef): boolean => entryKey(a) === entryKey(b)
