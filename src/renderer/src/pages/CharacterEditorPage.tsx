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
      <div className="page">
        <header className="page-header">
          <h1>Character Editor</h1>
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
    return (
      <button
        key={`${ref.file}:${ref.id}`}
        className={`char-chip${selected && sameChar(ref, selected) ? ' active' : ''}`}
        title={`${ref.id} — ${ref.file}`}
        onClick={() => openCharacter(ref)}
      >
        {isFavorite(ref) && <span className="chip-star">★</span>}
        {label}
      </button>
    )
  }

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

      {(shownFavorites.length > 0 || shownRecents.length > 0) && (
        <div className="quick-access">
          {shownFavorites.length > 0 && (
            <div className="quick-row">
              <span className="quick-label">Favorites</span>
              {shownFavorites.map(chip)}
            </div>
          )}
          {shownRecents.length > 0 && (
            <div className="quick-row">
              <span className="quick-label">Recent</span>
              {visibleRecents.map(chip)}
              {shownRecents.length > RECENTS_COLLAPSED && (
                <button
                  className="quick-toggle"
                  onClick={() => setShowAllRecents((v) => !v)}
                >
                  {showAllRecents ? 'Show less' : `Show more (${shownRecents.length - RECENTS_COLLAPSED})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
                  <th className="col-star" aria-label="Favorite" />
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
                    openCharacter({
                      file: row.original.file,
                      id: row.original.id,
                      name: row.original.name
                    })
                  }
                >
                  <td className="col-star">
                    <button
                      className={`star-btn${isFavorite(row.original) ? ' favorited' : ''}`}
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
                      {isFavorite(row.original) ? '★' : '☆'}
                    </button>
                  </td>
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
