import { ChevronRight, Circle, FlameKindling, House, Shield } from 'lucide-react'
import type { TitleSummary } from '@shared/types'
import FavoriteToggle from './FavoriteToggle'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { matchesQuery, normId, titleGlyphKind, titleKindLabel, titleName } from '@/lib/titleView'
import type { TitleGlyphKind, TitleTreeNode } from '@/lib/titleView'

/** Search results are a flat list; past this many the query needs narrowing. */
const SEARCH_CAP = 300

const GLYPH_ICON: Record<TitleGlyphKind, typeof Shield> = {
  title: Shield,
  house: House,
  adventurer: FlameKindling,
  landless: Circle
}

/**
 * The row's type marker, tinted with the title's map colour: a shield for
 * ordinary titles, a house for noble families, a kindling fire for landless
 * adventurers, a plain circle for other landless titles. Filled once the
 * title has recorded history; outline-only when nothing ever happened to it.
 */
function TitleGlyph({ title }: { title: TitleSummary }): React.JSX.Element {
  const Icon = GLYPH_ICON[titleGlyphKind(title)]
  return (
    <Icon
      aria-hidden
      className="size-3.5 shrink-0"
      style={{ color: title.color ?? 'var(--muted-foreground)' }}
      fill={title.hasHistory ? 'currentColor' : 'none'}
    />
  )
}

/** What a row needs to draw and flip its own star. */
interface FavoriteProps {
  isFavorite: (title: TitleSummary) => boolean
  onToggleFavorite: (title: TitleSummary) => void
  /** Whether the title carries unsaved edits, marked with a dot by the star */
  hasDraft: (title: TitleSummary) => boolean
}

interface RowProps extends FavoriteProps {
  title: TitleSummary
  depth: number
  childCount: number
  expanded: boolean
  onToggle: () => void
  onOpen: (id: string) => void
}

/**
 * One row of the browser. A div rather than a button: the expand chevron is
 * its own control and buttons don't nest.
 */
function TitleRow({
  title,
  depth,
  childCount,
  expanded,
  onToggle,
  onOpen,
  isFavorite,
  onToggleFavorite,
  hasDraft
}: RowProps): React.JSX.Element {
  return (
    <div
      role="button"
      tabIndex={0}
      className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm hover:bg-muted"
      style={{ paddingLeft: depth * 18 + 4 }}
      onClick={() => onOpen(title.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen(title.id)
        if (e.key === 'ArrowRight' && !expanded && childCount > 0) onToggle()
        if (e.key === 'ArrowLeft' && expanded) onToggle()
      }}
    >
      {childCount > 0 ? (
        <span
          role="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          className="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
        >
          <ChevronRight className={cn('size-3.5 transition-transform', expanded && 'rotate-90')} />
        </span>
      ) : (
        <span className="size-5 shrink-0" />
      )}
      <TitleGlyph title={title} />
      <span className={cn('min-w-0 truncate', title.localizedName === null && 'font-mono')}>
        {titleName(title)}
      </span>
      {title.localizedName !== null && (
        <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{title.id}</span>
      )}
      {!title.inMod && (
        <Badge variant="outline" className="shrink-0 text-[10px]">
          game
        </Badge>
      )}
      {titleKindLabel(title) !== null && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          {titleKindLabel(title)}
        </Badge>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {childCount > 0 && <span className="text-xs text-muted-foreground">{childCount}</span>}
        <FavoriteToggle
          className="pl-2"
          on={isFavorite(title)}
          dot={hasDraft(title)}
          onToggle={() => onToggleFavorite(title)}
        />
      </span>
    </div>
  )
}

interface Props extends FavoriteProps {
  /** The (already mode-filtered) de jure forest */
  nodes: TitleTreeNode[]
  /** Non-empty switches the tree to a flat result list */
  query: string
  /**
   * Expansion is owned by the page (normalized ids), so it can outlive this
   * component — the list view unmounts whenever a title is opened, and the
   * drilled-open branches should still be open on the way back.
   */
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}

/**
 * The de jure title browser: an expandable tree built from Tailwind
 * indentation (no tree primitive exists in the kit). Only expanded branches
 * render, which is what keeps a full vanilla database (17k titles) usable —
 * finding something deep goes through the search box, which flattens to
 * matching rows instead.
 */
export default function TitleTree({
  nodes,
  query,
  expanded,
  onToggle,
  onOpen,
  isFavorite,
  onToggleFavorite,
  hasDraft
}: Props): React.JSX.Element {
  const favorite = { isFavorite, onToggleFavorite, hasDraft }

  if (query.trim() !== '') {
    const matches: TitleSummary[] = []
    const walk = (list: TitleTreeNode[]): void => {
      for (const node of list) {
        if (matchesQuery(node.title, query)) matches.push(node.title)
        walk(node.children)
      }
    }
    walk(nodes)
    return (
      <div className="p-1">
        {matches.slice(0, SEARCH_CAP).map((title) => (
          <TitleRow
            key={title.id}
            title={title}
            depth={0}
            childCount={0}
            expanded={false}
            onToggle={() => {}}
            onOpen={onOpen}
            {...favorite}
          />
        ))}
        {matches.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">No titles match.</p>
        )}
        {matches.length > SEARCH_CAP && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {matches.length - SEARCH_CAP} more — narrow the search.
          </p>
        )}
      </div>
    )
  }

  const renderNodes = (list: TitleTreeNode[], depth: number): React.JSX.Element[] =>
    list.flatMap((node) => {
      const key = normId(node.title.id)
      const open = expanded.has(key)
      const row = (
        <TitleRow
          key={node.title.id}
          title={node.title}
          depth={depth}
          childCount={node.children.length}
          expanded={open}
          onToggle={() => onToggle(node.title.id)}
          onOpen={onOpen}
          {...favorite}
        />
      )
      return open ? [row, ...renderNodes(node.children, depth + 1)] : [row]
    })

  return <div className="p-1">{renderNodes(nodes, 0)}</div>
}
