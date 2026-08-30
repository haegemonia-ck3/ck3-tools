import { useState } from 'react'
import { X } from 'lucide-react'
import type { CalendarConfig, CultureData, CulturePatch } from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { FieldLabel } from './CharacterForm'
import CultureForm, { Hint } from './CultureForm'
import DateFormatToggle from './DateFormatToggle'
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
import { blankDraft, findCulture, missingRequired, normId, seedFrom } from '@/lib/cultureView'

/** Sentinel Select value for "type a new file name" (no real file is named this) */
const NEW_FILE = '__new-file__'

/** Same charset the backend accepts for a new block's key. */
const ID_CHARS = /^[A-Za-z0-9_.\-']+$/

/** What the writer will accept as a colour; anything else can't become a triple. */
const HEX = /^#[0-9a-f]{6}$/i

/** The writer's own lenient date check — real files carry "3212.1" and "3220.1.1." */
const DATE_LIKE = /^\d+\.\d+(\.\d+)?\.?$/

/** How many traditions a culture gets by default (DEFAULT_MAX_TRADITIONS in the game's defines). */
const DEFAULT_MAX_TRADITIONS = 5

/**
 * A readable starting swatch. Every culture needs a distinct map colour and
 * none can be guessed, so a random one beats leaving the field empty — fixed
 * saturation and value keep it legible whatever hue comes up.
 */
function randomCultureColor(): string {
  const v = 0.72
  const s = 0.45
  const hue = Math.random() * 6
  const i = Math.floor(hue)
  const f = hue - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const channels = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q]
  ][i % 6]
  return (
    '#' +
    channels
      .map((c) =>
        Math.round(c * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

interface Props {
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** Every culture the mod loads — id clashes, "Start from", parent options */
  data: CultureData
  calendar: CalendarConfig | null
  /** Existing .txt files under common/culture/cultures */
  files: string[]
  /** Seed every field from this culture, from the URL ("Derive" on a culture) */
  seedId: string | null
  /** Called after a successful create with the new culture's id */
  onCreated: (id: string) => void
  /** Jump to a culture row (a parent badge's follow button) */
  onOpenCulture: (id: string) => void
  onClose: () => void
}

/**
 * The panel for creating a brand-new culture. Reuses the shared CultureForm;
 * what's specific here is the editable ID, the target-file picker, the
 * "start from an existing culture" seed, and mandatory-field gating.
 *
 * A culture needs a dozen fields to be playable, so the form never opens blank:
 * it starts either from a culture the user picked or from the conventions of
 * the cultures the mod already loads.
 */
export default function CultureCreatePanel({
  modPath,
  gameDir,
  replacePaths,
  data,
  calendar,
  files,
  seedId,
  onCreated,
  onOpenCulture,
  onClose
}: Props): React.JSX.Element {
  const seed = seedId === null ? null : findCulture(data, seedId)

  const [draft, setDraft] = useState<CulturePatch>(() =>
    seed ? seedFrom(seed) : blankDraft(data, randomCultureColor())
  )
  const [startFrom, setStartFrom] = useState<string | null>(seed?.id ?? null)
  const [id, setId] = useState('')
  const [fileChoice, setFileChoice] = useState(() => (files.length === 0 ? NEW_FILE : ''))
  const [newFileName, setNewFileName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRawDates, setShowRawDates] = useState(false)

  const set = (patch: Partial<CulturePatch>): void => {
    setDraft({ ...draft, ...patch })
    setError(null)
  }

  /** The file the culture will be written to; a new name gets .txt appended. */
  const typedName = newFileName.trim()
  const targetFile =
    fileChoice === NEW_FILE
      ? typedName === ''
        ? ''
        : typedName.toLowerCase().endsWith('.txt')
          ? typedName
          : `${typedName}.txt`
      : fileChoice

  const trimmedId = id.trim()
  const idInvalid = trimmedId !== '' && !ID_CHARS.test(trimmedId)
  // A mod culture with this id blocks the create; the backend rejects it too.
  const clash =
    trimmedId === ''
      ? null
      : (data.cultures.find((c) => c.inMod && normId(c.id) === normId(trimmedId)) ?? null)
  // Not a clash: shadowing a base-game culture is how a mod overrides one, but
  // it's worth saying out loud before it happens by accident.
  const shadowsGame =
    trimmedId !== '' &&
    clash === null &&
    data.cultures.some((c) => !c.inMod && normId(c.id) === normId(trimmedId))

  const missing = missingRequired(draft)
  const badDate = draft.created !== null && draft.created !== '' && !DATE_LIKE.test(draft.created)

  const canCreate =
    !creating &&
    trimmedId !== '' &&
    !idInvalid &&
    clash === null &&
    targetFile !== '' &&
    missing.length === 0 &&
    HEX.test(draft.color ?? '') &&
    !badDate

  const create = async (): Promise<void> => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const result = await window.ck3tools.createCulture(modPath, targetFile, {
        ...draft,
        id: trimmedId,
        // The Add button starts a row blank; an unfilled one is not an error
        ethnicities: draft.ethnicities.filter((e) => e.id.trim() !== '')
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onCreated(trimmedId)
    } finally {
      setCreating(false)
    }
  }

  useFormHotkeys({ onSave: create, canSave: canCreate, onClose })

  const identitySlot = (
    <>
      <div className="space-y-1.5">
        <FieldLabel required>File</FieldLabel>
        <Select value={fileChoice || undefined} onValueChange={setFileChoice}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a file…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_FILE}>New file…</SelectItem>
            {files.map((f) => (
              <SelectItem key={f} value={f} className="font-mono">
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fileChoice === NEW_FILE && (
          <Input
            type="text"
            className="font-mono"
            value={newFileName}
            placeholder="00_cultures.txt"
            onChange={(e) => setNewFileName(e.target.value)}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Under <code className="font-mono">common/culture/cultures</code>
        </p>
      </div>

      <div className="space-y-1.5">
        <FieldLabel required>ID</FieldLabel>
        <Input
          type="text"
          className="font-mono"
          value={id}
          placeholder="e.g. attic"
          aria-invalid={idInvalid || clash !== null || undefined}
          onChange={(e) => setId(e.target.value)}
        />
        {clash !== null && (
          <p className="text-xs text-destructive">
            Already a culture in the mod (<span className="font-mono">{clash.file}</span>).
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
        <Hint
          label="Display name"
          value={
            <>
              add <code className="font-mono">{trimmedId || 'the id'}</code> to the mod&apos;s
              localization files
            </>
          }
        />
      </div>

      <div className="space-y-1.5">
        <FieldLabel>Start from</FieldLabel>
        <ReferenceInput
          value={startFrom}
          onChange={(v) => {
            setStartFrom(v)
            // Clearing the picker only drops the annotation: `draft` is the
            // only copy of what has been typed, so nothing here discards it.
            const source = v === null ? null : findCulture(data, v)
            if (source) setDraft(seedFrom(source))
            setError(null)
          }}
          options={data.cultures.map((c) => ({ id: c.id, name: c.localizedName }))}
          placeholder="the mod's usual defaults"
        />
        <p className="text-xs text-muted-foreground">
          Copies every field except the founding date, and makes the source this culture&apos;s
          parent.
        </p>
      </div>
    </>
  )

  // Both notes describe the culture currently selected in "Start from", not
  // the one the URL happened to open with, so they stay true as it changes.
  const source = startFrom === null ? null : findCulture(data, startFrom)
  const seededParent =
    source !== null && draft.parents.some((p) => normId(p) === normId(source.id))

  const notes = {
    color:
      source?.color?.format === 'named' ? (
        <Hint
          label="Source"
          value={`${source.color.raw} is a named colour — a new culture writes rgb { … }`}
        />
      ) : undefined,
    parents: seededParent ? (
      <Hint
        label="Seeded"
        value={`descends from ${source!.id} — remove it if this isn't a derived culture`}
      />
    ) : undefined,
    traditions:
      draft.traditions.length > DEFAULT_MAX_TRADITIONS ? (
        <Hint
          label="Note"
          value={`a culture gets ${DEFAULT_MAX_TRADITIONS} traditions by default, though a few in the game ship more`}
        />
      ) : undefined,
    coaGfx:
      draft.coaGfx.length === 0 ? (
        <Hint label="Note" value="every culture the game ships names a coat-of-arms set" />
      ) : undefined
  }

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-lg font-semibold text-foreground">New culture</h2>
        <div className="flex shrink-0 items-center gap-1">
          <DateFormatToggle calendar={calendar} showRaw={showRawDates} onChange={setShowRawDates} />
          <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
            <X />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        <CultureForm
          draft={draft}
          set={set}
          data={data}
          modPath={modPath}
          gameDir={gameDir}
          replacePaths={replacePaths}
          calendar={calendar}
          showRawDates={showRawDates}
          markRequired
          onOpenCulture={onOpenCulture}
          identitySlot={identitySlot}
          notes={notes}
        />

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
        {missing.length > 0 ? (
          <span
            className="min-w-0 truncate text-xs text-muted-foreground"
            title={`Still needed: ${missing.join(', ')}`}
          >
            Needs: {missing.join(', ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> required
          </span>
        )}
        <Button
          className="shrink-0"
          disabled={!canCreate}
          title={SAVE_HOTKEY_LABEL}
          onClick={create}
        >
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Card>
  )
}
