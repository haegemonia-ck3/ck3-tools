import { useState } from 'react'
import { ArrowRight, ExternalLink, X } from 'lucide-react'
import type { RefLocation } from '@shared/types'
import { openReferenceTarget } from './ReferenceInput'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface Props {
  /** The referenced id, shown as the badge text */
  label: string
  /** Optional icon data URL (undefined = still loading, null = none) */
  icon?: string | null
  /** Managed data: the button switches to the referenced item inside the app */
  onNavigate?: () => void
  /** Unmanaged data: the button opens the defining file in the text editor */
  locate?: () => Promise<RefLocation | null>
  onRemove?: () => void
}

export default function ReferenceBadge({
  label,
  icon,
  onNavigate,
  locate,
  onRemove
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)

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
    <Badge variant="secondary" className="gap-1 pr-1">
      {icon && <img className="-ml-1 size-5 object-contain" src={icon} alt="" />}
      {label}
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
