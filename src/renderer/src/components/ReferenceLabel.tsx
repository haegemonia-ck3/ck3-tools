import type { RefEntry } from '@shared/types'
import { cn } from '@/lib/utils'

/** A bare id, for reference kinds that have no names (files, character ids). */
export const idOnly = (id: string): RefEntry => ({ id, name: null })

/**
 * One searchable string for a reference: "Name (id)", or the bare id when it
 * has no name. This is what the combobox filters on, so typing either half of
 * the label finds the entry.
 */
export function refLabel(entry: RefEntry): string {
  return entry.name === null || entry.name === '' ? entry.id : `${entry.name} (${entry.id})`
}

/** The entry for `id` out of `entries`, or a name-less one when it isn't listed. */
export function findRef(entries: readonly RefEntry[], id: string): RefEntry {
  return entries.find((e) => e.id === id) ?? idOnly(id)
}

/**
 * The rendered counterpart to `refLabel`: the name in normal text with the id
 * trailing in muted parentheses. A reference with no name shows just the id,
 * monospaced — the same way raw ids read everywhere else in the app.
 */
export default function ReferenceLabel({
  entry,
  className
}: {
  entry: RefEntry
  /** Applied to the whole label; the id keeps its muted styling regardless. */
  className?: string
}): React.JSX.Element {
  if (entry.name === null || entry.name === '') {
    return <span className={cn('font-mono', className)}>{entry.id}</span>
  }
  return (
    <span className={cn('min-w-0 truncate', className)}>
      {entry.name} <span className="font-mono text-muted-foreground">({entry.id})</span>
    </span>
  )
}
