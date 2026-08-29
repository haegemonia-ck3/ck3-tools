import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import type { CharacterSummary } from '@shared/types'

export default function CharacterEditorPage(): React.JSX.Element {
  const { selectedMod } = useApp()
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const modPath = selectedMod?.path ?? null

  useEffect(() => {
    if (!modPath) {
      setCharacters([])
      return
    }
    setLoading(true)
    window.ck3tools
      .listCharacters(modPath)
      .then(setCharacters)
      .finally(() => setLoading(false))
  }, [modPath])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return characters
    return characters.filter(
      (c) =>
        c.id.toLowerCase().includes(q) ||
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.dynasty ?? '').toLowerCase().includes(q) ||
        c.file.toLowerCase().includes(q)
    )
  }, [characters, filter])

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

  return (
    <div className="page page-wide">
      <header className="page-header">
        <h1>Character Editor</h1>
        <div className="header-tools">
          <input
            className="search-input"
            type="search"
            placeholder="Filter by id, name, dynasty, or file…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="hint hint-inline">
            {loading ? 'Loading…' : `${filtered.length} / ${characters.length}`}
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

      {characters.length > 0 && (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="col-id">ID</th>
                <th>Name</th>
                <th>Dynasty</th>
                <th>Birth</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr
                  key={`${c.file}:${c.id}`}
                  className={selectedId === `${c.file}:${c.id}` ? 'selected' : ''}
                  onClick={() => setSelectedId(`${c.file}:${c.id}`)}
                >
                  <td className="col-id">{c.id}</td>
                  <td>{c.name ?? <em className="dim">unnamed</em>}</td>
                  <td>{c.dynasty ?? <em className="dim">—</em>}</td>
                  <td>{c.birth ?? <em className="dim">—</em>}</td>
                  <td className="col-file">{c.file}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
