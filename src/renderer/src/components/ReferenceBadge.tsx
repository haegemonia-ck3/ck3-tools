import { useState } from 'react'
import { ArrowRight, ExternalLink, X } from 'lucide-react'
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
  /** Managed data: the button switches to the referenced item inside the app */
  onNavigate?: () => void
  /** Unmanaged data: the button opens the defining file in the text editor */
  locate?: () => Promise<RefLocation | null>
  onRemove?: () => void
}

export default function ReferenceBadge({
  entry,
  icon,
  onNavigate,
  locate,
  onRemove
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)
  const label = refLabel(entry)

  const follow = async (): Promise<void> => {
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
        'relative h-9 gap-1 rounded-md py-0 pr-1 text-xs',
        // The icon is positioned rather than laid out so its intrinsic size
        // can't stretch the badge; the extra padding reserves its square.
        icon ? 'pl-11' : 'pl-2'
      )}
    >
      {icon && <img className="absolute inset-y-0 left-0 size-9 object-cover" src={icon} alt="" />}
      <ReferenceLabel entry={entry} stacked className="font-normal" />
      {(onNavigate ?? locate) && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-4 text-muted-foreground hover:text-primary"
          disabled={opening}
          title={onNavigate ? `Go to ${label}` : `Open ${label}'s definition in text editor`}
          onClick={follow}
        >
          {onNavigate ? <ArrowRight /> : <ExternalLink />}
        </Button>
      )}
      {onRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="size-4 text-muted-foreground hover:text-destructive"
          title={`Remove ${label}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </Badge>
  )
}
