import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react'
import type { CalendarConfig } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { formatCalendarYear } from '@/lib/ck3Date'
import { DEFAULT_LAYOUT_OPTIONS, layoutFamilyForest, yearOf } from '@/lib/familyTree'
import type {
  FamilyTreeLayout,
  FamilyTreeNode,
  GapSeparator,
  PlacedNode
} from '@/lib/familyTree'

const MIN_SCALE = 0.15
const MAX_SCALE = 2.5
/** Space kept around the tree when fitting it into the container */
const FIT_PADDING = 24
/** Pointer travel (px) past which a press counts as a pan, not a click */
const DRAG_THRESHOLD = 3

export interface FamilyTreeProps {
  nodes: FamilyTreeNode[]
  calendar: CalendarConfig | null
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onOpenCharacter?: (id: string) => void
  /** group id (house) -> CSS color used for the node's accent stripe */
  groupColors?: Record<string, string>
  /** When focusNonce changes and focusId is set, pan/zoom to center that node */
  focusId?: string | null
  focusNonce?: number
  className?: string
}

interface Viewport {
  x: number
  y: number
  scale: number
}

interface DragState {
  pointerId: number
  originClientX: number
  originClientY: number
  originViewX: number
  originViewY: number
  moved: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Display form of a bare year: era-converted under a mod calendar, raw otherwise. */
function yearLabel(year: number | null, calendar: CalendarConfig | null, missing: string): string {
  if (year === null) return missing
  return calendar ? formatCalendarYear(year, calendar) : String(year)
}

/** "2669 – 2716" / "1332 BC – 1285 BC"; '?' for no birth, nothing after the dash for no death. */
function lifespanLabel(node: FamilyTreeNode, calendar: CalendarConfig | null): string {
  return `${yearLabel(yearOf(node.birth), calendar, '?')} – ${yearLabel(yearOf(node.death), calendar, '')}`
}

/** "≈ 257 years pass · 2942 → 3199", dropping whichever parts have no data. */
function separatorLabel(sep: GapSeparator, calendar: CalendarConfig | null): string | null {
  const parts: string[] = []
  if (sep.gapYears !== null) parts.push(`≈ ${sep.gapYears} years pass`)
  if (sep.fromYear !== null && sep.toYear !== null) {
    parts.push(`${yearLabel(sep.fromYear, calendar, '?')} → ${yearLabel(sep.toYear, calendar, '?')}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/** Parent bottom-center, down to the row midpoint, across, down to child top-center. */
function elbowPath(from: PlacedNode, to: PlacedNode, w: number, h: number): string {
  const x1 = from.x + w / 2
  const y1 = from.y + h
  const x2 = to.x + w / 2
  const y2 = to.y
  const midY = (y1 + y2) / 2
  return `M ${x1} ${y1} V ${midY} H ${x2} V ${y2}`
}

function curvePath(from: PlacedNode, to: PlacedNode, w: number, h: number): string {
  const x1 = from.x + w / 2
  const y1 = from.y + h
  const x2 = to.x + w / 2
  const y2 = to.y
  // Keeps a visible bow even when the endpoints share a row (mother links)
  const bend = Math.max((y2 - y1) / 2, 24)
  return `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`
}

export default function FamilyTree({
  nodes,
  calendar,
  selectedId,
  onSelect,
  onOpenCharacter,
  groupColors,
  focusId,
  focusNonce,
  className
}: FamilyTreeProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const [dragging, setDragging] = useState(false)
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, scale: 1 })

  // A layout failure (pathological data, engine bug) degrades to a message
  // instead of taking the whole route down.
  const layout = useMemo<FamilyTreeLayout | null>(() => {
    try {
      return layoutFamilyForest(nodes)
    } catch {
      return null
    }
  }, [nodes])

  const placedById = useMemo(() => {
    const map = new Map<string, PlacedNode>()
    for (const placed of layout?.nodes ?? []) {
      if (!map.has(placed.node.id)) map.set(placed.node.id, placed)
    }
    return map
  }, [layout])

  const fitToView = useCallback((): void => {
    const el = containerRef.current
    if (!el || !layout || layout.width <= 0 || layout.height <= 0) return
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const scale = clamp(
      Math.min(
        (rect.width - FIT_PADDING * 2) / layout.width,
        (rect.height - FIT_PADDING * 2) / layout.height,
        1
      ),
      MIN_SCALE,
      MAX_SCALE
    )
    setView({
      scale,
      x: (rect.width - layout.width * scale) / 2,
      y: (rect.height - layout.height * scale) / 2
    })
  }, [layout])

  // Auto-fit once per layout identity (a newly selected dynasty/house)
  useLayoutEffect(() => {
    fitToView()
  }, [fitToView])

  // React's onWheel can be passive, which would make preventDefault a no-op —
  // attach a non-passive listener so the page never scrolls under the canvas.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return undefined
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setView((v) => {
        const scale = clamp(v.scale * Math.exp(-e.deltaY * 0.0015), MIN_SCALE, MAX_SCALE)
        const k = scale / v.scale
        return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const prevFocusNonce = useRef(focusNonce)
  useEffect(() => {
    if (focusNonce === prevFocusNonce.current) return
    prevFocusNonce.current = focusNonce
    if (focusId == null) return
    const el = containerRef.current
    const placed = placedById.get(focusId)
    if (!el || !placed) return
    const rect = el.getBoundingClientRect()
    const cx = placed.x + DEFAULT_LAYOUT_OPTIONS.nodeWidth / 2
    const cy = placed.y + DEFAULT_LAYOUT_OPTIONS.nodeHeight / 2
    setView((v) => ({
      scale: v.scale,
      x: rect.width / 2 - cx * v.scale,
      y: rect.height / 2 - cy * v.scale
    }))
  }, [focusNonce, focusId, placedById])

  const zoomBy = (factor: number): void => {
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = rect.width / 2
    const py = rect.height / 2
    setView((v) => {
      const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE)
      const k = scale / v.scale
      return { scale, x: px - (px - v.x) * k, y: py - (py - v.y) * k }
    })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (e.button !== 0) return
    dragRef.current = {
      pointerId: e.pointerId,
      originClientX: e.clientX,
      originClientY: e.clientY,
      originViewX: view.x,
      originViewY: view.y,
      moved: false
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dx = e.clientX - drag.originClientX
    const dy = e.clientY - drag.originClientY
    if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true
    setView((v) => ({ ...v, x: drag.originViewX + dx, y: drag.originViewY + dy }))
  }

  /** Ends a drag; true when the press never moved (i.e. it was a plain click). */
  const endDrag = (e: React.PointerEvent<HTMLDivElement>): boolean => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return false
    dragRef.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    return !drag.moved
  }

  const showCanvas = nodes.length > 0 && layout !== null
  const { nodeWidth, nodeHeight } = DEFAULT_LAYOUT_OPTIONS

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative h-full min-h-0 w-full touch-none overflow-hidden rounded-md border bg-muted/20 select-none',
        showCanvas && (dragging ? 'cursor-grabbing' : 'cursor-grab'),
        className
      )}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => {
        if (endDrag(e)) onSelect?.(null)
      }}
      onPointerCancel={endDrag}
    >
      {nodes.length === 0 ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyTitle>No family members</EmptyTitle>
            <EmptyDescription>There are no characters to draw here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : layout === null ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyTitle>Family tree unavailable</EmptyTitle>
            <EmptyDescription>A layout could not be computed for these characters.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className="absolute top-0 left-0"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: '0 0'
          }}
        >
          <svg
            className="absolute top-0 left-0"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.edges.map((edge) => {
              const from = placedById.get(edge.fromId)
              const to = placedById.get(edge.toId)
              if (!from || !to) return null
              const key = `${edge.kind}:${edge.fromId}->${edge.toId}`
              return edge.kind === 'primary' ? (
                <path
                  key={key}
                  className="stroke-border"
                  fill="none"
                  strokeWidth={1.5}
                  d={elbowPath(from, to, nodeWidth, nodeHeight)}
                />
              ) : (
                <path
                  key={key}
                  className="stroke-muted-foreground/40"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  d={curvePath(from, to, nodeWidth, nodeHeight)}
                />
              )
            })}
          </svg>

          {layout.separators.map((sep) => {
            const label = separatorLabel(sep, calendar)
            return (
              <div
                key={sep.y}
                className="absolute flex h-6 items-center justify-center"
                style={{ top: sep.y, left: 0, width: layout.width, transform: 'translateY(-50%)' }}
              >
                <div className="absolute inset-x-0 top-1/2 border-t border-dashed" />
                {label !== null && (
                  <span className="relative rounded-full border bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                    {label}
                  </span>
                )}
              </div>
            )
          })}

          {layout.nodes.map(({ node, x, y }) => {
            const stripe = node.group !== null ? groupColors?.[node.group] : undefined
            return (
              <button
                key={node.id}
                type="button"
                title={`${node.name ?? node.id}\n${node.birth ?? '?'} – ${node.death ?? '?'}`}
                className={cn(
                  'absolute flex cursor-pointer flex-col overflow-hidden rounded-md border bg-card px-2 py-1 text-left shadow-xs select-none',
                  node.ghost && 'border-dashed bg-muted/50 opacity-75',
                  selectedId === node.id && 'ring-2 ring-primary'
                )}
                style={{
                  left: x,
                  top: y,
                  width: nodeWidth,
                  height: nodeHeight,
                  ...(stripe !== undefined && { borderLeftWidth: 3, borderLeftColor: stripe })
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect?.(node.id)
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation()
                  onOpenCharacter?.(node.id)
                }}
              >
                <span className="truncate text-xs font-medium">
                  {node.name ?? node.id}
                  {node.female ? ' ♀' : ''}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {node.id}
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  {lifespanLabel(node, calendar)}
                </span>
                {node.ghost && node.ghostNote !== null && (
                  <span className="truncate text-[10px] text-muted-foreground italic">
                    {node.ghostNote}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {showCanvas && (
        <div
          className="absolute right-2 bottom-2 flex gap-1 rounded-md border bg-background/90 p-1 shadow-xs"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Button variant="outline" size="icon-sm" title="Zoom in" onClick={() => zoomBy(1.25)}>
            <ZoomIn />
          </Button>
          <Button variant="outline" size="icon-sm" title="Zoom out" onClick={() => zoomBy(1 / 1.25)}>
            <ZoomOut />
          </Button>
          <Button variant="outline" size="icon-sm" title="Fit to view" onClick={fitToView}>
            <Maximize />
          </Button>
        </div>
      )}
    </div>
  )
}
