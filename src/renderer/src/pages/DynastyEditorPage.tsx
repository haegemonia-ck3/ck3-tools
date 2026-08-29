import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, FilterX } from 'lucide-react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useApp } from '../AppContext'
import ModPicker from '../components/ModPicker'
import DebouncedInput from '../components/DebouncedInput'
import DynastyDetailPanel from '../components/DynastyDetailPanel'
import FamilyTree from '../components/FamilyTree'
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
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'dynasty' | 'house'>('all')
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

  const rows = useMemo(() => (data ? buildRows(data) : []), [data])

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows
      .filter((r) => kindFilter === 'all' || r.kind === kindFilter)
      .filter(
        (r) =>
          q === '' ||
          [r.id, r.name, r.culture, r.parent].some((v) => v !== null && v.toLowerCase().includes(q))
      )
      .sort((a, b) => b.members - a.members || a.id.localeCompare(b.id, undefined, { numeric: true }))
  }, [rows, search, kindFilter])

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
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={kindFilter}
            onValueChange={(v) => v && setKindFilter(v as typeof kindFilter)}
            aria-label="Kind filter"
          >
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="dynasty">Dynasties</ToggleGroupItem>
            <ToggleGroupItem value="house">Houses</ToggleGroupItem>
          </ToggleGroup>
          <DebouncedInput
            className="w-72"
            type="search"
            placeholder="Filter by id, name, culture, or parent…"
            value={search}
            onChange={setSearch}
          />
          {(search !== '' || kindFilter !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setKindFilter('all')
              }}
            >
              <FilterX />
              Clear
            </Button>
          )}
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {loading ? 'Loading…' : `${filteredRows.length} / ${rows.length}`}
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
              <TableRow className="hover:bg-transparent">
                {['Kind', 'ID', 'Name', 'Culture', 'Parent', 'Members'].map((h) => (
                  <TableHead key={h} className="sticky top-0 z-10 border-b bg-card">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow
                  key={`${row.kind}:${row.id}`}
                  className="cursor-pointer"
                  onClick={() => openRow(row.kind, row.id)}
                >
                  <TableCell>
                    <Badge variant={row.kind === 'dynasty' ? 'secondary' : 'outline'}>
                      {row.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-60 truncate font-mono">{row.id}</TableCell>
                  <TableCell className="max-w-70 truncate">
                    {row.name ?? <em className="text-muted-foreground">—</em>}
                    {!row.defined && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        undefined
                      </Badge>
                    )}
                    {row.defined && !row.inMod && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        game
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-w-50 truncate">
                    {row.culture ?? <em className="text-muted-foreground">—</em>}
                  </TableCell>
                  <TableCell className="max-w-50 truncate font-mono">
                    {row.parent ?? <em className="text-muted-foreground">—</em>}
                  </TableCell>
                  <TableCell>{row.members}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
