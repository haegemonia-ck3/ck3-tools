import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type {
  FaithDef,
  RefEntry,
  RefLocation,
  ReligionData,
  ReligionDef,
  SaveResult
} from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { useFaithIcons } from '../useGameIcons'
import type { IconContext } from '../useGameIcons'
import DoctrineEditor from './DoctrineEditor'
import ReferenceBadge from './ReferenceBadge'
import ReferenceDisplay from './ReferenceDisplay'
import ReferenceInput, { openReferenceTarget } from './ReferenceInput'
import { idOnly } from './ReferenceLabel'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { FieldLegend, FieldSet } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  adherentsOfFaith,
  adherentsOfReligion,
  faithsOfReligion,
  normId
} from '@/lib/faithView'

/** How many holy sites CK3 lets a faith hold; over that the game ignores the rest. */
const HOLY_SITE_LIMIT = 5

/** Editable fields of either entity; a faith uses the top half, a religion the bottom. */
interface DefDraft {
  color: string | null
  icon: string | null
  reformedIcon: string | null
  religiousHead: string | null
  holySites: string[]
  family: string | null
  graphicalFaith: string | null
  pietyIconGroup: string | null
  doctrines: string[]
}

interface Props {
  kind: 'religion' | 'faith'
  id: string
  data: ReligionData
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** Icon names available to the `icon =` fields, from the game and mod folders */
  iconNames: string[]
  /** Switch the editor to another religion/faith row */
  onOpenRow: (kind: 'religion' | 'faith', id: string) => void
  /** Jump to the character editor */
  onOpenCharacter: (id: string, file: string) => void
  /** Called after a successful save so the page can reload definitions */
  onSaved: () => void
  /** Leave the row and go back to the list (the header arrow, and Esc) */
  onClose: () => void
}

export default function FaithDetailPanel({
  kind,
  id,
  data,
  modPath,
  gameDir,
  replacePaths,
  iconNames,
  onOpenRow,
  onOpenCharacter,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const faith: FaithDef | null =
    kind === 'faith' ? (data.faiths.find((f) => normId(f.id) === normId(id)) ?? null) : null
  const religion: ReligionDef | null =
    kind === 'religion'
      ? (data.religions.find((r) => normId(r.id) === normId(id)) ?? null)
      : null
  const def = faith ?? religion

  const original: DefDraft | null = def
    ? {
        color: faith?.color?.hex ?? null,
        icon: faith?.icon ?? null,
        reformedIcon: faith?.reformedIcon ?? null,
        religiousHead: faith?.religiousHead ?? null,
        holySites: faith?.holySites ?? [],
        family: religion?.family ?? null,
        graphicalFaith: religion?.graphicalFaith ?? null,
        pietyIconGroup: religion?.pietyIconGroup ?? null,
        doctrines: def.doctrines
      }
    : null

  const [draft, setDraft] = useState<DefDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setDraft(original ? { ...original } : null)
    setError(null)
    // Re-derived from data on purpose: a reload after save re-seeds the draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id, data])

  // The "Saved ✓" flash must survive the post-save data reload (which re-runs
  // the reseed above), so it resets only when a different row is opened — and
  // a new row starts at the top of the form rather than wherever the last one
  // was scrolled to
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setSavedFlash(false)
    body.current?.scrollTo({ top: 0 })
  }, [kind, id])

  const iconCtx: IconContext = { gameDir, modPath, replacePaths }
  const iconFor = useFaithIcons(
    iconCtx,
    useMemo(
      () => [draft?.icon, draft?.reformedIcon].filter((i): i is string => Boolean(i)),
      [draft?.icon, draft?.reformedIcon]
    )
  )

  const parentReligion = useMemo(
    () =>
      faith === null
        ? null
        : (data.religions.find((r) => normId(r.id) === normId(faith.religion)) ?? null),
    [data.religions, faith]
  )

  const iconOptions: RefEntry[] = useMemo(() => iconNames.map(idOnly), [iconNames])

  const adherents = useMemo(
    () =>
      def === null
        ? []
        : kind === 'faith'
          ? adherentsOfFaith(data, id)
          : adherentsOfReligion(data, id),
    [data, def, kind, id]
  )
  const faiths = useMemo(
    () => (kind === 'religion' ? faithsOfReligion(data, id) : []),
    [data, kind, id]
  )

  const editable = def !== null && def.inMod
  const dirty =
    draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)

  const set = (patch: Partial<DefDraft>): void => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

  const save = async (): Promise<void> => {
    if (!def || !draft) return
    setSaving(true)
    setError(null)
    try {
      const result: SaveResult =
        kind === 'faith'
          ? await window.ck3tools.saveFaith(modPath, def.file, faith!.religion, def.id, {
              color: draft.color,
              icon: draft.icon,
              reformedIcon: draft.reformedIcon,
              religiousHead: draft.religiousHead,
              doctrines: draft.doctrines,
              holySites: draft.holySites
            })
          : await window.ck3tools.saveReligion(modPath, def.file, def.id, {
              family: draft.family,
              graphicalFaith: draft.graphicalFaith,
              pietyIconGroup: draft.pietyIconGroup,
              doctrines: draft.doctrines
            })
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

  const locateDoctrine = (v: string): Promise<RefLocation | null> =>
    window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'doctrine', v)

  const fieldLabel = (text: string): React.JSX.Element => (
    <Label className="text-xs tracking-wide text-muted-foreground uppercase">{text}</Label>
  )

  const textField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void,
    placeholder = 'none'
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      {fieldLabel(label)}
      <Input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        disabled={!editable}
        onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
      />
    </div>
  )

  const iconField = (
    label: string,
    value: string | null,
    onChange: (v: string | null) => void
  ): React.JSX.Element => (
    <div className="space-y-1.5">
      {fieldLabel(label)}
      <div className="flex items-center gap-2">
        <IconTile url={value === null ? null : iconFor(value)} size={36} />
        <ReferenceInput
          className="min-w-0 flex-1"
          value={value}
          onChange={onChange}
          options={iconOptions}
          placeholder="none"
          disabled={!editable}
          limit={60}
        />
      </div>
    </div>
  )

  const colorField = (current: FaithDef['color']): React.JSX.Element => (
    <div className="space-y-1.5">
      {fieldLabel('Color')}
      {current !== null && !current.editable ? (
        <div className="flex items-center gap-2">
          <Swatch hex={current.hex} className="size-7" />
          <code className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {current.raw}
          </code>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input
            type="color"
            aria-label="Faith color"
            className="h-7 w-12 shrink-0 cursor-pointer p-0.5"
            value={draft?.color ?? '#000000'}
            disabled={!editable || current === null}
            onChange={(e) => set({ color: e.target.value })}
          />
          <Input
            type="text"
            className="font-mono"
            placeholder={current === null ? 'no color line' : '#rrggbb'}
            value={draft?.color ?? ''}
            disabled={!editable || current === null}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (/^#[0-9a-fA-F]{6}$/.test(v)) set({ color: v.toLowerCase() })
            }}
          />
        </div>
      )}
      {current === null && (
        <p className="text-xs text-muted-foreground">
          This faith has no <code className="font-mono">color</code> line; add one in the file to
          edit it here.
        </p>
      )}
    </div>
  )

  const holySitesField = (): React.JSX.Element => {
    const sites = draft?.holySites ?? []
    return (
      <FieldSet className="gap-3.5">
        <FieldLegend variant="label" className="mb-0 flex w-full items-center justify-between">
          Holy sites · {sites.length}
          {sites.length > HOLY_SITE_LIMIT && (
            <Badge variant="outline" className="text-[10px] font-normal">
              over the game&apos;s limit of {HOLY_SITE_LIMIT}
            </Badge>
          )}
        </FieldLegend>
        <div className="flex min-h-6 flex-wrap gap-1.5">
          {sites.map((site) => (
            <ReferenceBadge
              key={site}
              entry={data.holySites.find((h) => normId(h.id) === normId(site)) ?? idOnly(site)}
              locate={() =>
                window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'holy_site', site)
              }
              onRemove={
                editable ? () => set({ holySites: sites.filter((s) => s !== site) }) : undefined
              }
            />
          ))}
          {sites.length === 0 && <span className="text-sm text-muted-foreground">none</span>}
        </div>
        {editable && (
          <ReferenceInput
            options={data.holySites.filter((h) => !sites.includes(h.id))}
            placeholder="Add holy site…"
            onAdd={(v) => set({ holySites: [...sites, v] })}
            limit={60}
          />
        )}
      </FieldSet>
    )
  }

  const headerIcon = faith?.icon ?? null

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
          {kind === 'faith' && <Swatch hex={draft?.color ?? null} className="size-4 shrink-0" />}
          <span className="truncate">{def?.localizedName ?? id}</span>
          {dirty && (
            <span className="size-2 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
          )}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">{kind}</Badge>
          {def && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Open definition in text editor"
              onClick={() =>
                void openReferenceTarget(
                  () => window.ck3tools.locateRef(gameDir, modPath, replacePaths, kind, def.id),
                  def.id
                )
              }
            >
              <ExternalLink />
            </Button>
          )}
        </div>
      </div>

      <div ref={body} className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        {def === null && (
          <Alert>
            <AlertDescription>
              No definition found for <code className="font-mono">{id}</code> in the mod (or the
              game files it loads). {adherents.length} character
              {adherents.length === 1 ? '' : 's'} profess it; its metadata can&apos;t be edited
              until it&apos;s defined.
            </AlertDescription>
          </Alert>
        )}
        {def !== null && !def.inMod && (
          <Alert>
            <AlertDescription>
              Defined in the base game (<code className="font-mono">{def.file}</code>). Editing
              game files isn&apos;t supported — copy the definition into the mod to change it.
            </AlertDescription>
          </Alert>
        )}

        {draft && def && (
          <FieldSet className="gap-3.5">
            <FieldLegend variant="label" className="mb-0">
              Details
            </FieldLegend>
            <div className="flex items-start gap-4">
              {kind === 'faith' && (
                <IconTile url={headerIcon === null ? null : iconFor(headerIcon)} size={72} />
              )}
              <div className="min-w-0 flex-1 space-y-3.5">
                <div className="space-y-1.5">
                  {fieldLabel('ID')}
                  <Input type="text" value={def.id} disabled readOnly className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  {fieldLabel('Name')}
                  <Input
                    type="text"
                    value={def.localizedName ?? ''}
                    placeholder="not localized"
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    From localization key <code className="font-mono">{def.id}</code> — edit it in
                    the mod&apos;s localization files.
                  </p>
                </div>
              </div>
            </div>

            {kind === 'faith' && (
              <>
                {colorField(faith!.color)}
                {iconField('Icon', draft.icon, (v) => set({ icon: v }))}
                {iconField('Reformed icon', draft.reformedIcon, (v) => set({ reformedIcon: v }))}
                {textField(
                  'Religious head',
                  draft.religiousHead,
                  (v) => set({ religiousHead: v }),
                  'none (decentralized)'
                )}
                <div className="space-y-1.5">
                  {fieldLabel('Religion')}
                  {/* Read-only: a faith lives inside its religion's block, so
                      changing this would mean moving the block, not a scalar */}
                  <ReferenceDisplay
                    value={faith!.religion}
                    name={parentReligion?.localizedName ?? null}
                    onNavigate={(v) => onOpenRow('religion', v)}
                  />
                </div>
              </>
            )}

            {kind === 'religion' && (
              <>
                <div className="space-y-1.5">
                  {fieldLabel('Family')}
                  <ReferenceInput
                    value={draft.family}
                    onChange={(v) => set({ family: v })}
                    options={data.families}
                    placeholder="none"
                    disabled={!editable}
                  />
                </div>
                {textField('Graphical faith', draft.graphicalFaith, (v) =>
                  set({ graphicalFaith: v })
                )}
                {textField('Piety icon group', draft.pietyIconGroup, (v) =>
                  set({ pietyIconGroup: v })
                )}
              </>
            )}
          </FieldSet>
        )}

        {draft && def && kind === 'faith' && holySitesField()}

        {draft && def && (
          <FieldSet className="gap-3.5">
            <FieldLegend variant="label" className="mb-0">
              Doctrines &amp; tenets
            </FieldLegend>
            <DoctrineEditor
              groups={data.groups}
              doctrines={draft.doctrines}
              inheritedFrom={
                kind === 'faith' && parentReligion !== null
                  ? {
                      label: parentReligion.localizedName ?? parentReligion.id,
                      doctrines: parentReligion.doctrines
                    }
                  : undefined
              }
              ungrouped={data.ungroupedDoctrines}
              disabled={!editable}
              onChange={(doctrines) => set({ doctrines })}
              locate={locateDoctrine}
            />
          </FieldSet>
        )}

        {kind === 'religion' && (
          <FieldSet className="gap-3.5">
            <FieldLegend variant="label" className="mb-0">
              Faiths · {faiths.length}
            </FieldLegend>
            {faiths.length === 0 ? (
              <p className="text-sm text-muted-foreground">This religion defines no faiths.</p>
            ) : (
              <div>
                {faiths.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => onOpenRow('faith', f.id)}
                  >
                    <Swatch hex={f.color?.hex ?? null} className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">
                      {f.localizedName ?? (
                        <span className="font-mono text-muted-foreground">{f.id}</span>
                      )}
                    </span>
                    <span className="text-xs whitespace-nowrap text-muted-foreground">
                      {adherentsOfFaith(data, f.id).length}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            )}
          </FieldSet>
        )}

        <FieldSet className="gap-3.5">
          <FieldLegend variant="label" className="mb-0">
            Adherents · {adherents.length}
          </FieldLegend>
          {adherents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No character in this mod&apos;s history professes {kind === 'faith' ? 'it' : 'any of its faiths'}.
            </p>
          ) : (
            <div>
              {adherents.map((a) => (
                <button
                  key={`${a.file}:${a.id}`}
                  type="button"
                  className="group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                  title={`${a.id} — ${a.file}`}
                  onClick={() => onOpenCharacter(a.id, a.file)}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {a.name ?? <span className="font-mono text-muted-foreground">{a.id}</span>}
                  </span>
                  {kind === 'religion' && (
                    <span className="truncate font-mono text-xs text-muted-foreground">
                      {a.faith}
                    </span>
                  )}
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </FieldSet>

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

/** A faith's color as a round chip; hatched when the value couldn't be resolved. */
export function Swatch({
  hex,
  className
}: {
  hex: string | null
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      title={hex ?? 'no color'}
      className={cn('inline-block rounded-full border border-border/60', className)}
      style={
        hex
          ? { backgroundColor: hex }
          : {
              backgroundImage:
                'repeating-linear-gradient(45deg, var(--muted) 0 3px, transparent 3px 6px)'
            }
      }
    />
  )
}

/**
 * A faith icon at a fixed size. Hidden rather than dropped while the batch
 * fetch is in flight, so the fields around it don't shift once icons arrive.
 */
function IconTile({
  url,
  size
}: {
  url: string | null | undefined
  size: number
}): React.JSX.Element {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="size-full object-contain" />
      ) : (
        <span className="text-[10px] text-muted-foreground">{url === null ? '—' : ''}</span>
      )}
    </span>
  )
}
