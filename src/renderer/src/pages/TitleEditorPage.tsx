import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, FilterX, Plus } from 'lucide-react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { useApp } from '../AppContext'
import CoatOfArms from '../components/CoatOfArms'
import DebouncedInput from '../components/DebouncedInput'
import ModPicker from '../components/ModPicker'
import TitleCreatePanel from '../components/TitleCreatePanel'
import TitleDetailPanel from '../components/TitleDetailPanel'
import TitleHistoryPanel from '../components/TitleHistoryPanel'
import TitleTree from '../components/TitleTree'
import { Swatch } from '../components/Swatch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useSidebar } from '@/components/ui/sidebar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type {
  CharacterSummary,
  TitleData,
  TitleDetail,
  TitleHistoryEntry
} from '@shared/types'
import type { TitleSearch } from '../router'
import {
  TIER_LABEL,
  buildTree,
  findTitle,
  flattenTree,
  pruneToMod,
  titleName
} from '@/lib/titleView'

export default function TitleEditorPage(): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const { isMobile, setOpen, setOpenMobile } = useSidebar()
  const navigate = useNavigate()
  const [data, setData] = useState<TitleData | null>(null)
  const [titleFiles, setTitleFiles] = useState<string[] | null>(null)
  const [historyFiles, setHistoryFiles] = useState<string[]>([])
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [detail, setDetail] = useState<TitleDetail | null>(null)
  const [history, setHistory] = useState<TitleHistoryEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'mod' | 'all'>('mod')
  const [showRawDates, setShowRawDates] = useState(false)
  /** While a history entry form is open, Escape cancels it rather than the page */
  const [historyFormOpen, setHistoryFormOpen] = useState(false)
  // Which title is open lives in the URL, not in state, so opening one pushes
  // a history entry and the mouse "back" button returns to the tree.
  const search = useSearch({ from: '/titles' })
  const creating = search.create === true
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: 'title-editor-detail',
    panelIds: ['detail', 'history'],
    onlySaveAfterUserInteractions: true
  })
  const createLayout = useDefaultLayout({
    id: 'title-editor-create',
    panelIds: ['list', 'create'],
    onlySaveAfterUserInteractions: true
  })

  const modPath = selectedMod?.path ?? null
  const gameDir = settings?.gameDir ?? null
  const replacePaths = useMemo(() => selectedMod?.replacePaths ?? [], [selectedMod])
  const calendar = selectedMod?.profile?.calendar ?? null

  const go = (next: TitleSearch, replace = false): void => {
    void navigate({ to: '/titles', search: next, replace })
  }

  /** Give the panels the full width: fold the tools sidebar away if it's open. */
  const collapseSidebar = (): void => {
    if (isMobile) setOpenMobile(false)
    else setOpen(false)
  }

  const openRow = (id: string): void => {
    go({ id })
    collapseSidebar()
  }

  const openCreate = (parent?: string): void => {
    go({ create: true, parent })
    collapseSidebar()
  }

  // Closing replaces rather than pushes, so "back" from the tree doesn't drop
  // straight back into the title that was just closed.
  const closeRow = (): void => {
    go({}, true)
  }

  const reload = async (): Promise<void> => {
    if (!modPath) {
      setData(null)
      setTitleFiles(null)
      return
    }
    setLoading(true)
    try {
      const [next, files, hFiles, chars] = await Promise.all([
        window.ck3tools.getTitleData(gameDir, modPath, replacePaths),
        window.ck3tools.listTitleFiles(modPath),
        window.ck3tools.listTitleHistoryFiles(modPath),
        window.ck3tools.listCharacters(modPath)
      ])
      setData(next)
      setTitleFiles(files)
      setHistoryFiles(hFiles)
      setCharacters(chars)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath])

  // Switching mods invalidates the open title, but only on a real change: on
  // the first render the URL may already carry a deep link that must survive.
  const prevModPath = useRef(modPath)
  useEffect(() => {
    if (prevModPath.current !== modPath) {
      prevModPath.current = modPath
      closeRow()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modPath])

  /**
   * The selected title's full parse and history, loaded per selection. The
   * token drops a slow response that lands after another selection started,
   * so quick clicks through the tree can't show a stale title's data.
   */
  const selectionToken = useRef(0)
  const loadSelected = async (id: string): Promise<void> => {
    const token = ++selectionToken.current
    const [d, h] = await Promise.all([
      window.ck3tools.getTitle(gameDir, modPath, replacePaths, id),
      window.ck3tools.getTitleHistory(gameDir, modPath, replacePaths, id)
    ])
    if (token !== selectionToken.current) return
    setDetail(d)
    setHistory(h)
  }

  useEffect(() => {
    setDetail(null)
    setHistory(null)
    if (search.id && modPath) void loadSelected(search.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.id, modPath])

  const selected = search.id && data ? findTitle(data.titles, search.id) : null

  // An id in the URL that matches nothing (e.g. a deep link to a title the mod
  // doesn't load) falls back to the tree with a toast.
  useEffect(() => {
    if (!search.id || !data || selected) return
    toast.error(`"${search.id}" isn't a landed title in ${selectedMod?.name ?? 'this mod'}`)
    closeRow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.id, data, selected])

  const roots = useMemo(() => (data ? buildTree(data.titles) : []), [data])
  const visibleRoots = useMemo(
    () => (scope === 'mod' ? pruneToMod(roots) : roots),
    [roots, scope]
  )
  const visibleCount = useMemo(() => flattenTree(visibleRoots).length, [visibleRoots])
  const hasGameTitles = useMemo(() => data?.titles.some((t) => !t.inMod) ?? false, [data])

  if (!selectedMod) {
    return (
      <div className="max-w-4xl space-y-5 p-7">
        <header>
          <h1 className="text-2xl font-semibold">Title Editor</h1>
        </header>
        <ModPicker />
      </div>
    )
  }

  if (selected && data && modPath) {
    return (
      <div className="flex h-full flex-col gap-3 p-7 pt-6">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" title="Back to tree (Esc)" onClick={closeRow}>
            <ArrowLeft />
          </Button>
          <CoatOfArms ids={[selected.id]} size={40} />
          <h1 className="flex min-w-0 items-center gap-2 text-2xl font-semibold">
            <Swatch hex={selected.color} className="size-5" />
            <span className="truncate">{titleName(selected)}</span>
            <span className="truncate font-mono text-sm font-normal text-muted-foreground">
              {selected.id}
            </span>
            <Badge variant="secondary">{TIER_LABEL[selected.tier].toLowerCase()}</Badge>
            {!selected.inMod && <Badge variant="outline">game</Badge>}
          </h1>
        </header>

        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
          defaultLayout={defaultLayout}
          onLayoutChanged={onLayoutChanged}
        >
          <ResizablePanel id="detail" minSize={380} className="flex min-h-0 flex-col">
            <TitleDetailPanel
              id={selected.id}
              data={data}
              detail={detail}
              modPath={modPath}
              gameDir={gameDir}
              replacePaths={replacePaths}
              onOpenTitle={openRow}
              onAddChild={(parentId) => openCreate(parentId)}
              onSaved={() => {
                void reload()
                if (search.id) void loadSelected(search.id)
              }}
              onClose={() => {
                if (!historyFormOpen) closeRow()
              }}
            />
          </ResizablePanel>
          <ResizableHandle withHandle className="mx-2 bg-transparent hover:bg-border" />
          <ResizablePanel
            id="history"
            defaultSize={460}
            minSize={360}
            maxSize={720}
            className="flex min-h-0 flex-col"
          >
            <TitleHistoryPanel
              titleId={selected.id}
              data={data}
              entries={history}
              historyFiles={historyFiles}
              characters={characters}
              calendar={calendar}
              showRawDates={showRawDates}
              onShowRawDatesChange={setShowRawDates}
              modPath={modPath}
              onOpenTitle={openRow}
              onOpenCharacter={(file, id) =>
                void navigate({ to: '/characters', search: { file, id } })
              }
              onChanged={() => {
                if (search.id) void loadSelected(search.id)
                void reload()
              }}
              onFormOpenChange={setHistoryFormOpen}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3 p-7 pt-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Title Editor</h1>
      </header>

      {!loading && data !== null && data.titles.length === 0 && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              No landed titles found in {selectedMod.name}&apos;s{' '}
              <code className="font-mono">common/landed_titles</code> folder, or in the game files
              it loads.
            </p>
            <Button size="sm" className="shrink-0" onClick={() => openCreate()}>
              <Plus />
              New title
            </Button>
          </CardContent>
        </Card>
      )}

      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={createLayout.defaultLayout}
        onLayoutChanged={createLayout.onLayoutChanged}
      >
        {(data?.titles.length ?? 0) > 0 && (
          <ResizablePanel id="list" minSize={360} className="flex min-h-0 flex-col gap-2">
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={() => openCreate()}>
                <Plus />
                New title
              </Button>
              {hasGameTitles && (
                <ToggleGroup
                  type="single"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={scope}
                  onValueChange={(v) => v && setScope(v as 'mod' | 'all')}
                  aria-label="Which titles to list"
                >
                  <ToggleGroupItem value="mod">This mod</ToggleGroupItem>
                  <ToggleGroupItem value="all">With base game</ToggleGroupItem>
                </ToggleGroup>
              )}
              <DebouncedInput
                className="ml-auto w-72"
                type="search"
                placeholder="Search by name or id…"
                value={query}
                onChange={setQuery}
              />
              {query !== '' && (
                <Button variant="ghost" size="sm" onClick={() => setQuery('')}>
                  <FilterX />
                  Clear
                </Button>
              )}
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {loading ? 'Loading…' : `${visibleCount} titles`}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-card">
              <TitleTree nodes={visibleRoots} query={query} onOpen={openRow} />
            </div>
          </ResizablePanel>
        )}
        {creating && modPath && data && titleFiles && (
          <>
            {(data.titles.length ?? 0) > 0 && (
              <ResizableHandle withHandle className="mx-2 bg-transparent hover:bg-border" />
            )}
            <ResizablePanel
              id="create"
              defaultSize={420}
              minSize={340}
              maxSize={720}
              className="flex min-h-0 flex-col"
            >
              <TitleCreatePanel
                // Remount when a fresh deep link brings a different seed
                key={search.parent ?? ''}
                modPath={modPath}
                data={data}
                files={titleFiles}
                seedParent={search.parent ?? null}
                onOpenTitle={openRow}
                onCreated={(id) => {
                  // Reload first: the title the URL is about to point at has
                  // to exist in the scan, or the deep-link guard bounces it
                  void reload().then(() => go({ id }, true))
                }}
                onClose={closeRow}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  )
}
