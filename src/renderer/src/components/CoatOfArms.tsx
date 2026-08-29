import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'
import { useApp } from '../AppContext'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

/**
 * A rendered CK3 coat of arms. `ids` are tried in order and the first one
 * with a definition wins — pass a house id followed by its dynasty's id to
 * mirror the game's fallback. Holds its square either way: a skeleton while
 * rendering, an empty shield when no id has a CoA.
 */
interface Props {
  ids: (string | null | undefined)[]
  /** CSS pixel size of the (square) image; rendered at 256px internally */
  size?: number
  className?: string
}

// Data URLs per `modFile|id`, kept across mounts so lists and revisits are instant
const cache = new Map<string, string | null>()

export default function CoatOfArms({ ids, size = 96, className }: Props): React.JSX.Element {
  const { settings, selectedMod } = useApp()
  const gameDir = settings?.gameDir ?? null
  const modPath = selectedMod?.path ?? null
  const modFile = selectedMod?.file ?? ''
  const replacePaths = selectedMod?.replacePaths ?? []

  const wanted = ids.filter((id): id is string => typeof id === 'string' && id !== '')
  const [, bump] = useState(0)

  const missing = wanted.filter((id) => !cache.has(`${modFile}|${id}`))
  useEffect(() => {
    if (missing.length === 0) return
    let stale = false
    window.ck3tools.getCoatsOfArms(gameDir, modPath, replacePaths, missing).then((result) => {
      for (const [id, url] of Object.entries(result)) cache.set(`${modFile}|${id}`, url)
      if (!stale) bump((n) => n + 1)
    })
    return () => {
      stale = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modFile, missing.join('\n')])

  const url = wanted.map((id) => cache.get(`${modFile}|${id}`)).find((u) => u != null) ?? null
  if (url !== null) {
    return (
      <img
        src={url}
        alt="Coat of arms"
        width={size}
        height={size}
        className={cn('rounded-md border shadow-sm', className)}
      />
    )
  }

  const box = { width: size, height: size }
  // Some id is still rendering in the main process — hold the space
  if (missing.length > 0) {
    return <Skeleton style={box} className={cn('shrink-0 rounded-md border', className)} />
  }
  return (
    <div
      style={box}
      title={
        wanted.length === 0 ? 'No dynasty or house' : 'No coat of arms defined'
      }
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md border border-dashed bg-muted/40',
        className
      )}
    >
      <Shield
        aria-hidden
        strokeWidth={1.25}
        style={{ width: size * 0.4, height: size * 0.4 }}
        className="text-muted-foreground/40"
      />
      <span className="sr-only">No coat of arms</span>
    </div>
  )
}
