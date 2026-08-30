import { Fragment, useEffect, useRef, useState } from 'react'
import { ExternalLink, Plus, X } from 'lucide-react'
import type {
  CalendarConfig,
  CultureData,
  CultureEthnicity,
  CulturePillarType,
  RefEntry,
  RefKind
} from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import DateFormatToggle from './DateFormatToggle'
import ReferenceBadge from './ReferenceBadge'
import ReferenceInput, { openReferenceTarget } from './ReferenceInput'
import ReferenceLabel, { findRef } from './ReferenceLabel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'
import { formatCalendarDate, fromCalendarInput, isValidCK3Date, toCalendarInput } from '@/lib/ck3Date'
import type { CalendarEra } from '@/lib/ck3Date'
import { findCulture, normId, swatchForeground } from '@/lib/cultureView'

/** The editable shape of a culture, mirroring CulturePatch. */
interface CultureDraft {
  color: string | null
  ethos: string | null
  heritage: string | null
  language: string | null
  martialCustom: string | null
  headDetermination: string | null
  traditions: string[]
  nameList: string | null
  parents: string[]
  created: string | null
  coaGfx: string[]
  buildingGfx: string[]
  clothingGfx: string[]
  unitGfx: string[]
  houseCoaFrame: string | null
  ethnicities: CultureEthnicity[]
}

/** The pillar fields, in the order a culture file writes them. */
const PILLARS: { key: keyof CultureDraft & string; type: CulturePillarType; label: string }[] = [
  { key: 'ethos', type: 'ethos', label: 'Ethos' },
  { key: 'heritage', type: 'heritage', label: 'Heritage' },
  { key: 'language', type: 'language', label: 'Language' },
  { key: 'martialCustom', type: 'martial_custom', label: 'Martial custom' },
  { key: 'headDetermination', type: 'head_determination', label: 'Head determination' }
]

/** The four graphics-bundle lists, and which pool of ids each offers. */
const GFX: { key: keyof CultureDraft & string; pool: 'coa' | 'building' | 'clothing' | 'unit'; label: string }[] =
  [
    { key: 'coaGfx', pool: 'coa', label: 'Coat of arms' },
    { key: 'buildingGfx', pool: 'building', label: 'Buildings' },
    { key: 'clothingGfx', pool: 'clothing', label: 'Clothing' },
    { key: 'unitGfx', pool: 'unit', label: 'Units' }
  ]

interface Props {
  id: string
  data: CultureData
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  calendar: CalendarConfig | null
  /** Show file years instead of the mod calendar's era years; shared with the related panel */
  showRawDates: boolean
  onShowRawDatesChange: (showRaw: boolean) => void
  /** Switch the editor to another culture row */
  onOpenCulture: (id: string) => void
  /** Called after a successful save so the page can reload definitions */
  onSaved: () => void
  /** Leave the row and go back to the list (the header arrow, and Esc) */
  onClose: () => void
}

/** The uppercase micro-label used over every field in the editor panels. */
function FieldLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <Label className="text-xs tracking-wide text-muted-foreground uppercase">{children}</Label>
}

/**
 * The date's other form, hung under its input on a rounded elbow — the same
 * affordance the character editor uses for era-converted dates.
 */
function Hint({ label, value }: { label: string; value: string }): React.JSX.Element {
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

export default function CultureDetailPanel({
  id,
  data,
  modPath,
  gameDir,
  replacePaths,
  calendar,
  showRawDates,
  onShowRawDatesChange,
  onOpenCulture,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const def = findCulture(data, id)

  const original: CultureDraft | null = def
    ? {
        color: def.color?.hex ?? null,
        ethos: def.ethos,
        heritage: def.heritage,
        language: def.language,
        martialCustom: def.martialCustom,
        headDetermination: def.headDetermination,
        traditions: def.traditions,
        nameList: def.nameList,
        parents: def.parents,
        created: def.created,
        coaGfx: def.coaGfx,
        buildingGfx: def.buildingGfx,
        clothingGfx: def.clothingGfx,
        unitGfx: def.unitGfx,
        houseCoaFrame: def.houseCoaFrame,
        ethnicities: def.ethnicities
      }
    : null

  const [draft, setDraft] = useState<CultureDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(original ? { ...original } : null)
    setError(null)
    // Re-derived from data on purpose: a reload after save re-seeds the draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data])

  // The "Saved ✓" flash must survive the post-save data reload (which re-runs
  // the reseed above), so it resets only when a different row is opened — and
  // a different culture starts at the top of the form rather than wherever the
  // last one was scrolled to.
  useEffect(() => {
    setSavedFlash(false)
    body.current?.scrollTo({ top: 0 })
  }, [id])

  const editable = def !== null && def.inMod
  const dirty =
    draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)

  const set = (patch: Partial<CultureDraft>): void => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

  const save = async (): Promise<void> => {
    if (!def || !draft) return
    setSaving(true)
    setError(null)
    try {
      const result = await window.ck3tools.saveCulture(
        gameDir,
        modPath,
        replacePaths,
        def.file,
        def.id,
        draft
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSavedFlash(true)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  useFormHotkeys({ onSave: save, canSave: editable && dirty && !saving, onClose })

  const locate = (kind: RefKind) => (v: string) =>
    window.ck3tools.locateRef(gameDir, modPath, replacePaths, kind, v)

  const cultureOptions: RefEntry[] = data.cultures.map((c) => ({
    id: c.id,
    name: c.localizedName
  }))

  /** A single-value reference field backed by a picker. */
  const refField = (
    label: string,
    kind: RefKind,
    value: string | null,
    onChange: (v: string | null) => void,
    options: readonly RefEntry[]
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel>{label}</FieldLabel>
      <ReferenceInput
        value={value}
        onChange={onChange}
        options={options}
        placeholder="none"
        locate={locate(kind)}
        disabled={!editable}
      />
    </div>
  )

  /**
   * A repeating list of references: badges for what's set, a picker to add.
   * `navigate` points the badge back into this editor (parent cultures);
   * `kind` points it at a definition file. With neither — graphics bundles,
   * which are declared in no folder we can enumerate — the badge is inert.
   */
  const listField = (
    label: string,
    values: string[],
    onChange: (v: string[]) => void,
    options: readonly RefEntry[],
    opts: {
      kind?: RefKind
      navigate?: boolean
      renderItem?: (e: RefEntry) => React.ReactNode
    } = {}
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel>
        {label}
        {values.length > 0 && <span className="ml-1 normal-case">· {values.length}</span>}
      </FieldLabel>
      <div className="flex min-h-6 flex-wrap gap-1.5">
        {values.map((v) => (
          <ReferenceBadge
            key={v}
            entry={findRef(options, v)}
            onNavigate={opts.navigate ? () => onOpenCulture(v) : undefined}
            locate={
              opts.navigate || opts.kind === undefined
                ? undefined
                : () => locate(opts.kind!)(v)
            }
            onRemove={editable ? () => onChange(values.filter((x) => x !== v)) : undefined}
          />
        ))}
        {values.length === 0 && <span className="text-sm text-muted-foreground">none</span>}
      </div>
      {editable && (
        <ReferenceInput
          options={options.filter((o) => !values.some((v) => normId(v) === normId(o.id)))}
          placeholder={`Add ${label.toLowerCase()}…`}
          onAdd={(v) => onChange([...values, v])}
          renderItem={opts.renderItem}
          limit={40}
        />
      )}
    </div>
  )

  /** Traditions carry a category, worth showing in the dropdown to tell them apart. */
  const traditionItem = (t: RefEntry): React.ReactNode => {
    const category = data.traditions.find((x) => x.id === t.id)?.category
    return (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <ReferenceLabel entry={t} />
        {category && (
          <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
            {category}
          </Badge>
        )}
      </span>
    )
  }

  /**
   * The `created =` date — the year the culture comes into existence, absent on
   * cultures that exist from the start. Edited the same way the character
   * editor edits dates: raw file value, or the mod calendar's era-relative form
   * with an era picker beside it.
   */
  const PLACEHOLDER = 'never — exists from the start'

  const createdField = (): React.JSX.Element => {
    const value = draft?.created ?? null
    const invalid = value !== null && value !== '' && !isValidCK3Date(value)

    if (!calendar || showRawDates) {
      const display = formatCalendarDate(value, calendar)
      return (
        <div className="space-y-1.5">
          <FieldLabel>Created</FieldLabel>
          <Input
            type="text"
            value={value ?? ''}
            placeholder={PLACEHOLDER}
            disabled={!editable}
            aria-invalid={invalid || undefined}
            onChange={(e) => set({ created: e.target.value === '' ? null : e.target.value })}
          />
          {display !== null && <Hint label="Display" value={display} />}
        </div>
      )
    }

    const converted = value === null ? null : toCalendarInput(value, calendar)
    const era: CalendarEra = converted?.era ?? 'before'
    const change = (text: string, nextEra: CalendarEra): void => {
      if (text === '') {
        set({ created: null })
        return
      }
      // A misread edit (no year, or one outside the raw 0–9999 range) is
      // dropped rather than stored as something it doesn't mean.
      const raw = fromCalendarInput(text, nextEra, calendar)
      if (raw !== null) set({ created: raw })
    }
    return (
      <div className="space-y-1.5">
        <FieldLabel>Created</FieldLabel>
        <div className="flex gap-1.5">
          <Input
            type="text"
            className="min-w-0 flex-1"
            value={converted?.text ?? value ?? ''}
            placeholder={PLACEHOLDER}
            disabled={!editable}
            aria-invalid={invalid || undefined}
            onChange={(e) => change(e.target.value, era)}
          />
          <Select
            value={era}
            disabled={!editable}
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
        {value !== null && <Hint label="Raw" value={value} />}
      </div>
    )
  }

  /** Weighted ethnicity rows: `<weight> = <ethnicity>` in the file. */
  const ethnicitiesField = (): React.JSX.Element => {
    const rows = draft?.ethnicities ?? []
    const setRow = (index: number, patch: Partial<CultureEthnicity>): void =>
      set({ ethnicities: rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) })
    const total = rows.reduce((sum, r) => sum + (Number(r.weight) || 0), 0)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <FieldLabel>Ethnicities</FieldLabel>
          {editable && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => set({ ethnicities: [...rows, { weight: '10', id: '' }] })}
            >
              <Plus />
              Add
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">none</p>
        ) : (
          rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                className="w-16 shrink-0 text-right font-mono"
                type="text"
                inputMode="numeric"
                value={row.weight}
                disabled={!editable}
                aria-invalid={!/^\d+(\.\d+)?$/.test(row.weight)}
                title="Relative weight"
                onChange={(e) => setRow(index, { weight: e.target.value })}
              />
              <ReferenceInput
                className="min-w-0 flex-1"
                value={row.id === '' ? null : row.id}
                onChange={(v) => setRow(index, { id: v ?? '' })}
                options={data.ethnicities}
                placeholder="ethnicity"
                locate={locate('ethnicity')}
                disabled={!editable}
              />
              {editable && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Remove"
                  onClick={() => set({ ethnicities: rows.filter((_, i) => i !== index) })}
                >
                  <X />
                </Button>
              )}
            </div>
          ))
        )}
        {rows.length > 1 && total > 0 && (
          <Hint
            label="Share"
            value={rows
              .map((r) => `${Math.round(((Number(r.weight) || 0) / total) * 100)}% ${r.id || '?'}`)
              .join(' · ')}
          />
        )}
      </div>
    )
  }

  /** Swatch plus hex field; the file's own colour spelling is kept on save. */
  const colorField = (): React.JSX.Element => {
    const hex = draft?.color ?? null
    const valid = hex !== null && /^#[0-9a-f]{6}$/i.test(hex)
    return (
      <div className="space-y-1.5">
        <FieldLabel>Colour</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            type="color"
            className="h-7 w-12 shrink-0 cursor-pointer p-0.5"
            value={valid ? hex : '#000000'}
            disabled={!editable}
            aria-label="Culture colour"
            onChange={(e) => set({ color: e.target.value })}
          />
          <Input
            type="text"
            className="flex-1 font-mono"
            value={hex ?? ''}
            placeholder="none"
            disabled={!editable}
            aria-invalid={hex !== null && hex !== '' && !valid}
            onChange={(e) => set({ color: e.target.value === '' ? null : e.target.value })}
          />
        </div>
        {def?.color && (
          <Hint
            label="In file"
            value={
              def.color.format === 'named'
                ? `${def.color.raw} (named — an edit writes rgb)`
                : def.color.raw
            }
          />
        )}
      </div>
    )
  }

  if (def === null) {
    return (
      <Card className="flex h-full min-h-0 w-full flex-col items-start gap-3 p-4">
        <Alert>
          <AlertDescription>
            No culture named <code className="font-mono">{id}</code> is defined in this mod or the
            game files it loads.
          </AlertDescription>
        </Alert>
      </Card>
    )
  }

  const swatch = def.color?.hex ?? null

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
          {swatch !== null && (
            <span
              aria-hidden
              className="size-4 shrink-0 rounded-sm border"
              style={{ backgroundColor: swatch, borderColor: swatchForeground(swatch) + '40' }}
            />
          )}
          <span className="truncate">{def.localizedName ?? def.id}</span>
          {dirty && (
            <span className="size-2 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
          )}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <DateFormatToggle
            calendar={calendar}
            showRaw={showRawDates}
            onChange={onShowRawDatesChange}
          />
          <Badge variant="secondary">{def.file}</Badge>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Open definition in text editor"
            onClick={() => void openReferenceTarget(() => locate('culture')(def.id), def.id)}
          >
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div ref={body} className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        {!def.inMod && (
          <Alert>
            <AlertDescription>
              Defined in the base game (<code className="font-mono">{def.file}</code>). Editing game
              files isn&apos;t supported — copy the definition into the mod to change it.
            </AlertDescription>
          </Alert>
        )}

        {draft && (
          <>
            <FieldSet className="gap-3.5">
              <FieldLegend variant="label" className="mb-0">
                Identity
              </FieldLegend>
              <div className="space-y-1.5">
                <FieldLabel>ID</FieldLabel>
                <Input type="text" value={def.id} disabled readOnly className="font-mono" />
                <Hint
                  label="Display name"
                  value={
                    def.localizedName ??
                    `not localized — add "${def.id}" to the mod's localization files`
                  }
                />
              </div>
              {colorField()}
              {createdField()}
            </FieldSet>

            <FieldSet className="gap-3.5">
              <FieldLegend variant="label" className="mb-0">
                Pillars
              </FieldLegend>
              {PILLARS.map((p) => (
                <Fragment key={p.key}>
                  {refField(
                    p.label,
                    'pillar',
                    draft[p.key] as string | null,
                    (v) => set({ [p.key]: v } as Partial<CultureDraft>),
                    data.pillars[p.type]
                  )}
                </Fragment>
              ))}
            </FieldSet>

            <FieldSet className="gap-3.5">
              <FieldLegend variant="label" className="mb-0">
                Traditions &amp; lineage
              </FieldLegend>
              {listField(
                'Traditions',
                draft.traditions,
                (v) => set({ traditions: v }),
                data.traditions,
                { kind: 'tradition', renderItem: traditionItem }
              )}
              {listField('Parents', draft.parents, (v) => set({ parents: v }), cultureOptions, {
                navigate: true
              })}
              {refField(
                'Name list',
                'name_list',
                draft.nameList,
                (v) => set({ nameList: v }),
                data.nameLists
              )}
            </FieldSet>

            <FieldSet className="gap-3.5">
              <FieldLegend variant="label" className="mb-0">
                Graphics
              </FieldLegend>
              {GFX.map((g) => (
                <Fragment key={g.key}>
                  {listField(
                    g.label,
                    draft[g.key] as string[],
                    (v) => set({ [g.key]: v } as Partial<CultureDraft>),
                    data.gfx[g.pool].map((v) => ({ id: v, name: null }))
                  )}
                </Fragment>
              ))}
              <div className="space-y-1.5">
                <FieldLabel>House CoA frame</FieldLabel>
                <ReferenceInput
                  value={draft.houseCoaFrame}
                  onChange={(v) => set({ houseCoaFrame: v })}
                  options={data.gfx.houseCoaFrame.map((v) => ({ id: v, name: null }))}
                  placeholder="none"
                  disabled={!editable}
                />
              </div>
              {ethnicitiesField()}
            </FieldSet>
          </>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      {editable && (
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <span
            className={cn(
              'mr-auto text-sm text-green-600 dark:text-green-500',
              !(savedFlash && !dirty) && 'invisible'
            )}
          >
            Saved ✓
          </span>
          <Button
            variant="outline"
            disabled={!dirty || saving}
            onClick={() => {
              setDraft(original ? { ...original } : null)
              setError(null)
            }}
          >
            Revert
          </Button>
          <Button disabled={!dirty || saving} title={SAVE_HOTKEY_LABEL} onClick={save}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      )}
    </Card>
  )
}
