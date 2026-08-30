import { useEffect, useState } from 'react'

export interface IconContext {
  gameDir: string | null
  modPath: string | null
  replacePaths: string[]
}

type Fetcher = (
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[],
  keys: string[]
) => Promise<Record<string, string | null>>

// "<family>:<key>" -> data URL (or null for no icon). Shared by all components;
// reset when the mod changes.
const cache = new Map<string, string | null>()
let cacheKey = ''

/**
 * Returns a lookup for icon data URLs, batch-fetching any keys not yet cached.
 * `undefined` means "still loading", `null` means "no icon".
 */
function useIcons(
  family: string,
  fetch: Fetcher,
  ctx: IconContext,
  keys: string[]
): (key: string) => string | null | undefined {
  const [, bump] = useState(0)
  const ctxKey = `${ctx.gameDir}|${ctx.modPath}`
  if (ctxKey !== cacheKey) {
    cacheKey = ctxKey
    cache.clear()
  }
  const missing = keys.filter((k) => !cache.has(`${family}:${k}`))
  const missingKey = missing.join(',')

  useEffect(() => {
    if (missing.length === 0) return
    let alive = true
    fetch(ctx.gameDir, ctx.modPath, ctx.replacePaths, missing).then((result) => {
      for (const [key, url] of Object.entries(result)) cache.set(`${family}:${key}`, url)
      if (alive) bump((n) => n + 1)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missingKey, ctxKey])

  return (key) => cache.get(`${family}:${key}`)
}

/** Trait icons, keyed by trait id. Full-color, drawn directly. */
export function useTraitIcons(
  ctx: IconContext,
  traits: string[]
): (trait: string) => string | null | undefined {
  return useIcons(
    'trait',
    (g, m, r, k) => window.ck3tools.getTraitIcons(g, m, r, k),
    ctx,
    traits
  )
}

/**
 * Flat icons (gender, sexuality, …), keyed by bare name. These are black
 * silhouettes on transparent, so render them as a mask rather than an `img`.
 */
export function useFlatIcons(
  ctx: IconContext,
  names: string[]
): (name: string) => string | null | undefined {
  return useIcons('flat', (g, m, r, k) => window.ck3tools.getFlatIcons(g, m, r, k), ctx, names)
}

/**
 * Skill icons (diplomacy, martial, …), keyed by skill. Full-color, drawn
 * directly. The set is fixed — the six skills are engine constants — but the
 * files behind them can be overridden by a mod.
 */
export function useSkillIcons(
  ctx: IconContext,
  skills: string[]
): (skill: string) => string | null | undefined {
  return useIcons('skill', (g, m, r, k) => window.ck3tools.getSkillIcons(g, m, r, k), ctx, skills)
}

/**
 * Faith icons, keyed by the bare name a faith's `icon =` line gives. Full-color
 * (they are the game's faith emblems), so drawn directly.
 */
export function useFaithIcons(
  ctx: IconContext,
  icons: string[]
): (icon: string) => string | null | undefined {
  return useIcons('faith', (g, m, r, k) => window.ck3tools.getFaithIcons(g, m, r, k), ctx, icons)
}
