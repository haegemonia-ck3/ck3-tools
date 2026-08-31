import { Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  on: boolean
  onToggle: () => void
  /** Park the unsaved-changes dot to the star's left (list rows carry both) */
  dot?: boolean
  className?: string
}

/**
 * The star that favorites a row of an editor's list. Muted until the row is
 * hovered — the containing row needs Tailwind's `group` — so a long list
 * doesn't read as a field of stars; lit and filled once the row is starred.
 */
export default function FavoriteToggle({
  on,
  onToggle,
  dot = false,
  className
}: Props): React.JSX.Element {
  return (
    <span className={cn('relative flex items-center', className)}>
      {dot && (
        <span
          className="absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-primary"
          title="Unsaved changes"
        />
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn(
          'text-muted-foreground opacity-40 group-hover:opacity-100 hover:text-amber-500',
          on && 'text-amber-500 opacity-100'
        )}
        title={on ? 'Remove from favorites' : 'Add to favorites'}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <Star className={cn(on && 'fill-current')} />
      </Button>
    </span>
  )
}
