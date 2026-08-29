import { useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type { RefLocation } from '@shared/types'
import { openReferenceTarget } from './ReferenceInput'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  /** The value to display; renders `placeholder` when null. */
  value: string | null
  /**
   * Managed data: clicking the value switches to the referenced item inside
   * the app (e.g. a house list row's Parent column jumping to that dynasty).
   */
  onNavigate?: (value: string) => void
  /**
   * Unmanaged data: clicking the value locates the defining file and opens it
   * in the user's text editor. Ignored when onNavigate is provided.
   */
  locate?: (value: string) => Promise<RefLocation | null>
  /** Shown when value is null; defaults to a muted em dash. */
  placeholder?: React.ReactNode
  className?: string
}

/** Read-only counterpart to ReferenceInput: a value that links to wherever its go-to button would. */
export default function ReferenceDisplay({
  value,
  onNavigate,
  locate,
  placeholder = <em className="text-muted-foreground">—</em>,
  className
}: Props): React.JSX.Element {
  const [opening, setOpening] = useState(false)

  if (!value) return <>{placeholder}</>

  const follow = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (onNavigate) {
      onNavigate(value)
      return
    }
    if (!locate) return
    setOpening(true)
    try {
      await openReferenceTarget(() => locate(value), value)
    } finally {
      setOpening(false)
    }
  }

  if (!onNavigate && !locate) {
    return <span className={className}>{value}</span>
  }

  const Icon = onNavigate ? ArrowRight : ExternalLink

  return (
    <Button
      variant="link"
      className={cn(
        'h-auto gap-1 p-0 text-left font-normal text-link underline decoration-dotted underline-offset-4 hover:decoration-solid',
        className
      )}
      disabled={opening}
      title={onNavigate ? `Go to ${value}` : `Open ${value}'s definition in text editor`}
      onClick={follow}
    >
      {value}
      <Icon className="size-3" />
    </Button>
  )
}
