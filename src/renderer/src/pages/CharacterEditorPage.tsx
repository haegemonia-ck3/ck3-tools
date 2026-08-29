import { useEffect, useState } from 'react'
import {
  columnFilteringFeature,
  createColumnHelper,
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
import type { Row, SortFn } from '@tanstack/react-table'
import { Star } from 'lucide-react'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import CharacterDetailPanel from '../components/CharacterDetailPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { AppSettings, CharacterRef, CharacterSummary, ReferenceData } from '@shared/types'

const RECENTS_CAP = 10
const RECENTS_COLLAPSED = 5

const sameChar = (a: CharacterRef, b: { file: string; id: string }): boolean =>
  a.file === b.file && a.id === b.id

const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
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

const columnHelper = createColumnHelper<Features, CharacterSummary>()

const columns = columnHelper.columns([
  columnHelper.accessor('id', {
    header: 'ID',
    sortFn: bySortableString,
    cell: (info) => <span className="font-mono">{info.getValue()}</span>
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">unnamed</em>
  }),
  columnHelper.accessor('dynasty', {
    header: 'Dynasty',
    sortFn: bySortableString,
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">—</em>
  }),
  columnHelper.accessor('birth', {
    header: 'Birth',
    sortFn: bySortableString,
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">—</em>
  }),
  columnHelper.accessor('file', {
    header: 'File',
    cell: (info) => <span className="font-mono text-muted-foreground">{info.getValue()}</span>
  })
])

export default function CharacterEditorPage(): React.JSX.Element {
  const { settings, selectedMod, updateSettings } = useApp()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ file: string; id: string } | null>(null)
  const [refData, setRefData] = useState<ReferenceData | null>(null)
  const [showAllRecents, setShowAllRecents] = useState(false)

  const modPath = selectedMod?.path ?? null
  const modKey = selectedMod?.file ?? null
  const recents = (modKey && settings?.recentCharacters?.[modKey]) || []
  const favorites = (modKey && settings?.favoriteCharacters?.[modKey]) || []

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
    setSelected({ file: ref.file, id: ref.id })
    recordVisit(ref)
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
      return
    }
    setLoading(true)
    window.ck3tools
      .listCharacters(modPath)
      .then(setCharacters)
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [modPath])

  useEffect(() => {
    setSelected(null)
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
  // Hide refs to characters missing from the current scan without pruning them from settings
  const existing = (list: CharacterRef[]): CharacterRef[] =>
    loading || characters.length === 0
      ? list
      : list.filter((r) => byKey.has(`${r.file}:${r.id}`))

  const shownFavorites = existing(favorites)
  const shownRecents = existing(recents)
  const visibleRecents = showAllRecents ? shownRecents : shownRecents.slice(0, RECENTS_COLLAPSED)

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
        <span className="truncate">{label}</span>
      </Button>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-7 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Character Editor</h1>
        <div className="flex items-center gap-3">
          <Input
            className="w-72"
            type="search"
            placeholder="Filter by id, name, dynasty, or file…"
            value={(table.state.globalFilter as string | undefined) ?? ''}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
          />
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {loading ? 'Loading…' : `${rows.length} / ${characters.length}`}
          </span>
        </div>
      </header>

      {(shownFavorites.length > 0 || shownRecents.length > 0) && (
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
        </div>
      )}

      {!loading && characters.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No characters found in {selectedMod.name}&apos;s{' '}
              <code className="font-mono">history/characters</code> folder.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex min-h-0 flex-1 gap-4">
        {characters.length > 0 && (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    <TableHead className="sticky top-0 z-10 w-9 bg-card" aria-label="Favorite" />
                    {hg.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="sticky top-0 z-10 cursor-pointer bg-card select-none hover:text-primary"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
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
                      <TableCell className="w-9 py-0 pr-0 pl-2">
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
        )}
        {selected && modPath && (
          <CharacterDetailPanel
            modPath={modPath}
            file={selected.file}
            id={selected.id}
            gameDir={settings?.gameDir ?? null}
            replacePaths={selectedMod?.replacePaths ?? []}
            refData={refData}
            onSaved={(file, newId) => {
              if (selected) {
                remapRefs(file, selected.id, newId, byKey.get(`${file}:${selected.id}`)?.name ?? null)
              }
              setSelected({ file, id: newId })
              reload()
            }}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </div>
  )
}
