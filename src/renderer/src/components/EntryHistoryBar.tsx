import { useEffect, useState } from 'react'
import { useApp } from '../AppContext'
import ReferenceBadge from './ReferenceBadge'
import { RECENTS_COLLAPSED } from '../hooks/useEntryHistory'
import type { EntryHistory } from '../hooks/useEntryHistory'
import { entryKey, sameEntry } from '@shared/entries'
import type { EntryRef } from '@shared/types'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  history: EntryHistory
  /** The row currently open, marked as the one you're already looking at */
  active?: EntryRef | null
  onOpen: (ref: EntryRef) => void
  /**
   * The ref as the current scan has it: a fresher display name, or null for a
   * row that isn't there any more, which hides its chip. Nothing is pruned
   * from settings either way — reloading a mod may well bring the row back.
   */
  resolve?: (ref: EntryRef) => EntryRef | null
  /**
   * The chip's leading square, when the tool has one worth showing: a colour
   * swatch, a coat of arms, a faith icon.
   */
  visual?: (ref: EntryRef) => React.ReactNode
}

/**
 * The band of chips above an editor's list: starred rows, recently visited
 * ones, and whatever still carries unsaved edits. Each chip is a
 * ReferenceBadge, so a remembered row reads exactly like a reference to it
 * anywhere else in the app — name over id, and clicking it navigates.
 */
export default function EntryHistoryBar({
  history,
  active = null,
  onOpen,
  resolve,
  visual
}: Props): React.JSX.Element | null {
  const { selectedMod } = useApp()
  const [showAllRecents, setShowAllRecents] = useState(false)

  // Another mod's lists are a different length; start them collapsed again.
  useEffect(() => setShowAllRecents(false), [selectedMod?.file])

  const shown = (list: EntryRef[]): EntryRef[] =>
    resolve === undefined
      ? list
      : list.map(resolve).filter((r): r is EntryRef => r !== null)

  const favorites = shown(history.favorites)
  const recents = shown(history.recents)
  const drafts = shown(Object.values(history.drafts).map((d) => d.ref))
  const draftKeys = new Set(Object.keys(history.drafts))

  if (favorites.length === 0 && recents.length === 0 && drafts.length === 0) return null

  const chip = (
    ref: EntryRef,
    remove?: { title: string; run: () => void }
  ): React.JSX.Element => (
    <ReferenceBadge
      key={entryKey(ref)}
      entry={{ id: ref.id, name: ref.name }}
      leading={visual?.(ref)}
      marker={
        draftKeys.has(entryKey(ref)) ? (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
        ) : undefined
      }
      className={cn(
        'max-w-56',
        active !== null && sameEntry(ref, active) && 'ring-1 ring-primary/50'
      )}
      onNavigate={() => onOpen(ref)}
      onRemove={remove?.run}
      removeTitle={remove?.title}
    />
  )

  const row = (label: string, chips: React.ReactNode): React.JSX.Element => (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-16 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      {chips}
    </div>
  )

  const visibleRecents = showAllRecents ? recents : recents.slice(0, RECENTS_COLLAPSED)

  return (
    <div className="space-y-1.5">
      {favorites.length > 0 &&
        row(
          'Favorites',
          favorites.map((ref) =>
            chip(ref, {
              title: 'Remove from favorites',
              run: () => history.toggleFavorite(ref)
            })
          )
        )}
      {recents.length > 0 &&
        row(
          'Recent',
          <>
            {visibleRecents.map((ref) =>
              chip(ref, { title: 'Remove from recents', run: () => history.forget(ref) })
            )}
            {recents.length > RECENTS_COLLAPSED && (
              <Button variant="ghost" size="xs" onClick={() => setShowAllRecents((v) => !v)}>
                {showAllRecents ? 'Show less' : `Show more (${recents.length - RECENTS_COLLAPSED})`}
              </Button>
            )}
          </>
        )}
      {/* No × here: a draft is discarded from its panel's Revert, deliberately */}
      {drafts.length > 0 && row('Unsaved', drafts.map((ref) => chip(ref)))}
    </div>
  )
}
