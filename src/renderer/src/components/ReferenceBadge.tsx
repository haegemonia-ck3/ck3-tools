import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import type { RefEntry, RefLocation } from '@shared/types'
import { openReferenceTarget } from './ReferenceInput'
import ReferenceLabel, { refLabel } from './ReferenceLabel'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** The referenced entry, shown as "Name (id)" when it has a name */
  entry: RefEntry
  /** Optional icon data URL (undefined = still loading, null = none) */
  icon?: string | null
  /**
   * Anything else that fills the badge's leading square, in place of an icon:
   * a coat of arms, a swatch. The badge positions and clips it, so it should
   * render at `size-9` without a border or rounding of its own.
   */
  leading?: React.ReactNode
  /**
   * A small mark shown ahead of the label — an unsaved-changes dot, a star.
   * Decorative: it sits under the link overlay, so it never eats the click.
   */
  marker?: React.ReactNode
  /** Managed data: the button switches to the referenced item inside the app */
  onNavigate?: () => void
  /** Unmanaged data: the button opens the defining file in the text editor */
  locate?: () => Promise<RefLocation | null>
  onRemove?: () => void
  /** What the remove button says it removes; defaults to the entry itself */
  removeTitle?: string
  className?: string
}

export default function ReferenceBadge({
  entry,
  icon,
  leading,
  marker,
  onNavigate,
  locate,
  onRemove,
  removeTitle,
  className
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)
  const label = refLabel(entry)
  const visual = leading ?? (icon ? <img className="size-9 object-cover" src={icon} alt="" /> : null)

  const follow = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (onNavigate) {
      onNavigate()
      return
    }
    if (!locate) return
    setOpening(true)
    try {
      await openReferenceTarget(locate, label)
    } finally {
      setOpening(false)
    }
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        'relative h-9 gap-1 rounded-md py-0 text-xs',
        // The visual is positioned rather than laid out so its intrinsic size
        // can't stretch the badge; the extra padding reserves its square.
        visual ? 'pl-11' : 'pl-2',
        onRemove ? 'pr-1' : 'pr-2',
        className
      )}
    >
      {visual && <span className="absolute inset-y-0 left-0 size-9">{visual}</span>}
      {marker}
      {(onNavigate ?? locate) ? (
        <Button
          variant="link"
          // Underlined like a ReferenceDisplay, and stretched over the whole
          // badge by the ::after overlay, so the badge itself is the link.
          className="h-auto min-w-0 gap-1 p-0 text-left font-normal text-inherit after:absolute after:inset-0 hover:no-underline"
          disabled={opening}
          title={onNavigate ? `Go to ${label}` : `Open ${label}'s definition in text editor`}
          onClick={follow}
        >
          <ReferenceLabel
            entry={entry}
            stacked
            nameClassName="underline decoration-link decoration-dotted underline-offset-2 group-hover/badge:decoration-solid"
          />
          {!onNavigate && <ExternalLink className="size-3 shrink-0" />}
        </Button>
      ) : (
        <ReferenceLabel entry={entry} stacked className="font-normal" />
      )}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          // Lifted back above the link's overlay so the X stays clickable.
          className="relative size-4 text-muted-foreground hover:text-destructive"
          title={removeTitle ?? `Remove ${label}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </Badge>
  )
}
