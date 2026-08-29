import { useEffect, useState } from 'react'

export interface IconContext {
  gameDir: string | null
  modPath: string | null
  replacePaths: string[]
}

// Module-level cache shared by all components; reset when the mod changes
const cache = new Map<string, string | null>()
let cacheKey = ''

/**
 * Returns a lookup for trait icon data URLs, batch-fetching any traits not yet
 * cached. `undefined` means "still loading", `null` means "no icon".
 */
export function useTraitIcons(
  ctx: IconContext,
  traits: string[]
): (trait: string) => string | null | undefined {
  const [, bump] = useState(0)
  const key = `${ctx.gameDir}|${ctx.modPath}`
  if (key !== cacheKey) {
    cacheKey = key
    cache.clear()
  }
  const missing = traits.filter((t) => !cache.has(t))
  const missingKey = missing.join(',')

  useEffect(() => {
    if (missing.length === 0) return
    let alive = true
    window.ck3tools
      .getTraitIcons(ctx.gameDir, ctx.modPath, ctx.replacePaths, missing)
      .then((result) => {
        for (const [trait, url] of Object.entries(result)) cache.set(trait, url)
        if (alive) bump((n) => n + 1)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, key])

  return (trait) => cache.get(trait)
}
