import { cn } from '@/lib/utils'

/**
 * Small display atoms shared by the Faith and Religion editors' lists and
 * panels.
 */

/** A faith's color as a round chip; hatched when the value couldn't be resolved. */
export function Swatch({
  hex,
  className
}: {
  hex: string | null
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      title={hex ?? 'no color'}
      className={cn('inline-block rounded-full border border-border/60', className)}
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 6px)'
            }
      }
    />
  )
}

/**
 * A faith icon at a fixed size. Hidden rather than dropped while the batch
 * fetch is in flight, so the fields around it don't shift once icons arrive.
 */
export function IconTile({
  url,
  size
}: {
  url: string | null | undefined
  size: number
}): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-contain" />
      ) : (
        <span className="text-[10px] text-muted-foreground">{url === null ? '—' : ''}</span>
      )}
    </span>
  )
}

/**
 * A colour as the leading square of a ReferenceBadge: a flat fill with no
 * border or rounding of its own (the badge clips it), hatched when the value
 * couldn't be resolved.
 */
export function ColorTile({ hex }: { hex: string | null }): React.JSX.Element {
  return (
    <span
      aria-hidden
      className="size-9"
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 6px)'
            }
      }
    />
  )
}
