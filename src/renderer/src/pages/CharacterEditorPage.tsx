import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  columnFacetingFeature,
  columnFilteringFeature,
  createColumnHelper,
  createFacetedRowModel,
  createFacetedUniqueValues,
  createFilteredRowModel,
  createSortedRowModel,
  filterFns,
  flexRender,
  globalFilteringFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable
} from '@tanstack/react-table'
import type { Column, FilterFn, Row, SortFn } from '@tanstack/react-table'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { FilterX, Plus, Star } from 'lucide-react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import CharacterCreatePanel from '../components/CharacterCreatePanel'
import CharacterDetailPanel from '../components/CharacterDetailPanel'
import DateRangeFilterField from '../components/DateRangeFilterField'
import DebouncedInput from '../components/DebouncedInput'
import ReferenceInput from '../components/ReferenceInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup
} from '@/components/ui/resizable'
import { useSidebar } from '@/components/ui/sidebar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCalendarDate, matchesDateRange } from '@/lib/ck3Date'
import type { DateRangeFilter } from '@/lib/ck3Date'
import { yearOf } from '@/lib/familyTree'
import type {
  AppSettings,
  CalendarConfig,
  CharacterDetail,
  CharacterDraft,
  CharacterRef,
  CharacterSummary,
  ReferenceData
} from '@shared/types'
import type { CharacterSearch } from '../router'

const RECENTS_CAP = 10
const RECENTS_COLLAPSED = 5

const sameChar = (a: CharacterRef, b: { file: string; id: string }): boolean =>
  a.file === b.file && a.id === b.id

/** Which control a column renders in the filter row under its header. */
interface CharacterColumnMeta {
  filter: 'text' | 'dynasty' | 'file' | 'birth'
}

const features = tableFeatures({
  columnFilteringFeature,
  columnFacetingFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  // Faceting feeds the reference pickers the values actually present in the
  // data; each column's facets ignore its own filter, so its options stay put
  // while the other columns narrow them.
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as CharacterColumnMeta,
  filterFns,
  sortFns
})

type Features = typeof features

/** Sort ids and dates like numbers ("219" < "1002", "900.1.1" < "2410.1.1"), text otherwise. */
function numericAware(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : -1
  if (b === null) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

const bySortableString: SortFn<Features, CharacterSummary> = (
  rowA: Row<Features, CharacterSummary>,
  rowB: Row<Features, CharacterSummary>,
  columnId: string
) => numericAware(rowA.getValue<string | null>(columnId), rowB.getValue<string | null>(columnId))

/** Before/after/between over the raw file date, whatever the column displays. */
const byDateRange: FilterFn<Features, CharacterSummary> = (
  row: Row<Features, CharacterSummary>,
  columnId: string,
  filterValue: unknown
) => matchesDateRange(row.getValue<string | null>(columnId), filterValue as DateRangeFilter)

const columnHelper = createColumnHelper<Features, CharacterSummary>()

const buildColumns = (calendar: CalendarConfig | null) => columnHelper.columns([
  columnHelper.accessor('id', {
    header: 'ID',
    sortFn: bySortableString,
    filterFn: 'includesString',
    meta: { filter: 'text' },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    filterFn: 'includesString',
    meta: { filter: 'text' },
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">unnamed</em>
  }),
  columnHelper.accessor('dynasty', {
    header: 'Dynasty',
    sortFn: bySortableString,
    filterFn: 'equalsString',
    meta: { filter: 'dynasty' },
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">—</em>
  }),
  columnHelper.accessor('birth', {
    header: 'Birth',
    sortFn: bySortableString,
    filterFn: byDateRange,
    meta: { filter: 'birth' },
    cell: (info) => {
      const raw = info.getValue()
      if (raw === null) return <em className="text-muted-foreground">—</em>
      const converted = formatCalendarDate(raw, calendar)
      return converted === null ? (
        raw
      ) : (
        <>
          {raw} <span className="text-muted-foreground">({converted})</span>
        </>
      )
    }
  }),
  columnHelper.accessor('file', {
    header: 'File',
    filterFn: 'equalsString',
    meta: { filter: 'file' },
    cell: (info) => <span className="font-mono text-muted-foreground">{info.getValue()}</span>
  })
])

interface ColumnFilterProps {
  column: Column<Features, CharacterSummary>
  modPath: string | null
  gameDir: string | null
  replacePaths: string[]
  calendar: CalendarConfig | null
  /** Display name for a dynasty/house id, so the picker can offer "Name (id)" */
  nameOf: (id: string) => string | null
}

/** Mirrors `charactersDir` in the main process, which the renderer can't call. */
const characterFilePath = (modPath: string, file: string): string =>
  [modPath, 'history', 'characters', file].join('\\')

/** The filter control rendered under a column header. */
function ColumnFilter({
  column,
  modPath,
  gameDir,
  replacePaths,
  calendar,
  nameOf
}: ColumnFilterProps): React.JSX.Element {
  const kind = column.columnDef.meta?.filter ?? 'text'
  const raw = column.getFilterValue()
  const value = kind === 'birth' ? '' : ((raw as string | undefined) ?? '')
  const facets = kind === 'dynasty' || kind === 'file' ? column.getFacetedUniqueValues() : null

  // History files have no names of their own; dynasty values (which may name
  // either a dynasty or a house) get theirs from the reference data.
  const options = useMemo(
    () =>
      facets === null
        ? []
        : [...facets.keys()]
            .filter((v): v is string => typeof v === 'string' && v !== '')
            .sort(numericAware)
            .map((id) => ({ id, name: kind === 'file' ? null : nameOf(id) })),
    [facets, kind, nameOf]
  )

  if (kind === 'birth') {
    return (
      <DateRangeFilterField
        className="font-normal"
        value={raw as DateRangeFilter | undefined}
        onChange={(v) => column.setFilterValue(v)}
        calendar={calendar}
      />
    )
  }

  if (kind === 'text') {
    return (
      <DebouncedInput
        className="font-normal"
        type="search"
        placeholder="Filter…"
        value={value}
        onChange={(v) => column.setFilterValue(v)}
      />
    )
  }

  return (
    <ReferenceInput
      className="font-normal"
      value={value === '' ? null : value}
      onChange={(v) => column.setFilterValue(v ?? '')}
      options={options}
      placeholder="Any"
      followTitle={
        kind === 'file' ? 'Open this file in text editor' : 'Open definition in text editor'
      }
      locate={async (v) =>
        kind === 'file'
          ? modPath === null
            ? null
            : { path: characterFilePath(modPath, v), line: 1, inMod: true }
          : window.ck3tools.locateRef(gameDir, modPath, replacePaths, 'dynasty', v)
      }
    />
  )
}

export default function CharacterEditorPage(): React.JSX.Element {
  const { settings, selectedMod, updateSettings } = useApp()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [refData, setRefData] = useState<ReferenceData | null>(null)
  /** Existing .txt files under history/characters; null until scanned */
  const [characterFiles, setCharacterFiles] = useState<string[] | null>(null)
  const [showAllRecents, setShowAllRecents] = useState(false)
  // Which character is open lives in the URL, not in state, so opening one
  // pushes a history entry and the mouse "back" button returns to the list.
  // `create` opens the new-character panel instead, with the other search
  // fields as prefills (so e.g. "Add child" deep-links with the parent set).
  const search = useSearch({ from: '/characters' })
  const navigate = useNavigate()
  const creating = search.create === true
  const selected: { file: string; id: string } | null =
    !creating && search.file && search.id ? { file: search.file, id: search.id } : null
  // Remembers the character list / detail split across sessions (localStorage)
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'character-editor-detail',
    panelIds: ['list', 'detail'],
    onlySaveAfterUserInteractions: true
  })

  const modPath = selectedMod?.path ?? null
  const modKey = selectedMod?.file ?? null
  const calendar = selectedMod?.profile?.calendar ?? null
  const columns = useMemo(() => buildColumns(calendar), [calendar])

  /** The character list as reference options, for the father/mother pickers. */
  const characterRefs = useMemo(
    () => characters.map((c) => ({ id: c.id, name: c.name })),
    [characters]
  )
  /**
   * Display name for a lineage id. A character's `dynasty` value may name
   * either a dynasty or a house, and real files reference `Phokus` as
   * `phokus`, so both lists are pooled under lowercased keys.
   */
  const lineageName = useMemo(() => {
    const names = new Map<string, string>()
    for (const entry of [...(refData?.dynasties ?? []), ...(refData?.houses ?? [])]) {
      if (entry.name !== null) names.set(entry.id.toLowerCase(), entry.name)
    }
    return (id: string): string | null => names.get(id.toLowerCase()) ?? null
  }, [refData])
  const recents = (modKey && settings?.recentCharacters?.[modKey]) || []
  const favorites = (modKey && settings?.favoriteCharacters?.[modKey]) || []
  const drafts = (modKey && settings?.draftCharacters?.[modKey]) || {}

  // Ref so persistDraft can stay referentially stable — the panel's persist
  // effect depends on it, and a fresh closure per render would re-arm it.
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const persistDraft = useCallback(
    (file: string, id: string, entry: CharacterDraft | null): void => {
      if (!modKey) return
      const all = settingsRef.current?.draftCharacters ?? {}
      const forMod = { ...(all[modKey] ?? {}) }
      const key = `${file}:${id}`
      if (entry === null) {
        if (!(key in forMod)) return
        delete forMod[key]
      } else {
        forMod[key] = entry
      }
      void updateSettings({ draftCharacters: { ...all, [modKey]: forMod } })
    },
    [modKey, updateSettings]
  )

  const saveList = (
    key: 'recentCharacters' | 'favoriteCharacters',
    list: CharacterRef[]
  ): void => {
    if (!modKey) return
    void updateSettings({ [key]: { ...(settings?.[key] ?? {}), [modKey]: list } })
  }

  const recordVisit = (ref: CharacterRef): void => {
    saveList('recentCharacters', [ref, ...recents.filter((r) => !sameChar(r, ref))].slice(0, RECENTS_CAP))
  }

  const isFavorite = (c: { file: string; id: string }): boolean =>
    favorites.some((r) => sameChar(r, c))

  const toggleFavorite = (ref: CharacterRef): void => {
    saveList(
      'favoriteCharacters',
      isFavorite(ref) ? favorites.filter((r) => !sameChar(r, ref)) : [...favorites, ref]
    )
  }

  const openCharacter = (ref: CharacterRef): void => {
    void navigate({ to: '/characters', search: { file: ref.file, id: ref.id } })
    // Give the detail panel the full width: fold the tools sidebar away if it's open.
    if (isMobile) setOpenMobile(false)
    else setOpen(false)
  }

  const openCreate = (prefill: CharacterSearch = {}): void => {
    void navigate({ to: '/characters', search: { ...prefill, create: true } })
    if (isMobile) setOpenMobile(false)
    else setOpen(false)
  }

  // Closing replaces rather than pushes, so "back" from the list doesn't drop
  // straight back into the character that was just closed.
  const closeCharacter = (): void => {
    void navigate({ to: '/characters', search: {}, replace: true })
  }

  /** Point recents/favorites at a character's new id after a save renames it. */
  const remapRefs = (file: string, oldId: string, newId: string, name: string | null): void => {
    if (oldId === newId) return
    const remap = (list: CharacterRef[]): CharacterRef[] =>
      list.map((r) => (sameChar(r, { file, id: oldId }) ? { file, id: newId, name } : r))
    const patch: Partial<AppSettings> = {}
    if (modKey && recents.some((r) => sameChar(r, { file, id: oldId })))
      patch.recentCharacters = { ...(settings?.recentCharacters ?? {}), [modKey]: remap(recents) }
    if (modKey && favorites.some((r) => sameChar(r, { file, id: oldId })))
      patch.favoriteCharacters = {
        ...(settings?.favoriteCharacters ?? {}),
        [modKey]: remap(favorites)
      }
    if (Object.keys(patch).length > 0) void updateSettings(patch)
  }

  const reload = (): void => {
    if (!modPath) {
      setCharacters([])
      setCharacterFiles(null)
      return
    }
    setLoading(true)
    window.ck3tools
      .listCharacters(modPath)
      .then(setCharacters)
      .finally(() => setLoading(false))
    window.ck3tools.listCharacterFiles(modPath).then(setCharacterFiles)
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [modPath])

  // Switching mods invalidates the open character, but only on a real change:
  // on the first render the URL may already carry a deep link that must survive.
  const prevModPath = useRef(modPath)
  useEffect(() => {
    if (prevModPath.current !== modPath) {
      prevModPath.current = modPath
      closeCharacter()
    }
    setShowAllRecents(false)
    if (!modPath) {
      setRefData(null)
      return
    }
    window.ck3tools
      .getReferenceData(settings?.gameDir ?? null, modPath, selectedMod?.replacePaths ?? [])
      .then(setRefData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath])

  // Whichever character is open — clicked here, or deep-linked from another
  // tool — is recorded as a visit once the list knows its name.
  useEffect(() => {
    if (!selected) return
    const known = characters.find((c) => c.file === selected.file && c.id === selected.id)
    recordVisit({ ...selected, name: known?.name ?? null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.file, selected?.id, modKey, characters])

  const table = useTable({
    features,
    columns,
    data: characters,
    globalFilterFn: (row, columnId, filterValue) =>
      String(row.getValue(columnId) ?? '')
        .toLowerCase()
        .includes(String(filterValue).toLowerCase()),
    getRowId: (c: CharacterSummary) => `${c.file}:${c.id}`
  })

  const globalFilter = (table.state.globalFilter as string | undefined) ?? ''
  const filtered = globalFilter !== '' || table.state.columnFilters.length > 0

  const clearFilters = (): void => {
    table.resetColumnFilters(true)
    table.setGlobalFilter('')
  }

  if (!selectedMod) {
    return (
      <div className="max-w-4xl space-y-5 p-7">
        <header>
          <h1 className="text-2xl font-semibold">Character Editor</h1>
        </header>
        <ModPicker />
      </div>
    )
  }

  const rows = table.getRowModel().rows

  const byKey = new Map(characters.map((c) => [`${c.file}:${c.id}`, c]))
  // Ids are unique across a mod's history files, so parent refs resolve by id alone
  const byId = new Map(characters.map((c) => [c.id, c]))
  // Children are derived: whoever names the selected character as a parent,
  // oldest first (undated last).
  const childCharacters = selected
    ? characters
        .filter((c) => c.father === selected.id || c.mother === selected.id)
        .sort((a, b) => {
          const ya = yearOf(a.birth)
          const yb = yearOf(b.birth)
          if (ya !== yb) return ya === null ? 1 : yb === null ? -1 : ya - yb
          return a.id.localeCompare(b.id)
        })
    : []

  // Field values the create panel starts from, seeded by the URL (only keys
  // actually present — an undefined would clobber the panel's empty defaults)
  const createPrefill: Partial<CharacterDetail> = {}
  if (creating) {
    if (search.name) createPrefill.name = search.name
    if (search.birth) createPrefill.birth = search.birth
    if (search.culture) createPrefill.culture = search.culture
    if (search.faith) createPrefill.faith = search.faith
    if (search.father) createPrefill.father = search.father
    if (search.mother) createPrefill.mother = search.mother
    if (search.dynasty) createPrefill.dynasty = search.dynasty
    if (search.house) createPrefill.house = search.house
  }

  // Hide refs to characters missing from the current scan without pruning them from settings
  const existing = (list: CharacterRef[]): CharacterRef[] =>
    loading || characters.length === 0
      ? list
      : list.filter((r) => byKey.has(`${r.file}:${r.id}`))

  const shownFavorites = existing(favorites)
  const shownRecents = existing(recents)
  const visibleRecents = showAllRecents ? shownRecents : shownRecents.slice(0, RECENTS_COLLAPSED)
  // Characters with unsaved drafts; entries carry the on-file id and file name
  const shownDrafts = existing(
    Object.values(drafts).map((e) => ({
      file: e.original.file,
      id: e.original.id,
      name: e.draft.name
    }))
  )

  const chip = (ref: CharacterRef): React.JSX.Element => {
    const label = byKey.get(`${ref.file}:${ref.id}`)?.name ?? ref.name ?? ref.id
    const active = selected !== null && sameChar(ref, selected)
    return (
      <Button
        key={`${ref.file}:${ref.id}`}
        variant="outline"
        size="xs"
        className={cn('max-w-56 rounded-full', active && 'border-primary/50 bg-muted')}
        title={`${ref.id} — ${ref.file}`}
        onClick={() => openCharacter(ref)}
      >
        {isFavorite(ref) && <Star className="fill-current text-amber-500" />}
        {`${ref.file}:${ref.id}` in drafts && (
          <span className="size-1.5 shrink-0 rounded-full bg-primary" title="Unsaved changes" />
        )}
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-7 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Character Editor</h1>
      </header>

      {(shownFavorites.length > 0 || shownRecents.length > 0 || shownDrafts.length > 0) && (
        <div className="space-y-1.5">
          {shownFavorites.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Favorites
              </span>
              {shownFavorites.map(chip)}
            </div>
          )}
          {shownRecents.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Recent
              </span>
              {visibleRecents.map(chip)}
              {shownRecents.length > RECENTS_COLLAPSED && (
                <Button variant="ghost" size="xs" onClick={() => setShowAllRecents((v) => !v)}>
                  {showAllRecents ? 'Show less' : `Show more (${shownRecents.length - RECENTS_COLLAPSED})`}
                </Button>
              )}
            </div>
          )}
          {shownDrafts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="w-16 shrink-0 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                Unsaved
              </span>
              {shownDrafts.map(chip)}
            </div>
          )}
        </div>
      )}

      {!loading && characters.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              No characters found in {selectedMod.name}&apos;s{' '}
              <code className="font-mono">history/characters</code> folder.
            </p>
            <Button size="sm" onClick={() => openCreate()}>
              <Plus />
              New character
            </Button>
          </CardContent>
        </Card>
      )}

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        {characters.length > 0 && (
          <ResizablePanel id="list" minSize={320} className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => openCreate()}>
                <Plus />
                New
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <DebouncedInput
                  className="w-72"
                  type="search"
                  placeholder="Filter by id, name, dynasty, or file…"
                  value={globalFilter}
                  onChange={(v) => table.setGlobalFilter(v)}
                />
                {filtered && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <FilterX />
                    Clear
                  </Button>
                )}
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {loading ? 'Loading…' : `${rows.length} / ${characters.length}`}
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card [&_[data-slot=table-container]]:overflow-visible">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="hover:bg-transparent">
                      <TableHead
                        className="sticky top-0 z-10 h-auto w-9 border-b bg-card"
                        aria-label="Favorite"
                      />
                      {hg.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="sticky top-0 z-10 h-auto border-b bg-card py-1.5 align-top"
                        >
                          <div className="flex flex-col items-stretch gap-1">
                            <button
                              type="button"
                              className="self-start cursor-pointer select-none hover:text-primary"
                              onClick={header.column.getToggleSortingHandler()}
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                            </button>
                            <ColumnFilter
                              column={header.column}
                              modPath={modPath}
                              gameDir={settings?.gameDir ?? null}
                              replacePaths={selectedMod.replacePaths}
                              calendar={calendar}
                              nameOf={lineageName}
                            />
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isSelected = selected !== null && `${selected.file}:${selected.id}` === row.id
                    return (
                      <TableRow
                        key={row.id}
                        className="group cursor-pointer"
                        data-state={isSelected ? 'selected' : undefined}
                        onClick={() =>
                          openCharacter({
                            file: row.original.file,
                            id: row.original.id,
                            name: row.original.name
                          })
                        }
                      >
                        <TableCell className="relative w-9 py-0 pr-0 pl-2">
                          {`${row.original.file}:${row.original.id}` in drafts && (
                            <span
                              className="absolute top-1/2 left-0.5 size-1.5 -translate-y-1/2 rounded-full bg-primary"
                              title="Unsaved changes"
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className={cn(
                              'text-muted-foreground opacity-40 group-hover:opacity-100 hover:text-amber-500',
                              isFavorite(row.original) && 'text-amber-500 opacity-100'
                            )}
                            title={isFavorite(row.original) ? 'Remove from favorites' : 'Add to favorites'}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleFavorite({
                                file: row.original.file,
                                id: row.original.id,
                                name: row.original.name
                              })
                            }}
                          >
                            <Star className={cn(isFavorite(row.original) && 'fill-current')} />
                          </Button>
                        </TableCell>
                        {row.getAllCells().map((cell) => (
                          <TableCell key={cell.id} className="max-w-70 truncate">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </ResizablePanel>
        )}
        {(selected || (creating && characterFiles !== null)) && modPath && (
          <>
            {characters.length > 0 && (
              <ResizableHandle
                withHandle
                className="mx-2 bg-transparent hover:bg-border"
              />
            )}
            <ResizablePanel
              id="detail"
              defaultSize={400}
              minSize={320}
              maxSize={720}
              className="flex min-h-0 flex-col"
            >
              {selected ? (
                <CharacterDetailPanel
                  modPath={modPath}
                  file={selected.file}
                  id={selected.id}
                  gameDir={settings?.gameDir ?? null}
                  replacePaths={selectedMod?.replacePaths ?? []}
                  calendar={calendar}
                  refData={refData}
                  characters={characterRefs}
                  childCharacters={childCharacters}
                  onNavigate={(id) => {
                    const target = byId.get(id)
                    if (!target) {
                      toast.error(`Character "${id}" isn't defined in ${selectedMod.name}`)
                      return
                    }
                    openCharacter({ file: target.file, id: target.id, name: target.name })
                  }}
                  onOpenLineage={(kind, id) =>
                    void navigate({ to: '/dynasties', search: { id, kind } })
                  }
                  onOpenCulture={(id) => void navigate({ to: '/cultures', search: { id } })}
                  onOpenFaith={(id) => void navigate({ to: '/faiths', search: { id, kind: 'faith' } })}
                  onCreateChild={openCreate}
                  storedDraft={drafts[`${selected.file}:${selected.id}`] ?? null}
                  onDraftChange={persistDraft}
                  onSaved={(file, newId) => {
                    if (selected) {
                      remapRefs(file, selected.id, newId, byKey.get(`${file}:${selected.id}`)?.name ?? null)
                    }
                    void navigate({ to: '/characters', search: { file, id: newId }, replace: true })
                    reload()
                  }}
                  onClose={closeCharacter}
                />
              ) : (
                <CharacterCreatePanel
                  // Remount when the prefills change, so a fresh deep link
                  // (e.g. Add child from another character) reseeds the form
                  key={JSON.stringify(search)}
                  modPath={modPath}
                  gameDir={settings?.gameDir ?? null}
                  replacePaths={selectedMod?.replacePaths ?? []}
                  calendar={calendar}
                  refData={refData}
                  characters={characterRefs}
                  characterFiles={characterFiles ?? []}
                  prefill={createPrefill}
                  initialFile={search.file ?? null}
                  onNavigate={(id) => {
                    const target = byId.get(id)
                    if (!target) {
                      toast.error(`Character "${id}" isn't defined in ${selectedMod.name}`)
                      return
                    }
                    openCharacter({ file: target.file, id: target.id, name: target.name })
                  }}
                  onOpenLineage={(kind, id) =>
                    void navigate({ to: '/dynasties', search: { id, kind } })
                  }
                  onOpenCulture={(id) => void navigate({ to: '/cultures', search: { id } })}
                  onOpenFaith={(id) => void navigate({ to: '/faiths', search: { id, kind: 'faith' } })}
                  onCreated={(file, id) => {
                    void navigate({ to: '/characters', search: { file, id }, replace: true })
                    reload()
                  }}
                  onClose={closeCharacter}
                />
              )}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
