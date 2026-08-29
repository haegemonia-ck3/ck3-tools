import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import DebouncedInput from './DebouncedInput'
import { cn } from '@/lib/utils'
import {
  dateSortKey,
  emptyDateRange,
  fromCalendarInput,
  isEmptyDateRange,
  toCalendarInput
} from '@/lib/ck3Date'
import type { CalendarEra, DateRangeFilter, DateRangeMode } from '@/lib/ck3Date'
import type { CalendarConfig } from '@shared/types'

type Bound = 'from' | 'to'

/** Which bound each mode edits — `from` is the lower one, `to` the upper. */
const BOUNDS: Record<DateRangeMode, Bound[]> = {
  before: ['to'],
  after: ['from'],
  between: ['from', 'to']
}

const MODE_LABELS: Record<DateRangeMode, string> = {
  before: 'Before',
  after: 'After',
  between: 'Between'
}

const BOUND_LABELS: Record<DateRangeMode, Record<Bound, string>> = {
  before: { from: 'From', to: 'Before' },
  after: { from: 'After', to: 'To' },
  between: { from: 'From', to: 'To' }
}

interface Props {
  value: DateRangeFilter | undefined
  /** Called with undefined once the range stops constraining anything. */
  onChange: (value: DateRangeFilter | undefined) => void
  /** Enables the era/file display toggle; null when the mod defines no calendar. */
  calendar: CalendarConfig | null
  className?: string
}

/**
 * Before / After / Between filter over a CK3 date column. Bounds are stored as
 * raw file dates whatever the display mode, so the mod calendar only ever
 * changes what's on screen — the same rule the character editor's date fields
 * follow.
 */
export default function DateRangeFilterField({
  value,
  onChange,
  calendar,
  className
}: Props): React.JSX.Element {
  // The mode and a half-typed range have to outlive an empty filter, which the
  // table drops entirely — so the draft lives here and only reaches the table
  // once it constrains something.
  const [filter, setFilter] = useState<DateRangeFilter>(value ?? emptyDateRange())
  const [showRawDates, setShowRawDates] = useState(false)
  // Which era a bound is typed in while it's empty — an entered date carries
  // its own era, but a blank field still needs the select to mean something.
  const [eras, setEras] = useState<Record<Bound, CalendarEra>>({ from: 'before', to: 'before' })

  // Adopt a reset pushed from outside (the page's Clear button, a mod switch),
  // keeping the chosen mode.
  useEffect(() => {
    if (value === undefined) {
      setFilter((f) => (isEmptyDateRange(f) ? f : emptyDateRange(f.mode)))
    }
  }, [value])

  const eraMode = calendar !== null && !showRawDates
  const empty = isEmptyDateRange(filter)

  const update = (next: DateRangeFilter): void => {
    setFilter(next)
    onChange(isEmptyDateRange(next) ? undefined : next)
  }

  /** Raw date as the popover currently displays dates: "3220.5.3" → "780.5.3 BC". */
  const show = (raw: string): string => {
    const converted = eraMode && calendar ? toCalendarInput(raw, calendar) : null
    if (!converted || !calendar) return raw
    return `${converted.text} ${converted.era === 'before' ? calendar.beforeLabel : calendar.afterLabel}`
  }

  const summary = (): string => {
    if (empty) return 'Any'
    // Only the bounds this mode uses — a switch away leaves the other one in
    // state so switching back restores it.
    const from = filter.from.trim()
    const to = filter.to.trim()
    if (filter.mode === 'before') return `Before ${show(to)}`
    if (filter.mode === 'after') return `After ${show(from)}`
    if (from !== '' && to !== '') return `${show(from)} – ${show(to)}`
    // A one-sided "between" reads as the before/after it actually is
    return from === '' ? `Before ${show(to)}` : `After ${show(from)}`
  }

  const boundField = (key: Bound): React.JSX.Element => {
    const raw = filter[key]
    const label = (
      <Label className="text-[11px] tracking-wide text-muted-foreground uppercase">
        {BOUND_LABELS[filter.mode][key]}
      </Label>
    )

    if (!eraMode || !calendar) {
      return (
        <div key={key} className="space-y-1">
          {label}
          <DebouncedInput
            type="text"
            placeholder="Y.M.D"
            value={raw}
            onChange={(text) => update({ ...filter, [key]: text })}
          />
        </div>
      )
    }

    const converted = raw === '' ? null : toCalendarInput(raw, calendar)
    const era = converted?.era ?? eras[key]
    const change = (text: string, nextEra: CalendarEra): void => {
      if (text.trim() === '') {
        update({ ...filter, [key]: '' })
        return
      }
      // A misread bound (no year, or one outside the raw 0–9999 range) is
      // dropped rather than filtering on something it doesn't mean.
      const next = fromCalendarInput(text, nextEra, calendar)
      if (next !== null) update({ ...filter, [key]: next })
    }

    return (
      <div key={key} className="space-y-1">
        {label}
        <div className="flex gap-1">
          <DebouncedInput
            type="text"
            className="min-w-0 flex-1"
            placeholder="Y.M.D"
            value={converted?.text ?? ''}
            onChange={(text) => change(text, era)}
          />
          <Select
            value={era}
            onValueChange={(v) => {
              setEras((prev) => ({ ...prev, [key]: v as CalendarEra }))
              if (converted) change(converted.text, v as CalendarEra)
            }}
          >
            <SelectTrigger aria-label={`${BOUND_LABELS[filter.mode][key]} era`} className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="before">{calendar.beforeLabel}</SelectItem>
              <SelectItem value="after">{calendar.afterLabel}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {raw !== '' && <p className="truncate text-[11px] text-muted-foreground">Raw: {raw}</p>}
      </div>
    )
  }

  const lower = dateSortKey(filter.from, 'start')
  const upper = dateSortKey(filter.to, 'end')
  const backwards = filter.mode === 'between' && lower !== null && upper !== null && lower > upper

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between bg-input/20 font-normal dark:bg-input/30',
            empty && 'text-muted-foreground',
            className
          )}
        >
          <span className="truncate">{summary()}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={filter.mode}
            onValueChange={(v) => v && update({ ...filter, mode: v as DateRangeMode })}
            aria-label="Date range mode"
          >
            {(Object.keys(MODE_LABELS) as DateRangeMode[]).map((mode) => (
              <ToggleGroupItem key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {calendar && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={showRawDates ? 'raw' : 'era'}
              onValueChange={(v) => v && setShowRawDates(v === 'raw')}
              aria-label="Date display mode"
            >
              <ToggleGroupItem value="era">
                {calendar.beforeLabel}/{calendar.afterLabel}
              </ToggleGroupItem>
              <ToggleGroupItem value="raw">File</ToggleGroupItem>
            </ToggleGroup>
          )}
        </div>

        {/* Stacked rather than side by side: a bound needs room for a date and
            its era select, and "between" would squeeze both to a few characters. */}
        <div className="flex flex-col gap-2.5">{BOUNDS[filter.mode].map(boundField)}</div>

        {backwards && (
          <p className="text-[11px] text-destructive">
            The start is later than the end, so nothing can match.
          </p>
        )}

        {!empty && (
          <Button variant="ghost" size="sm" className="self-start" onClick={() => update(emptyDateRange(filter.mode))}>
            Clear
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
