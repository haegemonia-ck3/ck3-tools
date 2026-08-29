import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { CharacterDetail, RefKind, ReferenceData } from '@shared/types'
import { STAT_LABELS } from '../statLabels'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import Reference from './Reference'
import ReferenceBadge from './ReferenceBadge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isValidCK3Date } from '@/lib/ck3Date'

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

interface Props {
  modPath: string
  file: string
  id: string
  gameDir: string | null
  replacePaths: string[]
  refData: ReferenceData | null
  /** Ids of every character in the mod, offered as father/mother options */
  characterIds: string[]
  /** Switch the editor to another character in the mod (father/mother jump) */
  onNavigate: (id: string) => void
  /**
   * Reports whether the draft has unsaved edits, so the page can warn before
   * navigating away. Must be referentially stable (a useState setter).
   */
  onDirtyChange: (dirty: boolean) => void
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
  refData,
  characterIds,
  onNavigate,
  onDirtyChange,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const [original, setOriginal] = useState<CharacterDetail | null>(null)
  const [draft, setDraft] = useState<CharacterDetail | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setOriginal(null)
    setDraft(null)
    setError(null)
    window.ck3tools.getCharacter(modPath, file, id).then((d) => {
      setOriginal(d)
      setDraft(d ? structuredClone(d) : null)
    })
  }, [modPath, file, id])

  const iconCtx: IconContext = { gameDir, modPath, replacePaths }
  const iconFor = useTraitIcons(iconCtx, draft?.traits ?? [])

  // Computed before the early return below so the hook order stays stable
  const dirty =
    draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)

  useEffect(() => {
    onDirtyChange(dirty)
    // Closing the panel drops the draft, so it is no longer holding edits
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])

  if (!draft || !original) {
    return (
      <Card className="flex w-100 shrink-0 flex-col gap-0 py-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">Character</h2>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
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

  const badBirth = draft.birth !== null && draft.birth !== '' && !isValidCK3Date(draft.birth)
  const badDeath = draft.death !== null && draft.death !== '' && !isValidCK3Date(draft.death)

  const addTrait = (value: string): void => {
    const t = value.trim()
    if (t && !draft.traits.includes(t)) {
      set({ traits: [...draft.traits, t] })
    }
  }

  const save = async (): Promise<void> => {
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
      setOriginal(structuredClone(toSave))
      setDraft(toSave)
      setSavedFlash(true)
      onSaved(file, toSave.id)
    } finally {
      setSaving(false)
    }
  }

  const textField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    opts: { invalid?: boolean; placeholder?: string } = {}
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
    </div>
  )

  const refField = (
    label: string,
    kind: RefKind,
    value: string | null,
    onChange: (v: string | null) => void,
    options: string[]
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
      <Reference
        value={value}
        onChange={onChange}
        options={options}
        placeholder="none"
        locate={(v) => window.ck3tools.locateRef(gameDir, modPath, replacePaths, kind, v)}
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
      <Reference
        value={value}
        onChange={onChange}
        options={characterIds}
        placeholder="none"
        onNavigate={onNavigate}
      />
    </div>
  )

  return (
    <Card className="flex min-h-0 w-100 shrink-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="flex items-center gap-2 font-semibold text-primary">
        {original.name ?? original.id}
          {dirty && (
            <span className="size-2 rounded-full bg-primary" title="Unsaved changes" />
          )}
        </h2>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-4">
        {textField('ID', draft.id, (v) => set({ id: v ?? '' }))}
        {textField('Name', draft.name, (v) => set({ name: v }))}
        {refField('Dynasty', 'dynasty', draft.dynasty, (v) => set({ dynasty: v }), refData?.dynasties ?? [])}
        <div className="flex gap-2.5 *:flex-1">
          {textField('Birth', draft.birth, (v) => set({ birth: v }), {
            invalid: badBirth,
            placeholder: 'Y.M.D'
          })}
          {textField('Death', draft.death, (v) => set({ death: v }), {
            invalid: badDeath,
            placeholder: 'alive'
          })}
        </div>
        {refField('Culture', 'culture', draft.culture, (v) => set({ culture: v }), refData?.cultures ?? [])}
        {refField('Faith', 'faith', draft.faith, (v) => set({ faith: v }), refData?.faiths ?? [])}
        {parentField('Father', draft.father, (v) => set({ father: v }))}
        {parentField('Mother', draft.mother, (v) => set({ mother: v }))}

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
          <Reference
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
            setDraft(structuredClone(original))
            setError(null)
          }}
        >
          Revert
        </Button>
        <Button
          disabled={!dirty || saving || badBirth || badDeath || !draft.id.trim()}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}
