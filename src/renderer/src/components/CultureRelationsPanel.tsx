import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronRight, CornerDownRight, CornerLeftUp, Plus } from 'lucide-react'
import type { CalendarConfig, CultureCharacter, CultureData, CultureDef } from '@shared/types'
import FormSection, { SectionLegend } from './FormSection'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible'
import { FieldSet } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { formatCalendarYear } from '@/lib/ck3Date'
import {
  childrenOf,
  cultureLabel,
  findCulture,
  membersOf,
  normId,
  sortMembers,
  swatchForeground
} from '@/lib/cultureView'

interface Props {
  id: string
  data: CultureData
  calendar: CalendarConfig | null
  /** Show file years instead of the mod calendar's era years */
  showRawDates: boolean
  /** Switch the editor to another culture */
  onOpenCulture: (id: string) => void
  /** Open the create panel seeded from this culture */
  onDeriveCulture: () => void
  /** Jump to the character editor */
  onOpenCharacter: (character: CultureCharacter) => void
  /** Open the character editor's create panel with this culture prefilled */
  onAddCharacter: () => void
}

const YEAR_RE = /^(\d{1,4})(?:\.|$)/

function lifespan(c: CultureCharacter, calendar: CalendarConfig | null): string {
  const year = (d: string | null): number | null => {
    const m = d === null ? null : YEAR_RE.exec(d.trim())
    return m ? Number(m[1]) : null
  }
  const b = year(c.birth)
  const d = year(c.death)
  const show = (y: number): string => (calendar ? formatCalendarYear(y, calendar) : String(y))
  if (b === null && d === null) return ''
  return `${b === null ? '?' : show(b)} – ${d === null ? '' : show(d)}`
}

/** A culture as a clickable row: swatch, name, and its own heritage for context. */
function CultureRow({
  culture,
  icon,
  onOpen
}: {
  culture: CultureDef
  icon: React.ReactNode
  onOpen: () => void
}): React.JSX.Element {
  const swatch = culture.color?.hex ?? null
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
      title={`${culture.id} — ${culture.file}`}
      onClick={onOpen}
    >
      <span aria-hidden className="shrink-0 text-muted-foreground">
        {icon}
      </span>
      {swatch !== null && (
        <span
          aria-hidden
          className="size-3 shrink-0 rounded-sm border"
          style={{ backgroundColor: swatch, borderColor: swatchForeground(swatch) + '40' }}
        />
      )}
      <span className="min-w-0 flex-1 truncate">{cultureLabel(culture)}</span>
      {!culture.inMod && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          game
        </Badge>
      )}
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
    </button>
  )
}

/**
 * The context beside a culture's definition form: where it sits in the culture
 * tree, and which characters in the mod's history carry it.
 */
export default function CultureRelationsPanel({
  id,
  data,
  calendar,
  showRawDates,
  onOpenCulture,
  onDeriveCulture,
  onOpenCharacter,
  onAddCharacter
}: Props): React.JSX.Element {
  const def = findCulture(data, id)
  const [membersOpen, setMembersOpen] = useState(true)
  const body = useRef<HTMLDivElement>(null)

  // A different culture starts at the top, not wherever the last one's
  // character list had been scrolled to.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 })
  }, [id])

  const members = sortMembers(membersOf(data, id))
  const children = childrenOf(data, id)
  // A parent that no file defines still shows, so a typo in `parents` is
  // visible here rather than silently missing
  const parents = (def?.parents ?? []).map((p) => ({ raw: p, def: findCulture(data, p) }))

  const dateCalendar = showRawDates ? null : calendar

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h2 className="text-lg font-semibold text-foreground">Related</h2>
      </div>

      <div ref={body} className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        <FormSection className="gap-2" title={<>Parents · {parents.length}</>}>
          {parents.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">
              None — this culture descends from no other.
            </p>
          ) : (
            parents.map(({ raw, def: parent }) =>
              parent ? (
                <CultureRow
                  key={normId(raw)}
                  culture={parent}
                  icon={<CornerLeftUp className="size-3" />}
                  onOpen={() => onOpenCulture(parent.id)}
                />
              ) : (
                <div
                  key={normId(raw)}
                  className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground"
                >
                  <CornerLeftUp className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono">{raw}</span>
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    undefined
                  </Badge>
                </div>
              )
            )
          )}
        </FormSection>

        <FormSection
          className="gap-2"
          legendClassName="flex-nowrap gap-2"
          title={<span>Descendants · {children.length}</span>}
          action={
            <Button
              variant="outline"
              size="xs"
              title="Create a culture descended from this one"
              onClick={onDeriveCulture}
            >
              <Plus />
              Derive
            </Button>
          }
        >
          {children.length === 0 ? (
            <p className="px-2 text-sm text-muted-foreground">
              No culture names this one as a parent.
            </p>
          ) : (
            children.map((c) => (
              <CultureRow
                key={normId(c.id)}
                culture={c}
                icon={<CornerDownRight className="size-3" />}
                onOpen={() => onOpenCulture(c.id)}
              />
            ))
          )}
        </FormSection>

        {/* The Collapsible has to wrap legend and body alike, so this section
            composes the legend itself rather than using FormSection */}
        <FieldSet className="gap-2">
          <Collapsible open={membersOpen} onOpenChange={setMembersOpen}>
            <SectionLegend className="flex w-full items-center justify-between gap-2">
              <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md text-left hover:text-foreground">
                <ChevronRight
                  className={cn('size-3 shrink-0 transition-transform', membersOpen && 'rotate-90')}
                />
                Characters · {members.length}
              </CollapsibleTrigger>
              <Button
                variant="outline"
                size="xs"
                title="Create a new character with this culture"
                onClick={onAddCharacter}
              >
                <Plus />
                Add
              </Button>
            </SectionLegend>
            <CollapsibleContent>
              {members.length === 0 ? (
                <p className="px-2 text-sm text-muted-foreground">
                  No character in the mod&apos;s history carries this culture.
                </p>
              ) : (
                members.map((c) => (
                  <button
                    key={`${c.file}:${c.id}`}
                    type="button"
                    className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                    title={`${c.id} — ${c.file}`}
                    onClick={() => onOpenCharacter(c)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {c.name ?? <span className="font-mono text-muted-foreground">{c.id}</span>}
                    </span>
                    <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">
                      {lifespan(c, dateCalendar)}
                    </span>
                    <ArrowRight className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                  </button>
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
        </FieldSet>
      </div>
    </Card>
  )
}
