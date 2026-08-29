import { useState } from 'react'
import type {
  CalendarConfig,
  CharacterDetail,
  RefKind,
  ReferenceData
} from '@shared/types'
import { STAT_LABELS } from '../statLabels'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import CoatOfArms from './CoatOfArms'
import ReferenceInput from './ReferenceInput'
import ReferenceBadge from './ReferenceBadge'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  formatCalendarDate,
  fromCalendarInput,
  toCalendarInput
} from '@/lib/ck3Date'
import type { CalendarEra } from '@/lib/ck3Date'

/** The uppercase micro-label used over every field in the character panels. */
export function FieldLabel({
  children,
  required,
  htmlFor
}: {
  children: React.ReactNode
  /** Mark the field as mandatory with an asterisk */
  required?: boolean
  htmlFor?: string
}): React.JSX.Element {
  return (
    <Label htmlFor={htmlFor} className="text-xs tracking-wide text-muted-foreground uppercase">
      {children}
      {required && <span className="-ml-0.5 text-destructive">*</span>}
    </Label>
  )
}

/** Dropdown row for the trait picker; fetches its own icon (module-level cached) */
function TraitOption({ trait, iconCtx }: { trait: string; iconCtx: IconContext }): React.JSX.Element {
  const icon = useTraitIcons(iconCtx, [trait])(trait)
  return (
    <span className="flex items-center gap-2.5">
      {icon ? (
        <img className="size-6 shrink-0 object-contain" src={icon} alt="" />
      ) : (
        <span className="inline-block size-6 shrink-0" />
      )}
      {trait}
    </span>
  )
}

/**
 * The date's other form, hung under its input on a rounded elbow:
 * "└ Raw: 3220.1.1" beneath an era-mode field, "└ Display: 780 BC" beneath a
 * raw one.
 */
function DateHint({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className="mt-1 ml-1 size-1.5 shrink-0 rounded-bl-[3px] border-b border-l border-current opacity-60"
      />
      <span className="min-w-0 truncate">
        <span className="font-medium">{label}:</span> {value}
      </span>
    </p>
  )
}

interface Props {
  draft: CharacterDetail
  set: (patch: Partial<CharacterDetail>) => void
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** The mod's offset-calendar display convention, if it declares one */
  calendar: CalendarConfig | null
  refData: ReferenceData | null
  /** Ids of every character in the mod, offered as father/mother options */
  characterIds: string[]
  /** Switch the editor to another character in the mod (father/mother jump) */
  onNavigate: (id: string) => void
  /** Open a lineage row in the Dynasty & House Editor */
  onOpenLineage: (kind: 'dynasty' | 'house', id: string) => void
  badBirth: boolean
  badDeath: boolean
  /** Mark the game-mandatory fields with an asterisk (create mode) */
  markRequired?: boolean
  /** Rendered at the top of the identity fieldset (ID display/input, file picker) */
  identitySlot?: React.ReactNode
  /** Rendered at the end of Life & lineage (the edit panel's children list) */
  childrenSlot?: React.ReactNode
}

/**
 * The editable character fields, shared between the detail (edit) panel and
 * the create panel. What differs between the two — how the identity (ID/file)
 * is presented, and the derived children list — comes in through slots.
 */
export default function CharacterForm({
  draft,
  set,
  modPath,
  gameDir,
  replacePaths,
  calendar,
  refData,
  characterIds,
  onNavigate,
  onOpenLineage,
  badBirth,
  badDeath,
  markRequired = false,
  identitySlot,
  childrenSlot
}: Props): React.JSX.Element {
  /** Show file years instead of the mod calendar's era years in the date inputs */
  const [showRawDates, setShowRawDates] = useState(false)

  const iconCtx: IconContext = { gameDir, modPath, replacePaths }
  const iconFor = useTraitIcons(iconCtx, draft.traits)

  const addTrait = (value: string): void => {
    const t = value.trim()
    if (t && !draft.traits.includes(t)) {
      set({ traits: [...draft.traits, t] })
    }
  }

  const textField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    opts: {
      invalid?: boolean
      placeholder?: string
      hint?: React.ReactNode
      required?: boolean
    } = {}
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel required={opts.required}>{label}</FieldLabel>
      <Input
        type="text"
        value={value ?? ''}
        placeholder={opts.placeholder}
        aria-invalid={opts.invalid || undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
      {opts.hint}
    </div>
  )

  /**
   * Birth/death input. With a mod calendar in era mode, the input edits the
   * era-relative year ("780.1.1" plus a BC/AD select) while the draft keeps
   * storing the raw file date — both directions are pure conversions, so the
   * dirty/persist/validation machinery works on raw values as before.
   */
  const dateField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    opts: { invalid?: boolean; placeholder?: string; required?: boolean }
  ): React.JSX.Element => {
    if (!calendar || showRawDates) {
      const display = formatCalendarDate(value, calendar)
      return textField(label, value, onChange, {
        ...opts,
        hint: display !== null && <DateHint label="Display" value={display} />
      })
    }
    const converted = value === null ? null : toCalendarInput(value, calendar)
    const era: CalendarEra = converted?.era ?? 'before'
    const change = (text: string, nextEra: CalendarEra): void => {
      if (text === '') {
        onChange(null)
        return
      }
      // A misread edit (no year, or one outside the raw 0–9999 range) is
      // dropped rather than stored as something it doesn't mean.
      const raw = fromCalendarInput(text, nextEra, calendar)
      if (raw !== null) onChange(raw)
    }
    return (
      <div className="space-y-1.5">
        <FieldLabel required={opts.required}>{label}</FieldLabel>
        <div className="flex gap-1.5">
          <Input
            type="text"
            className="min-w-0 flex-1"
            value={converted?.text ?? value ?? ''}
            placeholder={opts.placeholder}
            aria-invalid={opts.invalid || undefined}
            onChange={(e) => change(e.target.value, era)}
          />
          <Select
            value={era}
            onValueChange={(v) => converted && change(converted.text, v as CalendarEra)}
          >
            <SelectTrigger aria-label="Era" className="shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="before">{calendar.beforeLabel}</SelectItem>
              <SelectItem value="after">{calendar.afterLabel}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {value !== null && <DateHint label="Raw" value={value} />}
      </div>
    )
  }

  const refField = (
    label: string,
    kind: RefKind,
    value: string | null,
    onChange: (v: string | null) => void,
    options: string[],
    required?: boolean
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel required={required}>{label}</FieldLabel>
      <ReferenceInput
        value={value}
        onChange={onChange}
        options={options}
        placeholder="none"
        locate={(v) => window.ck3tools.locateRef(gameDir, modPath, replacePaths, kind, v)}
      />
    </div>
  )

  /**
   * Dynasty and house are managed data, so they open in the Dynasty & House
   * Editor rather than a text editor. They are separate keys in the file:
   * a house implies its parent dynasty, so a character usually sets one or
   * the other, but nothing stops a file from carrying both.
   */
  const lineageField = (
    label: string,
    kind: 'dynasty' | 'house',
    value: string | null,
    onChange: (v: string | null) => void,
    options: string[]
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <ReferenceInput
        value={value}
        onChange={onChange}
        options={options}
        placeholder="none"
        onNavigate={(v) => onOpenLineage(kind, v)}
        followTitle="Open in Dynasty & House Editor"
      />
    </div>
  )

  /** Parent fields reference other characters in the mod, so they jump in-app. */
  const parentField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <ReferenceInput
        value={value}
        onChange={onChange}
        options={characterIds}
        placeholder="none"
        onNavigate={onNavigate}
      />
    </div>
  )

  return (
    <>
      <FieldSet className="gap-3.5">
        {identitySlot}
        {textField('Name', draft.name, (v) => set({ name: v }), { required: markRequired })}
        <div className="flex items-center gap-2">
          <Checkbox
            id="character-female"
            checked={/^yes$/i.test(draft.female ?? '')}
            onCheckedChange={(checked) => set({ female: checked === true ? 'yes' : null })}
          />
          <FieldLabel htmlFor="character-female">Female</FieldLabel>
        </div>
      </FieldSet>

      <FieldSet className="gap-3.5">
        <FieldLegend variant="label" className="mb-0 flex w-full items-center justify-between">
          Life &amp; lineage
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
        </FieldLegend>
        <div className="flex gap-2.5 *:flex-1">
          {dateField('Birth', draft.birth, (v) => set({ birth: v }), {
            invalid: badBirth,
            placeholder: 'Y.M.D',
            required: markRequired
          })}
          {dateField('Death', draft.death, (v) => set({ death: v }), {
            invalid: badDeath,
            placeholder: 'alive'
          })}
        </div>
        <div className="flex items-start gap-4">
          {/* The house's CoA when it has one, else the dynasty's */}
          <CoatOfArms ids={[draft.house, draft.dynasty]} size={112} className="shrink-0" />
          <div className="min-w-0 flex-1 space-y-3.5">
            {lineageField(
              'Dynasty',
              'dynasty',
              draft.dynasty,
              (v) => set({ dynasty: v }),
              refData?.dynasties ?? []
            )}
            {lineageField(
              'House',
              'house',
              draft.house,
              (v) => set({ house: v }),
              refData?.houses ?? []
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3.5 @sm:flex-row @sm:gap-2.5 @sm:*:flex-1">
          {parentField('Father', draft.father, (v) => set({ father: v }))}
          {parentField('Mother', draft.mother, (v) => set({ mother: v }))}
        </div>
        {childrenSlot}
      </FieldSet>

      <FieldSet className="gap-3.5">
        <FieldLegend variant="label" className="mb-0">Culture &amp; traits</FieldLegend>
        {refField(
          'Culture',
          'culture',
          draft.culture,
          (v) => set({ culture: v }),
          refData?.cultures ?? [],
          markRequired
        )}
        {refField(
          'Faith',
          'faith',
          draft.faith,
          (v) => set({ faith: v }),
          refData?.faiths ?? [],
          markRequired
        )}
        <div className="space-y-1.5">
          <FieldLabel>Traits</FieldLabel>
          <div className="flex min-h-6 flex-wrap gap-1.5">
            {draft.traits.map((t) => (
              <ReferenceBadge
                key={t}
                label={t}
                icon={iconFor(t)}
                locate={() => window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'trait', t)}
                onRemove={() => set({ traits: draft.traits.filter((x) => x !== t) })}
              />
            ))}
            {draft.traits.length === 0 && <span className="text-sm text-muted-foreground">none</span>}
          </div>
          <ReferenceInput
            options={(refData?.traits ?? []).filter((t) => !draft.traits.includes(t))}
            placeholder="Add trait…"
            onAdd={addTrait}
            renderItem={(t) => <TraitOption trait={t} iconCtx={iconCtx} />}
            limit={40}
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Stats</FieldLabel>
          <div className="grid grid-cols-3 gap-2">
            {STAT_LABELS.map(([key, label]) => (
              <label key={key} className="space-y-1 text-[11px] text-muted-foreground">
                <span>{label}</span>
                <Input
                  type="number"
                  value={draft.stats[key] ?? ''}
                  placeholder="—"
                  onChange={(e) =>
                    set({
                      stats: {
                        ...draft.stats,
                        [key]: e.target.value === '' ? null : Number(e.target.value)
                      }
                    })
                  }
                />
              </label>
            ))}
          </div>
        </div>
      </FieldSet>
    </>
  )
}
