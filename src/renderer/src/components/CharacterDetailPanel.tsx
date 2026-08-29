import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { CharacterDetail, ReferenceData } from '@shared/types'
import { STAT_LABELS } from '../statLabels'
import { useTraitIcons } from '../useTraitIcons'
import type { IconContext } from '../useTraitIcons'
import TraitPicker from './TraitPicker'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface Props {
  modPath: string
  file: string
  id: string
  gameDir: string | null
  replacePaths: string[]
  refData: ReferenceData | null
  /** Called after a successful save; newId may differ from the selected id */
  onSaved: (file: string, newId: string) => void
  onClose: () => void
}

const DATE_RE = /^\d+\.\d+(\.\d+)?$/

export default function CharacterDetailPanel({
  modPath,
  file,
  id,
  gameDir,
  replacePaths,
  refData,
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

  const dirty = JSON.stringify(draft) !== JSON.stringify(original)
  const set = (patch: Partial<CharacterDetail>): void => {
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

  const badBirth = draft.birth !== null && draft.birth !== '' && !DATE_RE.test(draft.birth)
  const badDeath = draft.death !== null && draft.death !== '' && !DATE_RE.test(draft.death)

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
    opts: { listId?: string; invalid?: boolean; placeholder?: string } = {}
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <Label className="text-xs tracking-wide text-muted-foreground uppercase">{label}</Label>
      <Input
        type="text"
        list={opts.listId}
        value={value ?? ''}
        placeholder={opts.placeholder}
        aria-invalid={opts.invalid || undefined}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
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
        {textField('Dynasty', draft.dynasty, (v) => set({ dynasty: v }))}
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
        {textField('Culture', draft.culture, (v) => set({ culture: v }), { listId: 'dl-cultures' })}
        {textField('Faith', draft.faith, (v) => set({ faith: v }), { listId: 'dl-faiths' })}

        <div className="space-y-1.5">
          <Label className="text-xs tracking-wide text-muted-foreground uppercase">Traits</Label>
          <div className="flex min-h-6 flex-wrap gap-1.5">
            {draft.traits.map((t) => {
              const icon = iconFor(t)
              return (
                <Badge key={t} variant="secondary" className="gap-1 pr-1">
                  {icon && <img className="-ml-1 size-5 object-contain" src={icon} alt="" />}
                  {t}
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="size-4 text-muted-foreground hover:text-destructive"
                    title={`Remove ${t}`}
                    onClick={() => set({ traits: draft.traits.filter((x) => x !== t) })}
                  >
                    <X />
                  </Button>
                </Badge>
              )
            })}
            {draft.traits.length === 0 && <span className="text-sm text-muted-foreground">none</span>}
          </div>
          <TraitPicker
            available={refData?.traits ?? []}
            exclude={draft.traits}
            iconCtx={iconCtx}
            onAdd={addTrait}
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

      {refData && (
        <>
          <datalist id="dl-cultures">
            {refData.cultures.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="dl-faiths">
            {refData.faiths.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </>
      )}
    </Card>
  )
}
