import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, ExternalLink } from 'lucide-react'
import type { RefEntry, RefLocation, ReligionData, SaveResult } from '@shared/types'
import { SAVE_HOTKEY_LABEL, useFormHotkeys } from '../hooks/useFormHotkeys'
import { useFaithIcons } from '../useGameIcons'
import type { IconContext } from '../useGameIcons'
import DoctrineEditor from './DoctrineEditor'
import ReferenceBadge from './ReferenceBadge'
import ReferenceDisplay from './ReferenceDisplay'
import ReferenceInput, { openReferenceTarget } from './ReferenceInput'
import { idOnly } from './ReferenceLabel'
import { IconTile, Swatch } from './Swatch'
import FormSection from './FormSection'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { adherentsOfFaith, normId } from '@/lib/faithView'

/** How many holy sites CK3 lets a faith hold; over that the game ignores the rest. */
const HOLY_SITE_LIMIT = 5

/** The editable fields of a faith. */
interface FaithDraft {
  color: string | null
  icon: string | null
  reformedIcon: string | null
  religiousHead: string | null
  holySites: string[]
  doctrines: string[]
}

interface Props {
  id: string
  data: ReligionData
  modPath: string
  gameDir: string | null
  replacePaths: string[]
  /** Icon names available to the `icon =` fields, from the game and mod folders */
  iconNames: string[]
  /** Jump to the Religion Editor */
  onOpenReligion: (id: string) => void
  /** Jump to the character editor */
  onOpenCharacter: (id: string, file: string) => void
  /** Called after a successful save so the page can reload definitions */
  onSaved: () => void
  /** Leave the row and go back to the list (Esc) */
  onClose: () => void
}

export default function FaithDetailPanel({
  id,
  data,
  modPath,
  gameDir,
  replacePaths,
  iconNames,
  onOpenReligion,
  onOpenCharacter,
  onSaved,
  onClose
}: Props): React.JSX.Element {
  const faith = data.faiths.find((f) => normId(f.id) === normId(id)) ?? null

  const original: FaithDraft | null = faith
    ? {
        color: faith.color?.hex ?? null,
        icon: faith.icon,
        reformedIcon: faith.reformedIcon,
        religiousHead: faith.religiousHead,
        holySites: faith.holySites,
        doctrines: faith.doctrines
      }
    : null

  const [draft, setDraft] = useState<FaithDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  useEffect(() => {
    setDraft(original ? { ...original } : null)
    setError(null)
    // Re-derived from data on purpose: a reload after save re-seeds the draft
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data])

  // The "Saved ✓" flash must survive the post-save data reload (which re-runs
  // the reseed above), so it resets only when a different row is opened — and
  // a new row starts at the top of the form rather than wherever the last one
  // was scrolled to
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setSavedFlash(false)
    body.current?.scrollTo({ top: 0 })
  }, [id])

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

  const adherents = useMemo(() => adherentsOfFaith(data, id), [data, id])

  const editable = faith !== null && faith.inMod
  const dirty =
    draft !== null && original !== null && JSON.stringify(draft) !== JSON.stringify(original)

  const set = (patch: Partial<FaithDraft>): void => {
    if (!draft) return
    setDraft({ ...draft, ...patch })
    setSavedFlash(false)
  }

  const save = async (): Promise<void> => {
    if (!faith || !draft) return
    setSaving(true)
    setError(null)
    try {
      const result: SaveResult = await window.ck3tools.saveFaith(
        modPath,
        faith.file,
        faith.religion,
        faith.id,
        {
          color: draft.color,
          icon: draft.icon,
          reformedIcon: draft.reformedIcon,
          religiousHead: draft.religiousHead,
          doctrines: draft.doctrines,
          holySites: draft.holySites
        }
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

  const locateDoctrine = (v: string): Promise<RefLocation | null> =>
    window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'doctrine', v)

  const fieldLabel = (text: string): React.JSX.Element => (
    <Label className="text-xs tracking-wide text-muted-foreground uppercase">{text}</Label>
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

  const colorField = (): React.JSX.Element => {
    const current = faith!.color
    return (
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
  }

  const holySitesField = (): React.JSX.Element => {
    const sites = draft?.holySites ?? []
    return (
      <FormSection
        title={<>Holy sites · {sites.length}</>}
        legendClassName="flex-nowrap"
        action={
          sites.length > HOLY_SITE_LIMIT && (
            <Badge variant="outline" className="text-[10px] font-normal">
              over the game&apos;s limit of {HOLY_SITE_LIMIT}
            </Badge>
          )
        }
      >
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
      </FormSection>
    )
  }

  return (
    <Card className="flex h-full min-h-0 w-full min-w-0 flex-col gap-0 py-0">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-foreground">
          <Swatch hex={draft?.color ?? null} className="size-4 shrink-0" />
          <span className="truncate">{faith?.localizedName ?? id}</span>
          {dirty && (
            <span className="size-2 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
          )}
        </h2>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="secondary">faith</Badge>
          {faith && (
            <Button
              variant="ghost"
              size="icon-sm"
              title="Open definition in text editor"
              onClick={() =>
                void openReferenceTarget(
                  () =>
                    window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'faith', faith.id),
                  faith.id
                )
              }
            >
              <ExternalLink />
            </Button>
          )}
        </div>
      </div>

      <div ref={body} className="min-h-0 flex-1 space-y-8 overflow-y-auto p-4">
        {faith === null && (
          <Alert>
            <AlertDescription>
              No definition found for <code className="font-mono">{id}</code> in the mod (or the
              game files it loads). {adherents.length} character
              {adherents.length === 1 ? '' : 's'} profess it; its metadata can&apos;t be edited
              until it&apos;s defined.
            </AlertDescription>
          </Alert>
        )}
        {faith !== null && !faith.inMod && (
          <Alert>
            <AlertDescription>
              Defined in the base game (<code className="font-mono">{faith.file}</code>). Editing
              game files isn&apos;t supported — copy the definition into the mod to change it.
            </AlertDescription>
          </Alert>
        )}

        {draft && faith && (
          <FormSection title="Details">
            <div className="flex items-start gap-4">
              <IconTile url={faith.icon === null ? null : iconFor(faith.icon)} size={72} />
              <div className="min-w-0 flex-1 space-y-3.5">
                <div className="space-y-1.5">
                  {fieldLabel('ID')}
                  <Input type="text" value={faith.id} disabled readOnly className="font-mono" />
                </div>
                <div className="space-y-1.5">
                  {fieldLabel('Name')}
                  <Input
                    type="text"
                    value={faith.localizedName ?? ''}
                    placeholder="not localized"
                    disabled
                    readOnly
                  />
                  <p className="text-xs text-muted-foreground">
                    From localization key <code className="font-mono">{faith.id}</code> — edit it
                    in the mod&apos;s localization files.
                  </p>
                </div>
              </div>
            </div>

            {colorField()}
            {iconField('Icon', draft.icon, (v) => set({ icon: v }))}
            {iconField('Reformed icon', draft.reformedIcon, (v) => set({ reformedIcon: v }))}
            <div className="space-y-1.5">
              {fieldLabel('Religious head')}
              <Input
                type="text"
                value={draft.religiousHead ?? ''}
                placeholder="none (decentralized)"
                disabled={!editable}
                onChange={(e) =>
                  set({ religiousHead: e.target.value === '' ? null : e.target.value })
                }
              />
            </div>
            <div className="space-y-1.5">
              {fieldLabel('Religion')}
              {/* Read-only: a faith lives inside its religion's block, so
                  changing this would mean moving the block, not a scalar */}
              <ReferenceDisplay
                value={faith.religion}
                name={parentReligion?.localizedName ?? null}
                onNavigate={onOpenReligion}
              />
            </div>
          </FormSection>
        )}

        {draft && faith && holySitesField()}

        {draft && faith && (
          <FormSection title="Doctrines & tenets">
            <DoctrineEditor
              groups={data.groups}
              doctrines={draft.doctrines}
              inheritedFrom={
                parentReligion !== null
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
          </FormSection>
        )}

        <FormSection title={<>Adherents · {adherents.length}</>}>
          {adherents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No character in this mod&apos;s history professes it.
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
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          )}
        </FormSection>

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
