import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type {
  CalendarConfig,
  CharacterDetail,
  CharacterDraft,
  RefKind,
  ReferenceData
} from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { STAT_LABELS } from '../statLabels'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import CoatOfArms from './CoatOfArms'
import ReferenceInput from './ReferenceInput'
import ReferenceBadge from './ReferenceBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import {
  formatCalendarDate,
  fromCalendarInput,
  isValidCK3Date,
  toCalendarInput
} from '@/lib/ck3Date'
import type { CalendarEra } from '@/lib/ck3Date'

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

/**
 * Drafts persisted before Dynasty and House became separate fields have no
 * `house`. Treat it as unset so a resumed draft neither reads as dirty against
 * a freshly parsed character nor writes `undefined` back to the file.
 */
function withHouse(detail: CharacterDetail): CharacterDetail {
  return { ...detail, house: detail.house ?? null }
}

interface Props {
  modPath: string
  file: string
  id: string
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
  /** Persisted unsaved edits for this character, if any; read once per open */
  storedDraft: CharacterDraft | null
  /**
   * Persist (or clear, with null) the draft for a character in this file.
   * Must be referentially stable.
   */
  onDraftChange: (file: string, id: string, entry: CharacterDraft | null) => void
  /** Called after a successful save; newId may differ from the selected id */
  onSaved: (file: string, newId: string) => void
  onClose: () => void
}

export default function CharacterDetailPanel({
  modPath,
  file,
  id,
  gameDir,
  replacePaths,
  calendar,
  refData,
  characterIds,
  onNavigate,
  onOpenLineage,
  storedDraft,
  onDraftChange,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const [original, setOriginal] = useState<CharacterDetail | null>(null)
  const [draft, setDraft] = useState<CharacterDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)
  /** The file changed on disk while this draft was dormant (external edit) */
  const [stale, setStale] = useState(false)
  /** Show file years instead of the mod calendar's era years in the date inputs */
  const [showRawDates, setShowRawDates] = useState(false)

  /** Debounced draft persist waiting to fire; flushed before switching characters */
  const pendingPersist = useRef<(() => void) | null>(null)
  const flushPersist = (): void => {
    pendingPersist.current?.()
    pendingPersist.current = null
  }

  useEffect(() => {
    setOriginal(null)
    setDraft(null)
    setError(null)
    setStale(false)
    window.ck3tools.getCharacter(modPath, file, id).then((d) => {
      setOriginal(d)
      if (!d) {
        setDraft(null)
        return
      }
      // Resume a persisted draft; `original` stays the file's CURRENT state so
      // dirty/save/revert all work against what's really on disk.
      if (storedDraft) {
        setDraft(withHouse(structuredClone(storedDraft.draft)))
        setStale(JSON.stringify(withHouse(storedDraft.original)) !== JSON.stringify(d))
      } else {
        setDraft(structuredClone(d))
      }
    })
    return flushPersist
    // storedDraft is read once per open on purpose: our own persists update it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath, file, id])

  const iconCtx: IconContext = { gameDir, modPath, replacePaths }
  const iconFor = useTraitIcons(iconCtx, draft?.traits ?? [])

  // Computed before the early return below so the hook order stays stable
  const dirty =
    draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)

  // Persist the draft as it changes (cleared when it matches the file again),
  // debounced so typing doesn't write settings.json per keystroke.
  useEffect(() => {
    if (!draft || !original) return undefined
    const entry = dirty ? { draft, original } : null
    const originalId = original.id
    pendingPersist.current = () => onDraftChange(file, originalId, entry)
    const t = setTimeout(flushPersist, 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, original])

  const badBirth = !!draft?.birth && !isValidCK3Date(draft.birth)
  const badDeath = !!draft?.death && !isValidCK3Date(draft.death)

  const save = async (): Promise<void> => {
    if (!draft || !original) return
    setSaving(true)
    setError(null)
    try {
      const toSave: CharacterDetail = {
        ...draft,
        birth: draft.birth || null,
        death: draft.death || null
      }
      const result = await window.ck3tools.saveCharacter(modPath, file, original.id, toSave)
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Cancel any in-flight persist and clear the stored draft immediately
      pendingPersist.current = null
      onDraftChange(file, original.id, null)
      setOriginal(structuredClone(toSave))
      setDraft(toSave)
      setSavedFlash(true)
      setStale(false)
      onSaved(file, toSave.id)
    } finally {
      setSaving(false)
    }
  }

  useFormHotkeys({
    onSave: save,
    canSave: dirty && !saving && !badBirth && !badDeath && !!draft?.id.trim(),
    onClose
  })

  if (!draft || !original) {
    return (
      <Card className="flex h-full w-full min-w-0 flex-col gap-0 py-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Character</h2>
          <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>
        <p className="p-4 text-sm text-muted-foreground">
          {original === null ? 'Loading…' : 'Character not found.'}
        </p>
      </Card>
    )
  }

  const set = (patch: Partial<CharacterDetail>): void => {
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

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
    opts: { invalid?: boolean; placeholder?: string; hint?: React.ReactNode } = {}
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
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
    opts: { invalid?: boolean; placeholder?: string }
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
        <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
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
    options: string[]
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
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
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
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
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
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
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          {original.name ?? original.id}
          {dirty && (
            <span className="size-2 rounded-full bg-primary" title="Unsaved changes" />
          )}
        </h2>
        <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="@container min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {stale && (
          <Alert>
            <AlertDescription>
              This character changed on disk while your draft was unsaved. Revert discards the
              draft and loads the file&apos;s version.
            </AlertDescription>
          </Alert>
        )}
        <FieldSet className="gap-3.5">
          <div className="space-y-1.5">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">ID</Label>
            <p className="font-mono text-sm">{draft.id}</p>
          </div>
          {textField('Name', draft.name, (v) => set({ name: v }))}
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
              placeholder: 'Y.M.D'
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
        </FieldSet>

        <FieldSet className="gap-3.5">
          <FieldLegend variant="label" className="mb-0">Culture &amp; traits</FieldLegend>
          {refField('Culture', 'culture', draft.culture, (v) => set({ culture: v }), refData?.cultures ?? [])}
          {refField('Faith', 'faith', draft.faith, (v) => set({ faith: v }), refData?.faiths ?? [])}
          <div className="space-y-1.5">
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">Traits</Label>
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
            <Label className="text-xs tracking-wide text-muted-foreground uppercase">Stats</Label>
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

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

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
            pendingPersist.current = null
            onDraftChange(file, original.id, null)
            setDraft(structuredClone(original))
            setError(null)
            setStale(false)
          }}
        >
          Revert
        </Button>
        <Button
          disabled={!dirty || saving || badBirth || badDeath || !draft.id.trim()}
          title={SAVE_HOTKEY_LABEL}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}
