import { useState } from 'react'
import { X } from 'lucide-react'
import type {
  DynastyData,
  DynastyFiles,
  ReferenceData,
  SaveResult
} from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { FieldLabel } from './CharacterForm'
import CoatOfArms from './CoatOfArms'
import ReferenceInput from './ReferenceInput'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { normId } from '@/lib/dynastyView'

/** Sentinel Select value for "type a new file name" (no real file is named this) */
const NEW_FILE = '__new-file__'

/** Same charset the backend accepts for a new block's key. */
const ID_CHARS = /^[A-Za-z0-9_.\-']+$/

/** Where the game's own files put a first definition of each kind. */
const FILE_PLACEHOLDER = {
  dynasty: '00_dynasties.txt',
  house: '00_dynasty_houses.txt'
} as const

/** The fields a new definition carries; `culture` is dynasty-only, `dynasty` house-only. */
interface Draft {
  id: string
  name: string | null
  prefix: string | null
  motto: string | null
  culture: string | null
  dynasty: string | null
}

interface Props {
  kind: 'dynasty' | 'house'
  /** Switch the panel to the other kind, without losing what's typed */
  onKindChange: (kind: 'dynasty' | 'house') => void
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** The mod's definitions (id clashes, parent-dynasty options) */
  data: DynastyData
  /** Cultures for the picker, and every id the game defines (override warning) */
  refData: ReferenceData | null
  /** Existing .txt files under each definition folder */
  files: DynastyFiles
  /** Parent dynasty seeded from the URL ("New house" on a dynasty) */
  prefillDynasty: string | null
  /** Called after a successful create with the new definition's kind and id */
  onCreated: (kind: 'dynasty' | 'house', id: string) => void
  /** Jump to a dynasty row (the parent field's follow button) */
  onOpenRow: (kind: 'dynasty' | 'house', id: string) => void
  onClose: () => void
}

/**
 * The right-hand panel for creating a brand-new dynasty or house definition.
 * The fields mirror what DynastyDetailPanel edits; what's specific here is the
 * kind toggle, the editable id, the target-file picker (an existing file under
 * the kind's folder or a new one) and mandatory-field gating.
 */
export default function DynastyCreatePanel({
  kind,
  onKindChange,
  modPath,
  gameDir,
  replacePaths,
  data,
  refData,
  files,
  prefillDynasty,
  onCreated,
  onOpenRow,
  onClose
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => ({
    id: '',
    name: null,
    prefix: null,
    motto: null,
    culture: null,
    dynasty: prefillDynasty
  }))
  // Kept per kind: switching back and forth mustn't lose the picked file
  const [fileChoice, setFileChoice] = useState<Record<string, string>>({})
  const [newFileName, setNewFileName] = useState<Record<string, string>>({})
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (patch: Partial<Draft>): void => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }

  const options = kind === 'dynasty' ? files.dynasties : files.houses
  const choice = fileChoice[kind] ?? (options.length === 0 ? NEW_FILE : '')
  const typedName = (newFileName[kind] ?? '').trim()

  /** The file the definition will be written to; a new name gets .txt appended. */
  const targetFile =
    choice === NEW_FILE
      ? typedName === ''
        ? ''
        : typedName.toLowerCase().endsWith('.txt')
          ? typedName
          : `${typedName}.txt`
      : choice

  const id = draft.id.trim()
  const idInvalid = id !== '' && !ID_CHARS.test(id)

  // A mod definition with this id (of either kind) blocks the create; the
  // backend rejects it too. Dynasties and houses are separate databases in the
  // game, but this editor resolves an id against both, so both are checked.
  const clash =
    id === ''
      ? null
      : ([
          ['dynasty', data.dynasties.find((d) => d.inMod && normId(d.id) === normId(id))],
          ['house', data.houses.find((h) => h.inMod && normId(h.id) === normId(id))]
        ] as const).find(([, hit]) => hit !== undefined) ?? null

  // Not a clash: shadowing a base-game id is how you override one, but it's
  // worth saying out loud before it happens by accident. The reference data
  // covers every id the game defines; the scan adds the ones already in use.
  const shadowsGame =
    id !== '' &&
    clash === null &&
    ((refData?.[kind === 'dynasty' ? 'dynasties' : 'houses'] ?? []).some(
      (e) => normId(e.id) === normId(id)
    ) ||
      (kind === 'dynasty' ? data.dynasties : data.houses).some(
        (d) => !d.inMod && normId(d.id) === normId(id)
      ))

  const dynastyOptions = data.dynasties.map((d) => ({
    id: d.id,
    name: d.localizedName ?? d.name
  }))

  const canCreate =
    !creating &&
    id !== '' &&
    !idInvalid &&
    clash === null &&
    targetFile !== '' &&
    !!draft.name?.trim() &&
    (kind === 'dynasty' || !!draft.dynasty?.trim())

  const create = async (): Promise<void> => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const common = { id, name: draft.name, prefix: draft.prefix, motto: draft.motto }
      const result: SaveResult =
        kind === 'dynasty'
          ? await window.ck3tools.createDynasty(modPath, targetFile, {
              ...common,
              culture: draft.culture
            })
          : await window.ck3tools.createHouse(modPath, targetFile, {
              ...common,
              dynasty: draft.dynasty
            })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCreated(kind, id)
    } finally {
      setCreating(false)
    }
  }

  useFormHotkeys({ onSave: create, canSave: canCreate, onClose })

  const textField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    opts: { required?: boolean; placeholder?: string } = {}
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      <FieldLabel required={opts.required}>{label}</FieldLabel>
      <Input
        type="text"
        value={value ?? ''}
        placeholder={opts.placeholder ?? 'none'}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </div>
  )

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-lg font-semibold text-foreground">
          New {kind}
        </h2>
        <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <FieldLabel>Kind</FieldLabel>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            className="w-full"
            value={kind}
            onValueChange={(v) => v && onKindChange(v as 'dynasty' | 'house')}
            aria-label="What to create"
          >
            <ToggleGroupItem value="dynasty" className="flex-1">
              Dynasty
            </ToggleGroupItem>
            <ToggleGroupItem value="house" className="flex-1">
              House
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="space-y-1.5">
          <FieldLabel required>File</FieldLabel>
          <Select
            value={choice || undefined}
            onValueChange={(v) => setFileChoice({ ...fileChoice, [kind]: v })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a file…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEW_FILE}>New file…</SelectItem>
              {options.map((f) => (
                <SelectItem key={f} value={f} className="font-mono">
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {choice === NEW_FILE && (
            <Input
              type="text"
              className="font-mono"
              value={newFileName[kind] ?? ''}
              placeholder={FILE_PLACEHOLDER[kind]}
              onChange={(e) => setNewFileName({ ...newFileName, [kind]: e.target.value })}
            />
          )}
          <p className="text-xs text-muted-foreground">
            Under <code className="font-mono">common/{kind === 'dynasty' ? 'dynasties' : 'dynasty_houses'}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <FieldLabel required>ID</FieldLabel>
          <Input
            type="text"
            className="font-mono"
            value={draft.id}
            placeholder={kind === 'dynasty' ? 'e.g. dynn_Komnenos' : 'e.g. house_Komnenos'}
            aria-invalid={idInvalid || clash !== null || undefined}
            onChange={(e) => set({ id: e.target.value })}
          />
          {clash !== null && (
            <p className="text-xs text-destructive">
              Already {clash[0] === 'dynasty' ? 'a dynasty' : 'a house'} in the mod (
              <span className="font-mono">{clash[1]!.file}</span>).
            </p>
          )}
          {idInvalid && (
            <p className="text-xs text-destructive">
              Letters, digits, _ . - &apos; only — no spaces.
            </p>
          )}
          {shadowsGame && (
            <p className="text-xs text-muted-foreground">
              The base game defines this id — your definition will override it.
            </p>
          )}
        </div>

        <div className="flex items-start gap-4">
          {kind === 'house' && (
            // A house with no arms of its own inherits its dynasty's, like in game
            <CoatOfArms ids={[draft.dynasty]} size={112} className="shrink-0" />
          )}
          <div className="min-w-0 flex-1 space-y-5">
            {textField('Name', draft.name, (v) => set({ name: v }), {
              required: true,
              placeholder: kind === 'dynasty' ? 'dynn_Komnenos' : 'house_Komnenos'
            })}
            {textField('Prefix', draft.prefix, (v) => set({ prefix: v }))}
          </div>
        </div>

        {textField('Motto', draft.motto, (v) => set({ motto: v }))}
        <p className="-mt-3 text-xs text-muted-foreground">
          Name, prefix and motto are localization keys — add the display text to the mod&apos;s{' '}
          <code className="font-mono">localization</code> files.
        </p>

        {kind === 'dynasty' ? (
          <div className="space-y-1.5">
            <FieldLabel>Culture</FieldLabel>
            <ReferenceInput
              value={draft.culture}
              onChange={(v) => set({ culture: v })}
              options={refData?.cultures ?? []}
              placeholder="none"
              locate={(v) => window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'culture', v)}
            />
          </div>
        ) : (
          <div className="space-y-1.5">
            <FieldLabel required>Dynasty</FieldLabel>
            <ReferenceInput
              value={draft.dynasty}
              onChange={(v) => set({ dynasty: v })}
              options={dynastyOptions}
              placeholder="Parent dynasty…"
              followTitle="Go to this dynasty"
              onNavigate={(v) => onOpenRow('dynasty', v)}
            />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        <span className="text-xs text-muted-foreground">
          <span className="text-destructive">*</span> required
        </span>
        <Button disabled={!canCreate} title={SAVE_HOTKEY_LABEL} onClick={create}>
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Card>
  )
}
