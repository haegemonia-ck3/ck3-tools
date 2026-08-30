import { useEffect, useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type {
  CalendarConfig,
  CharacterDetail,
  CharacterDraft,
  CharacterSummary,
  RefEntry,
  ReferenceData
} from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import type { CharacterSearch } from '../router'
import CharacterForm, { FieldLabel, spousesInvalid } from './CharacterForm'
import DateFormatToggle from './DateFormatToggle'
import ReferenceDisplay from './ReferenceDisplay'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { isValidCK3Date } from '@/lib/ck3Date'

/**
 * Drafts persisted before a field existed (Dynasty/House, then Female, then
 * Spouses and Sexuality) miss its key. Treat those as unset so a resumed draft
 * neither reads as dirty against a freshly parsed character nor writes
 * `undefined` back.
 */
function withDefaults(detail: CharacterDetail): CharacterDetail {
  return {
    ...detail,
    house: detail.house ?? null,
    female: detail.female ?? null,
    sexuality: detail.sexuality ?? null,
    spouses: detail.spouses ?? []
  }
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
  characters: RefEntry[]
  /** Characters in the mod naming this one as father or mother */
  childCharacters: CharacterSummary[]
  /** Switch the editor to another character in the mod (father/mother jump) */
  onNavigate: (id: string) => void
  /** Open a lineage row in the Dynasty & House Editor */
  onOpenLineage: (kind: 'dynasty' | 'house', id: string) => void
  /** Open the create-character panel with these prefills (the Add child button) */
  onCreateChild: (prefill: CharacterSearch) => void
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
  characters,
  childCharacters,
  onNavigate,
  onOpenLineage,
  onCreateChild,
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
  /** Show file years instead of the mod calendar's era years in the date fields */
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
        setDraft(withDefaults(structuredClone(storedDraft.draft)))
        setStale(JSON.stringify(withDefaults(storedDraft.original)) !== JSON.stringify(d))
      } else {
        setDraft(structuredClone(d))
      }
    })
    return flushPersist
    // storedDraft is read once per open on purpose: our own persists update it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath, file, id])

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
  const badSpouses = spousesInvalid(draft?.spouses)

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
    canSave:
      dirty && !saving && !badBirth && !badDeath && !badSpouses && !!draft?.id.trim(),
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

  /**
   * A new child starts out in the parent's file, sharing culture and faith;
   * lineage follows the father, so it prefills only from a male parent. The
   * parent link uses the on-file id — an unsaved id rename would dangle.
   */
  const addChild = (): void => {
    const prefill: CharacterSearch = {
      file,
      culture: draft.culture ?? undefined,
      faith: draft.faith ?? undefined
    }
    if (/^yes$/i.test(draft.female ?? '')) {
      prefill.mother = original.id
    } else {
      prefill.father = original.id
      prefill.dynasty = draft.dynasty ?? undefined
      prefill.house = draft.house ?? undefined
    }
    onCreateChild(prefill)
  }

  /**
   * Children are derived from the other characters' father/mother keys, not
   * stored on this one, so the list is read-only; adding one creates a new
   * character with this one prefilled as a parent.
   */
  const childrenSlot = (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <FieldLabel>Children · {childCharacters.length}</FieldLabel>
        <Button
          variant="outline"
          size="sm"
          title="Create a new character with this one as a parent"
          onClick={addChild}
        >
          <Plus />
          Add child
        </Button>
      </div>
      {childCharacters.length === 0 ? (
        <p className="text-sm text-muted-foreground">none</p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {childCharacters.map((c) => (
            <div key={`${c.file}:${c.id}`} className="flex min-w-0 items-baseline gap-2 text-sm">
              <ReferenceDisplay
                value={c.id}
                name={c.name}
                onNavigate={() => onNavigate(c.id)}
                className="truncate"
              />
            </div>
          ))}
        </div>
      )}
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
        <div className="flex shrink-0 items-center gap-2">
          <DateFormatToggle calendar={calendar} showRaw={showRawDates} onChange={setShowRawDates} />
          <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <div className="@container min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        {stale && (
          <Alert>
            <AlertDescription>
              This character changed on disk while your draft was unsaved. Revert discards the
              draft and loads the file&apos;s version.
            </AlertDescription>
          </Alert>
        )}
        <CharacterForm
          draft={draft}
          set={set}
          modPath={modPath}
          gameDir={gameDir}
          replacePaths={replacePaths}
          calendar={calendar}
          showRawDates={showRawDates}
          refData={refData}
          characters={characters}
          onNavigate={onNavigate}
          onOpenLineage={onOpenLineage}
          badBirth={badBirth}
          badDeath={badDeath}
          identitySlot={
            <div className="space-y-1.5">
              <FieldLabel>ID</FieldLabel>
              <p className="font-mono text-sm">{draft.id}</p>
            </div>
          }
          childrenSlot={childrenSlot}
        />

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
          disabled={
            !dirty || saving || badBirth || badDeath || badSpouses || !draft.id.trim()
          }
          title={SAVE_HOTKEY_LABEL}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </Card>
  )
}
