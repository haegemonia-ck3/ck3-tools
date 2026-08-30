import { cn } from '@/lib/utils'

/**
 * A note hung under a field on a rounded elbow — what a raw value resolves to
 * for display, what a date reads as in the mod's calendar, or a plain remark
 * about the field above. The label is optional: a note that reads as a
 * sentence doesn't want one.
 *
 * `truncate` keeps a long single-line value on one line; leave it off for
 * anything that should be allowed to wrap.
 */
export default function Hint({
  label,
  value,
  truncate
}: {
  label?: string
  value: React.ReactNode
  truncate?: boolean
}): React.JSX.Element {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="mt-1 ml-1 size-1.5 shrink-0 rounded-bl-[3px] border-b border-l border-current opacity-60"
      />
      <span className={cn('min-w-0', truncate && 'truncate')}>
        {label !== undefined && <span className="font-medium">{label}: </span>}
        {value}
      </span>
    </p>
  )
}
