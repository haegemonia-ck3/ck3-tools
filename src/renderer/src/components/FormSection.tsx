import { FieldLegend, FieldSet } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/**
 * A titled group of fields — "Culture & traits", "Holy sites · 3" — as every
 * editor panel draws them: a `fieldset` whose `legend` names it, optionally
 * with controls parked at the right end of that line.
 *
 * The title is a heading, so it wears the heading font — which is the mod's
 * TitleFont whenever the app is dressed in one (see useModFonts.ts).
 */

/**
 * The legend on its own, for the few sections that can't use `FormSection`
 * because something (a `Collapsible`) has to wrap the legend and the body
 * together inside the `fieldset`.
 */
export function SectionLegend({
  className,
  ...props
}: React.ComponentProps<typeof FieldLegend>): React.JSX.Element {
  return (
    <FieldLegend
      variant="label"
      data-slot="section-legend"
      className={cn('mb-2 font-heading', className)}
      {...props}
    />
  )
}

export default function FormSection({
  title,
  action,
  className,
  legendClassName,
  children,
  ...props
  // `title` here names the section, so it shadows the HTML tooltip attribute
}: Omit<React.ComponentProps<'fieldset'>, 'title'> & {
  title: React.ReactNode
  /** Controls shown at the right end of the title line */
  action?: React.ReactNode
  legendClassName?: string
}): React.JSX.Element {
  return (
    <FieldSet className={cn('gap-3.5', className)} {...props}>
      <SectionLegend
        className={cn(
          action !== undefined && 'flex w-full flex-wrap items-center justify-between gap-1.5',
          legendClassName
        )}
      >
        {title}
        {action}
      </SectionLegend>
      {children}
    </FieldSet>
  )
}
