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
  stacked = false,
  className,
  nameClassName
}: {
  entry: RefEntry
  /**
   * Put the id on its own line under the name, unparenthesised, for places
   * with the vertical room for it (badges).
   */
  stacked?: boolean
  /** Applied to the whole label; the id keeps its muted styling regardless. */
  className?: string
  /**
   * Applied to the leading line alone — the name, or the id when there is no
   * name. This is where a link's underline goes, so it marks what reads as the
   * label rather than trailing under the id too.
   */
  nameClassName?: string
}): React.JSX.Element {
  if (entry.name === null || entry.name === '') {
    return <span className={cn('font-mono', className, nameClassName)}>{entry.id}</span>
  }
  if (stacked) {
    return (
      <span className={cn('flex min-w-0 flex-col leading-tight', className)}>
        <span className={cn('truncate', nameClassName)}>{entry.name}</span>
        <span className="truncate font-mono text-[0.85em] text-muted-foreground">{entry.id}</span>
      </span>
    )
  }
  return (
    <span className={cn('min-w-0 truncate', className)}>
      <span className={nameClassName}>{entry.name}</span>{' '}
      <span className="font-mono text-muted-foreground">({entry.id})</span>
    </span>
  )
}
