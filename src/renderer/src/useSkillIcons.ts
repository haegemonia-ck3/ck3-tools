import { useEffect, useState } from 'react'
import type { IconContext } from './useTraitIcons'

// Module-level cache shared by all components; reset when the mod changes
let cache: Record<string, string | null> | null = null
let cacheKey = ''

/**
 * Returns a lookup for the skill icon data URLs, fetched once per mod context.
 * `undefined` means "still loading", `null` means "no icon".
 */
export function useSkillIcons(ctx: IconContext): (skill: string) => string | null | undefined {
  const [, bump] = useState(0)
  const key = `${ctx.gameDir}|${ctx.modPath}`
  if (key !== cacheKey) {
    cacheKey = key
    cache = null
  }

  useEffect(() => {
    if (cache) return
    let alive = true
    window.ck3tools.getSkillIcons(ctx.gameDir, ctx.modPath, ctx.replacePaths).then((result) => {
      cache = result
      if (alive) bump((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return (skill) => cache?.[skill]
}
