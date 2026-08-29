import { useEffect, useMemo, useState } from 'react'
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
import { ArrowLeft, FilterX } from 'lucide-react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import DebouncedInput from '../components/DebouncedInput'
import DynastyDetailPanel from '../components/DynastyDetailPanel'
import FamilyTree from '../components/FamilyTree'
import Reference from '../components/Reference'
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
import type { DynastyData, ReferenceData } from '@shared/types'
import {
  buildRows,
  buildTreeNodes,
  housesOfDynasty,
  makeAffiliationName,
  membersOfDynasty,
  membersOfHouse,
  normId
} from '@/lib/dynastyView'
import type { DynastyListRow } from '@/lib/dynastyView'

/**
 * Deterministic house id → color: an FNV-1a hash of the id picks a hue, spread
 * by the golden angle so similarly named houses don't land on similar hues.
 * Fixed OKLCH lightness/chroma keeps every hue legible in both themes.
 */
function houseColor(id: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  const hue = Math.round(((hash >>> 0) * 137.508) % 360)
  return `oklch(0.62 0.16 ${hue})`
}

/** Which control a column renders in the filter row under its header. */
interface DynastyColumnMeta {
  filter: 'text' | 'kind' | 'culture' | 'parent' | 'none'
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
  columnMeta: {} as DynastyColumnMeta,
  filterFns,
  sortFns
})

type Features = typeof features

/** Sort ids like numbers where they contain digits ("house_2" < "house_10"). */
function numericAware(a: string | null, b: string | null): number {
  if (a === null) return b === null ? 0 : -1
  if (b === null) return 1
  return a.localeCompare(b, undefined, { numeric: true })
}

const bySortableString: SortFn<Features, DynastyListRow> = (
  rowA: Row<Features, DynastyListRow>,
  rowB: Row<Features, DynastyListRow>,
  columnId: string
) => numericAware(rowA.getValue<string | null>(columnId), rowB.getValue<string | null>(columnId))

const columnHelper = createColumnHelper<Features, DynastyListRow>()

const columns = columnHelper.columns([
  columnHelper.accessor('kind', {
    header: 'Kind',
    filterFn: 'equalsString',
    meta: { filter: 'kind' },
    cell: (info) => (
      <Badge variant={info.getValue() === 'dynasty' ? 'secondary' : 'outline'}>
        {info.getValue()}
      </Badge>
    )
  }),
  columnHelper.accessor('id', {
    header: 'ID',
    sortFn: bySortableString,
    filterFn: 'includesString',
    meta: { filter: 'text' },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>
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
  columnHelper.accessor('culture', {
    header: 'Culture',
    sortFn: bySortableString,
    filterFn: 'equalsString',
    meta: { filter: 'culture' },
    cell: (info) => info.getValue() ?? <em className="text-muted-foreground">—</em>
  }),
  columnHelper.accessor('parent', {
    header: 'Parent',
    sortFn: bySortableString,
    filterFn: 'equalsString',
    meta: { filter: 'parent' },
    cell: (info) =>
      info.getValue() ? (
        <span className="font-mono">{info.getValue()}</span>
      ) : (
        <em className="text-muted-foreground">—</em>
      )
  }),
  columnHelper.accessor('members', {
    header: 'Members',
    meta: { filter: 'none' },
    enableColumnFilter: false,
    cell: (info) => info.getValue()
  })
])

interface ColumnFilterProps {
  column: Column<Features, DynastyListRow>
  gameDir: string | null
  modPath: string | null
  replacePaths: string[]
}

/** The filter control rendered under a column header. */
function ColumnFilter({
  column,
  gameDir,
  modPath,
  replacePaths
}: ColumnFilterProps): React.JSX.Element | null {
  const kind = column.columnDef.meta?.filter ?? 'text'
  const value = (column.getFilterValue() as string | undefined) ?? ''
  const facets = kind === 'culture' || kind === 'parent' ? column.getFacetedUniqueValues() : null

  const options = useMemo(
    () =>
      facets === null
        ? []
        : [...facets.keys()]
            .filter((v): v is string => typeof v === 'string' && v !== '')
            .sort(numericAware),
    [facets]
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
        <ToggleGroupItem value="dynasty">Dynasties</ToggleGroupItem>
        <ToggleGroupItem value="house">Houses</ToggleGroupItem>
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
    <Reference
      className="font-normal"
      value={value === '' ? null : value}
      onChange={(v) => column.setFilterValue(v ?? '')}
      options={options}
      placeholder="Any"
      locate={async (v) =>
        window.ck3tools.locateRef(
          gameDir,
          modPath,
          replacePaths,
          kind === 'culture' ? 'culture' : 'dynasty',
          v
        )
      }
    />
  )
}

interface Selection {
  kind: 'dynasty' | 'house'
  id: string
}

export default function DynastyEditorPage(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const [data, setData] = useState<DynastyData | null>(null)
  const [loading, setLoading] = useState(false)
  const [refData, setRefData] = useState<ReferenceData | null>(null)
  const [selected, setSelected] = useState<Selection | null>(null)
  const [includeHouseMembers, setIncludeHouseMembers] = useState(true)
  const [treeSelected, setTreeSelected] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string | null; nonce: number }>({ id: null, nonce: 0 })
  const deepLink = useSearch({ from: '/dynasties' })
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'dynasty-editor-detail',
    panelIds: ['tree', 'detail'],
    onlySaveAfterUserInteractions: true
  })

  const modPath = selectedMod?.path ?? null
  const gameDir = settings?.gameDir ?? null
  const replacePaths = useMemo(() => selectedMod?.replacePaths ?? [], [selectedMod])
  const calendar = selectedMod?.profile?.calendar ?? null

  const reload = (): void => {
    if (!modPath) {
      setData(null)
      return
    }
    setLoading(true)
    window.ck3tools
      .getDynastyData(gameDir, modPath, replacePaths)
      .then(setData)
      .finally(() => setLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reload, [modPath])

  useEffect(() => {
    setSelected(null)
    setTreeSelected(null)
    if (!modPath) {
      setRefData(null)
      return
    }
    window.ck3tools.getReferenceData(gameDir, modPath, replacePaths).then(setRefData)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath])

  // Pre-sorted the way the list has always read: biggest families first. The
  // table's own sorting layers on top when a header is clicked.
  const rows = useMemo(
    () =>
      (data ? buildRows(data) : []).sort(
        (a, b) => b.members - a.members || numericAware(a.id, b.id)
      ),
    [data]
  )

  const table = useTable({
    features,
    columns,
    data: rows,
    globalFilterFn: (row, columnId, filterValue) =>
      String(row.getValue(columnId) ?? '')
        .toLowerCase()
        .includes(String(filterValue).toLowerCase()),
    getRowId: (r: DynastyListRow) => `${r.kind}:${normId(r.id)}`
  })

  const globalFilter = (table.state.globalFilter as string | undefined) ?? ''
  const filtered = globalFilter !== '' || table.state.columnFilters.length > 0
  const visibleRows = table.getRowModel().rows

  const clearFilters = (): void => {
    table.resetColumnFilters(true)
    table.setGlobalFilter('')
  }

  const selectedRow: DynastyListRow | null =
    selected === null
      ? null
      : (rows.find((r) => r.kind === selected.kind && normId(r.id) === normId(selected.id)) ?? null)

  const members = useMemo(() => {
    if (!data || !selected) return []
    return selected.kind === 'dynasty'
      ? membersOfDynasty(data, selected.id, includeHouseMembers)
      : membersOfHouse(data, selected.id)
  }, [data, selected, includeHouseMembers])

  const treeNodes = useMemo(
    () => (data ? buildTreeNodes(members, data.characters, makeAffiliationName(data)) : []),
    [data, members]
  )

  /** Stable house → accent color assignment for the tree and the member list */
  const groupColors = useMemo(() => {
    if (!data || !selected) return {}
    const ids =
      selected.kind === 'house'
        ? [normId(selected.id)]
        : [
            ...housesOfDynasty(data, selected.id).map((h) => normId(h.id)),
            ...membersOfDynasty(data, selected.id, true)
              .filter((c) => c.house !== null)
              .map((c) => normId(c.house!))
          ]
    const colors: Record<string, string> = {}
    for (const id of ids) {
      if (!(id in colors)) colors[id] = houseColor(id)
    }
    return colors
  }, [data, selected])

  const openRow = (kind: 'dynasty' | 'house', id: string): void => {
    setSelected({ kind, id })
    setTreeSelected(null)
    // Give the tree the full width: fold the tools sidebar away if it's open.
    if (isMobile) setOpenMobile(false)
    else setOpen(false)
  }

  // Deep link from another tool (e.g. a character's dynasty field). Waits for
  // the scan, since only the loaded data says whether the id names a dynasty
  // or a house; the params are then stripped so a refresh doesn't re-jump.
  useEffect(() => {
    if (!deepLink.id || !data) return
    const norm = normId(deepLink.id)
    const kind = data.dynasties.some((d) => normId(d.id) === norm)
      ? 'dynasty'
      : data.houses.some((h) => normId(h.id) === norm)
        ? 'house'
        : null
    if (kind === null) {
      toast.error(`"${deepLink.id}" isn't a dynasty or house in ${selectedMod?.name ?? 'this mod'}`)
    } else {
      openRow(kind, deepLink.id)
    }
    void navigate({ to: '/dynasties', search: {}, replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink.id, data])

  const focusMember = (id: string): void => {
    // A house member clicked while the tree shows "dynasty only" — widen first
    if (
      selected?.kind === 'dynasty' &&
      !includeHouseMembers &&
      !members.some((c) => c.id === id)
    ) {
      setIncludeHouseMembers(true)
    }
    setTreeSelected(id)
    setFocus((f) => ({ id, nonce: f.nonce + 1 }))
  }

  const openCharacter = (id: string): void => {
    const target = data?.characters.find((c) => normId(c.id) === normId(id))
    if (!target) {
      toast.error(`Character "${id}" isn't defined in ${selectedMod?.name ?? 'this mod'}`)
      return
    }
    void navigate({ to: '/characters', search: { file: target.file, id: target.id } })
  }

  if (!selectedMod) {
    return (
      <div className="max-w-4xl space-y-5 p-7">
        <header>
          <h1 className="text-2xl font-semibold">Dynasty &amp; House Editor</h1>
        </header>
        <ModPicker />
      </div>
    )
  }

  if (selected && data) {
    const title = selectedRow?.name ?? selectedRow?.id ?? selected.id
    return (
      <div className="flex h-full flex-col gap-3 p-7 pt-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" title="Back to list" onClick={() => setSelected(null)}>
            <ArrowLeft />
          </Button>
          <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
            <span className="truncate">{title}</span>
            <Badge variant="secondary">{selected.kind}</Badge>
            <span className="truncate font-mono text-sm font-normal text-muted-foreground">
              {selectedRow?.id ?? selected.id}
            </span>
          </h1>
          <span className="ml-auto text-xs whitespace-nowrap text-muted-foreground">
            {members.length} member{members.length === 1 ? '' : 's'}
          </span>
        </header>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <ResizablePanel id="tree" minSize={360} className="flex min-h-0 flex-col">
            <FamilyTree
              className="min-h-0 flex-1"
              nodes={treeNodes}
              calendar={calendar}
              selectedId={treeSelected}
              onSelect={setTreeSelected}
              onOpenCharacter={openCharacter}
              groupColors={groupColors}
              focusId={focus.id}
              focusNonce={focus.nonce}
              fitKey={`${selected.kind}:${normId(selected.id)}`}
              toolbar={
                selected.kind === 'dynasty' ? (
                  <ToggleGroup
                    type="single"
                    variant="outline"
                    size="sm"
                    spacing={0}
                    value={includeHouseMembers ? 'all' : 'no-house'}
                    onValueChange={(v) => v && setIncludeHouseMembers(v === 'all')}
                    aria-label="Which members the tree shows"
                  >
                    <ToggleGroupItem value="all">With houses</ToggleGroupItem>
                    <ToggleGroupItem value="no-house">Dynasty only</ToggleGroupItem>
                  </ToggleGroup>
                ) : undefined
              }
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-2 bg-transparent hover:bg-border" />
          <ResizablePanel
            id="detail"
            defaultSize={400}
            minSize={320}
            maxSize={720}
            className="flex min-h-0 flex-col"
          >
            <DynastyDetailPanel
              kind={selected.kind}
              id={selected.id}
              data={data}
              modPath={modPath!}
              gameDir={gameDir}
              replacePaths={replacePaths}
              calendar={calendar}
              refData={refData}
              groupColors={groupColors}
              selectedMemberId={treeSelected}
              onMemberClick={focusMember}
              onOpenCharacter={openCharacter}
              onOpenRow={openRow}
              onSaved={reload}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-7 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dynasty &amp; House Editor</h1>
        <div className="flex items-center gap-3">
          <DebouncedInput
            className="w-72"
            type="search"
            placeholder="Filter by id, name, culture, or parent…"
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
      </header>

      {!loading && rows.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No dynasties or houses found in {selectedMod.name}&apos;s{' '}
              <code className="font-mono">common/dynasties</code> folder, and no characters
              reference any.
            </p>
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && (
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
                        <ColumnFilter
                          column={header.column}
                          gameDir={gameDir}
                          modPath={modPath}
                          replacePaths={replacePaths}
                        />
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
                  className="cursor-pointer"
                  onClick={() => openRow(row.original.kind, row.original.id)}
                >
                  {row.getAllCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        'max-w-70 truncate',
                        cell.column.id === 'culture' || cell.column.id === 'parent'
                          ? 'max-w-50'
                          : cell.column.id === 'id'
                            ? 'max-w-60'
                            : undefined
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
