import { useEffect, useMemo, useRef, useState } from 'react'
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
import type { Column, Row, SortFn } from '@tanstack/react-table'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Church, FilterX, Sparkles } from 'lucide-react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import DebouncedInput from '../components/DebouncedInput'
import FaithDetailPanel, { Swatch } from '../components/FaithDetailPanel'
import ReferenceDisplay from '../components/ReferenceDisplay'
import ReferenceInput from '../components/ReferenceInput'
import { Badge } from '@/components/ui/badge'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { buildRows, normId } from '@/lib/faithView'
import type { FaithListRow } from '@/lib/faithView'
import type { ReligionData } from '@shared/types'

/** Badge for a row's kind: a filled church for a religion, an outline one for a faith. */
function KindBadge({ kind }: { kind: 'religion' | 'faith' }): React.JSX.Element {
  const isReligion = kind === 'religion'
  return (
    <Badge
      variant="outline"
      className={
        isReligion
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400'
      }
    >
      {isReligion ? <Church className="fill-current" /> : <Sparkles />}
      {isReligion ? 'Religion' : 'Faith'}
    </Badge>
  )
}

/** Which control a column renders in the filter row under its header. */
interface FaithColumnMeta {
  filter: 'text' | 'kind' | 'parent' | 'none'
}

const features = tableFeatures({
  columnFilteringFeature,
  columnFacetingFeature,
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  // Faceting feeds the parent picker the values actually present in the data;
  // its facets ignore its own filter, so its options stay put while the other
  // columns narrow them.
  facetedRowModel: createFacetedRowModel(),
  facetedUniqueValues: createFacetedUniqueValues(),
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as FaithColumnMeta,
  filterFns,
  sortFns
})

type Features = typeof features

/** Sort ids like numbers where they contain digits. */
function numericAware(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : -1
  if (b === null) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

const bySortableString: SortFn<Features, FaithListRow> = (
  rowA: Row<Features, FaithListRow>,
  rowB: Row<Features, FaithListRow>,
  columnId: string
) => numericAware(rowA.getValue<string | null>(columnId), rowB.getValue<string | null>(columnId))

const columnHelper = createColumnHelper<Features, FaithListRow>()

const columns = columnHelper.columns([
  columnHelper.accessor('kind', {
    header: 'Kind',
    filterFn: 'equalsString',
    meta: { filter: 'kind' },
    cell: (info) => <KindBadge kind={info.getValue()} />
  }),
  columnHelper.accessor('id', {
    header: 'ID',
    sortFn: bySortableString,
    filterFn: 'includesString',
    meta: { filter: 'text' },
    cell: (info) => (
      <span className="flex items-center gap-2">
        {info.row.original.kind === 'faith' && (
          <Swatch hex={info.row.original.color} className="size-3 shrink-0" />
        )}
        <span className="truncate font-mono">{info.getValue()}</span>
      </span>
    )
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    sortFn: bySortableString,
    filterFn: 'includesString',
    meta: { filter: 'text' },
    cell: (info) => (
      <>
        {info.getValue() ?? <em className="text-muted-foreground">—</em>}
        {!info.row.original.defined && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            undefined
          </Badge>
        )}
        {info.row.original.defined && !info.row.original.inMod && (
          <Badge variant="outline" className="ml-2 text-[10px]">
            game
          </Badge>
        )}
      </>
    )
  }),
  columnHelper.accessor('parent', {
    header: 'Religion / family',
    sortFn: bySortableString,
    filterFn: 'equalsString',
    meta: { filter: 'parent' }
    // Cell rendering is overridden in the body: it needs openRow to navigate.
  }),
  columnHelper.accessor('faiths', {
    header: 'Faiths',
    meta: { filter: 'none' },
    enableColumnFilter: false,
    cell: (info) =>
      info.row.original.kind === 'religion' ? (
        info.getValue()
      ) : (
        <em className="text-muted-foreground">—</em>
      )
  }),
  columnHelper.accessor('adherents', {
    header: 'Adherents',
    meta: { filter: 'none' },
    enableColumnFilter: false,
    cell: (info) => info.getValue()
  })
])

interface ColumnFilterProps {
  column: Column<Features, FaithListRow>
  /** Display name for a religion or family id, so the picker can offer "Name (id)" */
  nameOf: (id: string) => string | null
}

/** The filter control rendered under a column header. */
function ColumnFilter({ column, nameOf }: ColumnFilterProps): React.JSX.Element | null {
  const kind = column.columnDef.meta?.filter ?? 'text'
  const value = (column.getFilterValue() as string | undefined) ?? ''
  const facets = kind === 'parent' ? column.getFacetedUniqueValues() : null

  const options = useMemo(
    () =>
      facets === null
        ? []
        : [...facets.keys()]
            .filter((v): v is string => typeof v === 'string' && v !== '')
            .sort(numericAware)
            .map((id) => ({ id, name: nameOf(id) })),
    [facets, nameOf]
  )

  if (kind === 'none') return null

  if (kind === 'kind') {
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        className="font-normal"
        value={value === '' ? 'all' : value}
        onValueChange={(v) => v && column.setFilterValue(v === 'all' ? '' : v)}
        aria-label="Filter by kind"
      >
        <ToggleGroupItem value="all">All</ToggleGroupItem>
        <ToggleGroupItem value="religion">Religions</ToggleGroupItem>
        <ToggleGroupItem value="faith">Faiths</ToggleGroupItem>
      </ToggleGroup>
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
    />
  )
}

interface Selection {
  kind: 'religion' | 'faith'
  id: string
}

export default function FaithEditorPage(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const [data, setData] = useState<ReligionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [iconNames, setIconNames] = useState<string[]>([])
  /** Hide the base game's definitions, leaving only what the mod defines */
  const [modOnly, setModOnly] = useState(false)
  // Which row is open lives in the URL, not in state, so opening one pushes a
  // history entry and the mouse "back" button returns to the list.
  const search = useSearch({ from: '/faiths' })
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'faith-editor-detail',
    panelIds: ['list', 'detail'],
    onlySaveAfterUserInteractions: true
  })

  const modPath = selectedMod?.path ?? null
  const gameDir = settings?.gameDir ?? null
  const replacePaths = useMemo(() => selectedMod?.replacePaths ?? [], [selectedMod])

  const openRow = (kind: 'religion' | 'faith', id: string): void => {
    void navigate({ to: '/faiths', search: { id, kind } })
    // Give the list and the form the full width: fold the tools sidebar away
    if (isMobile) setOpenMobile(false)
    else setOpen(false)
  }

  // Closing replaces rather than pushes, so "back" from the list doesn't drop
  // straight back into the row that was just closed.
  const closeRow = (): void => {
    void navigate({ to: '/faiths', search: {}, replace: true })
  }

  const reload = (): void => {
    if (!modPath) {
      setData(null)
      return
    }
    setLoading(true)
    window.ck3tools
      .getReligionData(gameDir, modPath, replacePaths)
      .then(setData)
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [modPath])

  // Switching mods invalidates the open row, but only on a real change: on the
  // first render the URL may already carry a deep link that must survive.
  const prevModPath = useRef(modPath)
  useEffect(() => {
    if (prevModPath.current !== modPath) {
      prevModPath.current = modPath
      closeRow()
    }
    if (!modPath) {
      setIconNames([])
      return
    }
    window.ck3tools.listFaithIcons(gameDir, modPath, replacePaths).then(setIconNames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath])

  /**
   * Display name for a religion id (a faith's parent) or a family id (a
   * religion's), matched lowercased like every other id in the app.
   */
  const referenceName = useMemo(() => {
    const names = new Map<string, string>()
    for (const r of data?.religions ?? []) {
      if (r.localizedName !== null) names.set(normId(r.id), r.localizedName)
    }
    for (const f of data?.families ?? []) {
      if (f.name !== null) names.set(normId(f.id), f.name)
    }
    return (id: string): string | null => names.get(normId(id)) ?? null
  }, [data])

  // Religions lead their own faiths, and the biggest congregations lead the
  // rest. The table's own sorting layers on top when a header is clicked.
  const rows = useMemo(() => {
    const all = data ? buildRows(data) : []
    const visible = modOnly ? all.filter((r) => r.inMod || !r.defined) : all
    return visible.sort(
      (a, b) =>
        Number(b.kind === 'religion') - Number(a.kind === 'religion') ||
        b.adherents - a.adherents ||
        numericAware(a.id, b.id)
    )
  }, [data, modOnly])

  const table = useTable({
    features,
    columns,
    data: rows,
    globalFilterFn: (row, columnId, filterValue) =>
      String(row.getValue(columnId) ?? '')
        .toLowerCase()
        .includes(String(filterValue).toLowerCase()),
    getRowId: (r: FaithListRow) => `${r.kind}:${normId(r.id)}`
  })

  const globalFilter = (table.state.globalFilter as string | undefined) ?? ''
  const filtered = globalFilter !== '' || table.state.columnFilters.length > 0
  const visibleRows = table.getRowModel().rows

  const clearFilters = (): void => {
    table.resetColumnFilters(true)
    table.setGlobalFilter('')
  }

  // Resolve the id in the URL against the scan. The caller's `kind` is trusted
  // when it matches, but falls back to the other list rather than erroring.
  const selected: Selection | null = useMemo(() => {
    if (!search.id || !data) return null
    const norm = normId(search.id)
    const has = {
      religion: data.religions.some((r) => normId(r.id) === norm),
      faith:
        data.faiths.some((f) => normId(f.id) === norm) ||
        data.adherents.some((a) => normId(a.faith) === norm)
    }
    const preferred = search.kind ?? 'faith'
    const other = preferred === 'faith' ? 'religion' : 'faith'
    const kind = has[preferred] ? preferred : has[other] ? other : null
    return kind === null ? null : { kind, id: search.id }
  }, [search.id, search.kind, data])

  // An id that survives the scan but matches nothing (e.g. a deep link from a
  // character whose faith isn't defined) falls back to the list with a toast.
  useEffect(() => {
    if (!search.id || !data || selected) return
    toast.error(`"${search.id}" isn't a religion or faith in ${selectedMod?.name ?? 'this mod'}`)
    closeRow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.id, data, selected])

  const openCharacter = (id: string, file: string): void => {
    void navigate({ to: '/characters', search: { file, id } })
  }

  if (!selectedMod) {
    return (
      <div className="max-w-4xl space-y-5 p-7">
        <header>
          <h1 className="text-2xl font-semibold">Faith Editor</h1>
        </header>
        <ModPicker />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-7 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Faith Editor</h1>
      </header>

      {!loading && rows.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No religions or faiths found for {selectedMod.name} in{' '}
              <code className="font-mono">common/religion/religion_types</code>
              {modOnly ? ' that the mod defines.' : ', and no character references one.'}
            </p>
          </CardContent>
        </Card>
      )}

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
      >
        <ResizablePanel id="list" minSize={360} className="flex min-h-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              spacing={0}
              value={modOnly ? 'mod' : 'all'}
              onValueChange={(v) => v && setModOnly(v === 'mod')}
              aria-label="Which definitions to list"
            >
              <ToggleGroupItem value="mod">This mod</ToggleGroupItem>
              <ToggleGroupItem value="all">With base game</ToggleGroupItem>
            </ToggleGroup>
            <div className="ml-auto flex items-center gap-3">
              <DebouncedInput
                className="w-64"
                type="search"
                placeholder="Filter by id, name, or religion…"
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
                {loading ? 'Loading…' : `${visibleRows.length} / ${rows.length}`}
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((hg) => (
                  <TableRow key={hg.id} className="hover:bg-transparent">
                    {hg.headers.map((header) => (
                      <TableHead
                        key={header.id}
                        className="sticky top-0 z-10 h-auto border-b bg-card py-1.5 align-top"
                      >
                        <div className="flex flex-col items-stretch gap-1">
                          <button
                            type="button"
                            className="cursor-pointer self-start select-none hover:text-primary"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                          </button>
                          <ColumnFilter column={header.column} nameOf={referenceName} />
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {visibleRows.map((row) => (
                  <TableRow
                    key={row.id}
                    className={cn(
                      'cursor-pointer',
                      selected?.kind === row.original.kind &&
                        normId(selected.id) === normId(row.original.id) &&
                        'bg-muted'
                    )}
                    onClick={() => openRow(row.original.kind, row.original.id)}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell
                        key={cell.id}
                        className={cn(
                          'max-w-70 truncate',
                          cell.column.id === 'parent'
                            ? 'max-w-50'
                            : cell.column.id === 'id'
                              ? 'max-w-60'
                              : undefined
                        )}
                      >
                        {cell.column.id === 'parent' ? (
                          <ReferenceDisplay
                            value={row.original.parent}
                            name={
                              row.original.parent === null
                                ? null
                                : referenceName(row.original.parent)
                            }
                            onNavigate={
                              row.original.kind === 'faith'
                                ? (v) => openRow('religion', v)
                                : undefined
                            }
                          />
                        ) : (
                          flexRender(cell.column.columnDef.cell, cell.getContext())
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </ResizablePanel>
        {selected && data && modPath && (
          <>
            <ResizableHandle withHandle className="mx-2 bg-transparent hover:bg-border" />
            <ResizablePanel
              id="detail"
              defaultSize={440}
              minSize={340}
              maxSize={760}
              className="flex min-h-0 flex-col"
            >
              <FaithDetailPanel
                kind={selected.kind}
                id={selected.id}
                data={data}
                modPath={modPath}
                gameDir={gameDir}
                replacePaths={replacePaths}
                iconNames={iconNames}
                onOpenRow={openRow}
                onOpenCharacter={openCharacter}
                onSaved={reload}
                onClose={closeRow}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
