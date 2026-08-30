import { useEffect, useState } from 'react'
import type { ModFont, ModFonts } from '@shared/types'

/**
 * Dresses the app in the selected mod's own CK3 fonts: its `StandardGameFont`
 * for body text and its `TitleFont` for headings. The faces arrive from the
 * main process as data URLs, so they go in as a stylesheet appended after
 * Tailwind's — late enough to redefine the `--sans` / `--heading` tokens that
 * the `font-sans` and `font-heading` utilities read through.
 */

const STYLE_ID = 'ck3-mod-fonts'
const STANDARD_FAMILY = 'CK3 Mod Standard'
const TITLE_FAMILY = 'CK3 Mod Title'
/** What the theme falls back to — and stays on for glyphs a mod font lacks. */
const FALLBACK = "'Inter Variable', sans-serif"

function faceRules(family: string, font: ModFont): string {
  return font.faces
    .map(
      (face) => `@font-face {
  font-family: '${family}';
  src: url("${face.src}") format('${face.format}');
  font-weight: ${face.weight};
  font-style: ${face.style};
  font-display: block;
}`
    )
    .join('\n')
}

function applyFonts(fonts: ModFonts | null): void {
  const existing = document.getElementById(STYLE_ID)
  if (!fonts) {
    existing?.remove()
    return
  }
  const rules: string[] = []
  const vars: string[] = []
  if (fonts.standard) {
    rules.push(faceRules(STANDARD_FAMILY, fonts.standard))
    vars.push(`  --sans: '${STANDARD_FAMILY}', ${FALLBACK};`)
  }
  if (fonts.title) {
    rules.push(faceRules(TITLE_FAMILY, fonts.title))
    // Headings fall back to the body font before the app's own, so a mod that
    // sets only one of the two still reads as one typeface
    const standard = fonts.standard ? `'${STANDARD_FAMILY}', ` : ''
    vars.push(`  --heading: '${TITLE_FAMILY}', ${standard}${FALLBACK};`)
  }
  rules.push(`:root {\n${vars.join('\n')}\n}`)

  const style = existing ?? document.createElement('style')
  style.textContent = rules.join('\n')
  if (!existing) {
    style.id = STYLE_ID
    document.head.append(style)
  }
}

/**
 * Loads and installs the mod's fonts, returning them so callers can report
 * what resolved. Null means the app keeps its own font — the setting is off,
 * no mod is selected, or the mod ships no fonts of its own.
 */
export function useModFonts(
  enabled: boolean,
  gameDir: string | null,
  modPath: string | null,
  replacePaths: string[]
): ModFonts | null {
  const [fonts, setFonts] = useState<ModFonts | null>(null)
  const replaceKey = replacePaths.join('|')

  useEffect(() => {
    if (!enabled || !modPath) {
      setFonts(null)
      return
    }
    let alive = true
    window.ck3tools.getModFonts(gameDir, modPath, replacePaths).then((result) => {
      if (alive) setFonts(result)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, gameDir, modPath, replaceKey])

  useEffect(() => applyFonts(fonts), [fonts])

  return fonts
}
