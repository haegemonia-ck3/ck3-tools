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
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import CharacterDetailPanel from '../components/CharacterDetailPanel'
import type { CharacterSummary, ReferenceData } from '@shared/types'

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
    cell: (info) => <span className="col-id">{info.getValue()}</span>
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue() ?? <em className="dim">unnamed</em>
  }),
  columnHelper.accessor('dynasty', {
    header: 'Dynasty',
    sortFn: bySortableString,
    cell: (info) => info.getValue() ?? <em className="dim">—</em>
  }),
  columnHelper.accessor('birth', {
    header: 'Birth',
    sortFn: bySortableString,
    cell: (info) => info.getValue() ?? <em className="dim">—</em>
  }),
  columnHelper.accessor('file', {
    header: 'File',
    cell: (info) => <span className="col-file">{info.getValue()}</span>
  })
])

export default function CharacterEditorPage(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<{ file: string; id: string } | null>(null)
  const [refData, setRefData] = useState<ReferenceData | null>(null)

  const modPath = selectedMod?.path ?? null

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
      <div className="page">
        <header className="page-header">
          <h1>Character Editor</h1>
        </header>
        <ModPicker />
      </div>
    )
  }

  const rows = table.getRowModel().rows

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Character Editor</h1>
        <div className="header-tools">
          <input
            className="search-input"
            type="search"
            placeholder="Filter by id, name, dynasty, or file…"
            value={(table.state.globalFilter as string | undefined) ?? ''}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
          />
          <span className="hint hint-inline">
            {loading ? 'Loading…' : `${rows.length} / ${characters.length}`}
          </span>
        </div>
      </header>

      {!loading && characters.length === 0 && (
        <section className="card">
          <p className="hint">
            No characters found in {selectedMod.name}'s <code>history/characters</code> folder.
          </p>
        </section>
      )}

      <div className="editor-split">
      {characters.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      className={header.column.id === 'id' ? 'col-id' : ''}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="th-label">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {{ asc: ' ▲', desc: ' ▼' }[header.column.getIsSorted() as string] ?? ''}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    selected && `${selected.file}:${selected.id}` === row.id ? 'selected' : ''
                  }
                  onClick={() =>
                    setSelected({ file: row.original.file, id: row.original.id })
                  }
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
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
