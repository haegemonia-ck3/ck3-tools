import { useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { NewTitle, RefEntry, TitleData, TitleFlags, TitleTier } from '@shared/types'
import { TITLE_FLAG_KEYS } from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { FieldLabel } from './CharacterForm'
import Hint from './Hint'
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
import { TIER_LABEL, TIER_RANK, findTitle, normId } from '@/lib/titleView'

/** Sentinel Select value for "type a new file name" (no real file is named this) */
const NEW_FILE = '__new-file__'

/** Same charset the backend accepts for a new block's key. */
const ID_CHARS = /^[A-Za-z0-9_.\-']+$/

const HEX = /^#[0-9a-f]{6}$/i

/** The tier a prefixed id would create, or null while the prefix isn't one. */
function tierOf(id: string): TitleTier | null {
  if (!/^[hekdcb]_./i.test(id)) return null
  return (
    (
      {
        h: 'hegemony',
        e: 'empire',
        k: 'kingdom',
        d: 'duchy',
        c: 'county',
        b: 'barony'
      } as Record<string, TitleTier>
    )[id[0].toLowerCase()] ?? null
  )
}

/**
 * The flag bundles the game's own special titles are built from — the noble
 * family and landless adventurer recipes are copied from vanilla files, so a
 * created title behaves exactly like the ones the game ships.
 */
type TitleKind = 'plain' | 'noble_family' | 'laamp'

const KIND_LABEL: Record<TitleKind, string> = {
  plain: 'Landed / titular',
  noble_family: 'Noble family',
  laamp: 'Landless adventurer'
}

const KIND_NOTE: Record<TitleKind, string | null> = {
  plain: null,
  noble_family:
    'sets landless, noble_family, definite_form, destroy_if_invalid_heir, no_automatic_claims, always_follows_primary_heir, ruler_uses_title_name = no',
  laamp:
    'sets landless, require_landless, definite_form, destroy_if_invalid_heir, no_automatic_claims, ruler_uses_title_name = no'
}

function kindFlags(kind: TitleKind): TitleFlags {
  const flags = {} as TitleFlags
  for (const key of TITLE_FLAG_KEYS) flags[key] = null
  if (kind === 'noble_family' || kind === 'laamp') {
    flags.definite_form = 'yes'
    flags.landless = 'yes'
    flags.ruler_uses_title_name = 'no'
    flags.no_automatic_claims = 'yes'
    flags.destroy_if_invalid_heir = 'yes'
    if (kind === 'noble_family') {
      flags.noble_family = 'yes'
      flags.always_follows_primary_heir = 'yes'
    } else {
      flags.require_landless = 'yes'
    }
  }
  return flags
}

/**
 * A readable starting swatch: every title paints a map colour and none can be
 * guessed, so a random one beats an empty field — fixed saturation and value
 * keep it legible whatever hue comes up.
 */
function randomTitleColor(): string {
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
  data: TitleData
  /** Existing .txt files under the mod's common/landed_titles */
  files: string[]
  /** Prefilled parent title (from "Add child title"), from the URL */
  seedParent: string | null
  onCreated: (id: string) => void
  onOpenTitle: (id: string) => void
  onClose: () => void
}

/**
 * The panel for creating a brand-new landed title. The id's tier prefix
 * decides the tier; a parent nests the block inside that title (de jure
 * membership), no parent appends a top-level block to a chosen file. Flags
 * come from a kind preset and are refined afterwards in the detail panel.
 */
export default function TitleCreatePanel({
  modPath,
  data,
  files,
  seedParent,
  onCreated,
  onOpenTitle,
  onClose
}: Props): React.JSX.Element {
  const [id, setId] = useState('')
  const [kind, setKind] = useState<TitleKind>('plain')
  const [parent, setParent] = useState<string | null>(seedParent)
  const [color, setColor] = useState(randomTitleColor)
  const [capital, setCapital] = useState<string | null>(null)
  const [province, setProvince] = useState('')
  const [fileChoice, setFileChoice] = useState(() => (files.length === 0 ? NEW_FILE : ''))
  const [newFileName, setNewFileName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const trimmedId = id.trim()
  const tier = tierOf(trimmedId)
  const idInvalid = trimmedId !== '' && (!ID_CHARS.test(trimmedId) || tier === null)

  // A mod title with this id blocks the create; the backend rejects it too.
  const clash =
    trimmedId === ''
      ? null
      : (data.titles.find((t) => t.inMod && normId(t.id) === normId(trimmedId)) ?? null)
  // Not a clash: shadowing a base-game title is how a mod overrides one, but
  // it's worth saying out loud before it happens by accident.
  const shadowsGame =
    trimmedId !== '' &&
    clash === null &&
    data.titles.some((t) => !t.inMod && normId(t.id) === normId(trimmedId))

  // Only mod-defined titles can take a nested child, and only strictly
  // higher-tier ones can hold this tier.
  const parentOptions: RefEntry[] = useMemo(
    () =>
      data.titles
        .filter(
          (t) => t.inMod && (tier === null || TIER_RANK[t.tier] > TIER_RANK[tier])
        )
        .map((t) => ({ id: t.id, name: t.localizedName })),
    [data.titles, tier]
  )

  const countyOptions: RefEntry[] = useMemo(
    () =>
      data.titles
        .filter((t) => t.tier === 'county')
        .map((t) => ({ id: t.id, name: t.localizedName })),
    [data.titles]
  )

  const parentTitle = parent === null ? null : findTitle(data.titles, parent)
  const parentTierError =
    parent !== null &&
    parentTitle !== null &&
    tier !== null &&
    TIER_RANK[parentTitle.tier] <= TIER_RANK[tier]

  const typedName = newFileName.trim()
  const targetFile =
    fileChoice === NEW_FILE
      ? typedName === ''
        ? ''
        : typedName.toLowerCase().endsWith('.txt')
          ? typedName
          : `${typedName}.txt`
      : fileChoice

  const canCreate =
    !creating &&
    trimmedId !== '' &&
    !idInvalid &&
    clash === null &&
    !parentTierError &&
    (parent !== null || targetFile !== '') &&
    HEX.test(color)

  const create = async (): Promise<void> => {
    if (!canCreate) return
    setCreating(true)
    setError(null)
    try {
      const def: NewTitle = {
        id: trimmedId,
        parent,
        file: parent === null ? targetFile : null,
        color,
        capital,
        province: tier === 'barony' && province.trim() !== '' ? province.trim() : null,
        flags: kindFlags(kind)
      }
      const result = await window.ck3tools.createTitle(modPath, def)
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

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="truncate text-lg font-semibold text-foreground">New title</h2>
        <Button variant="ghost" size="icon-sm" title="Close (Esc)" onClick={onClose}>
          <X />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-1.5">
          <FieldLabel required>ID</FieldLabel>
          <Input
            type="text"
            className="font-mono"
            value={id}
            placeholder="e.g. d_athens"
            aria-invalid={idInvalid || clash !== null || undefined}
            onChange={(e) => setId(e.target.value)}
          />
          {idInvalid && (
            <p className="text-xs text-destructive">
              A title id starts with its tier prefix (e_, k_, d_, c_, b_ or h_) — letters, digits,
              _ . - &apos; only.
            </p>
          )}
          {clash !== null && (
            <p className="text-xs text-destructive">
              Already a title in the mod (<span className="font-mono">{clash.file}</span>).
            </p>
          )}
          {shadowsGame && (
            <p className="text-xs text-muted-foreground">
              The base game defines this id — your definition will override it.
            </p>
          )}
          {tier !== null && <Hint label="Tier" value={TIER_LABEL[tier]} />}
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
          <FieldLabel>Kind</FieldLabel>
          <Select value={kind} onValueChange={(v) => setKind(v as TitleKind)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(KIND_LABEL) as TitleKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {KIND_NOTE[kind] !== null && <Hint label="Preset" value={KIND_NOTE[kind]} />}
          <p className="text-xs text-muted-foreground">
            Flags can be refined in the title&apos;s panel after creation.
          </p>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>De jure liege (parent)</FieldLabel>
          <ReferenceInput
            value={parent}
            onChange={setParent}
            options={parentOptions}
            placeholder="none — top-level title"
            onNavigate={onOpenTitle}
          />
          {parentTierError && (
            <p className="text-xs text-destructive">
              A {tier} can&apos;t be de jure part of a {parentTitle!.tier} — pick a higher tier.
            </p>
          )}
          <Hint value="Nests the new block inside the parent's; only mod-defined titles can take children." />
        </div>

        {parent === null && (
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
                placeholder="00_landed_titles.txt"
                onChange={(e) => setNewFileName(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              Under <code className="font-mono">common/landed_titles</code>
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <FieldLabel required>Map color</FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              type="color"
              aria-label="Title color"
              className="h-7 w-12 shrink-0 cursor-pointer p-0.5"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
            <Input
              type="text"
              className="font-mono"
              value={color}
              onChange={(e) => {
                const v = e.target.value.trim()
                if (HEX.test(v)) setColor(v.toLowerCase())
              }}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <FieldLabel>Capital county</FieldLabel>
          <ReferenceInput
            value={capital}
            onChange={setCapital}
            options={countyOptions}
            placeholder="none"
            onNavigate={onOpenTitle}
          />
        </div>

        {tier === 'barony' && (
          <div className="space-y-1.5">
            <FieldLabel>Province</FieldLabel>
            <Input
              type="text"
              inputMode="numeric"
              className="font-mono"
              value={province}
              placeholder="map province id"
              onChange={(e) => setProvince(e.target.value)}
            />
            <Hint value="A holdable barony needs the map province it occupies; leave empty only for a titular barony." />
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
        <Button className="shrink-0" disabled={!canCreate} title={SAVE_HOTKEY_LABEL} onClick={create}>
          {creating ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </Card>
  )
}
