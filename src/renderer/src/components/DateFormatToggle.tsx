import type { CalendarConfig } from '@shared/types'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/**
 * Header control switching a panel's dates between the mod calendar's era
 * display ("BC/AD") and the raw file values. Renders nothing when the mod
 * declares no calendar — raw is all there is.
 */
export default function DateFormatToggle({
  calendar,
  showRaw,
  onChange
}: {
  calendar: CalendarConfig | null
  showRaw: boolean
  onChange: (showRaw: boolean) => void
}): React.JSX.Element | null {
  if (!calendar) return null
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs tracking-wide text-muted-foreground uppercase">Date format</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={showRaw ? 'raw' : 'era'}
        onValueChange={(v) => v && onChange(v === 'raw')}
        aria-label="Date format"
      >
        <ToggleGroupItem value="era">
          {calendar.beforeLabel}/{calendar.afterLabel}
        </ToggleGroupItem>
        <ToggleGroupItem value="raw">Raw</ToggleGroupItem>
      </ToggleGroup>
    </div>
  )
}
