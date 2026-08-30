import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { getModFonts } from './fonts'

// Synthetic game/mod trees in a temp dir — never touches real CK3 files
const root = mkdtempSync(join(tmpdir(), 'ck3-tools-fonts-'))
const gameDir = join(root, 'game')

function write(base: string, rel: string, content: string): void {
  const file = join(base, ...rel.split('/'))
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content, 'utf-8')
}

/** A distinct stand-in per file, so tests can tell which copy was read. */
function fontFile(base: string, rel: string, marker: string): void {
  write(base, rel, marker)
}

const b64 = (marker: string): string => Buffer.from(marker, 'utf-8').toString('base64')

const GAME_FONTS = `
fontfiles = {
	name = "Gitan-Regular"
	always_load = yes
	group = {
		languages = { "l_russian" }
		files = { "fonts/Cyrillic/Nope.ttf" }
	}
	group = {
		languages = { "l_english" "l_french" }
		files = { "fonts/Gitan/GitanLatin-Regular.otf" }
	}
}

fontfiles = {
	name = "Gitan-Bold"
	group = {
		languages = { "l_english" }
		files = { "fonts/Gitan/GitanLatin-Bold.otf" }
	}
}

fontfiles = {
	name = "Fondamento-Regular"
	group = {
		languages = { "l_english" }
		files = { "fonts/Fondamento/Fondamento-Regular.ttf" }
	}
}

font = {
	name = "StandardGameFont"
	fontstyle = {
		style = regular
		fontfiles = "Gitan-Regular"
	}
	fontstyle = {
		style = bold
		fontfiles = "Gitan-Bold"
	}
}

# Title font
font = {
	name = "TitleFont"
	fontstyle = {
		style = regular
		fontfiles = "Fondamento-Regular"
	}
}
`

function makeGame(): void {
  write(gameDir, 'fonts/fonts.font', GAME_FONTS)
  fontFile(gameDir, 'fonts/Gitan/GitanLatin-Regular.otf', 'game-gitan-regular')
  fontFile(gameDir, 'fonts/Gitan/GitanLatin-Bold.otf', 'game-gitan-bold')
  fontFile(gameDir, 'fonts/Fondamento/Fondamento-Regular.ttf', 'game-fondamento')
  fontFile(gameDir, 'fonts/Cyrillic/Nope.ttf', 'game-cyrillic')
}
makeGame()

function mod(name: string): string {
  const path = join(root, name)
  mkdirSync(path, { recursive: true })
  return path
}

afterAll(() => rmSync(root, { recursive: true, force: true }))

describe('getModFonts', () => {
  it('resolves a mod that ships its own fonts.font and files', () => {
    const modPath = mod('own-fonts')
    // `always_load =` with no value is a real typo in shipped mods: the parser
    // must not read the next statement's key as its value
    write(
      modPath,
      'fonts/fonts.font',
      `
fontfiles = {
	name = "Dalek"
	always_load =
	group = {
		languages = { "l_english" }
		files = { "fonts/mapfont/Dalek.ttf" }
	}
}
${GAME_FONTS}
font = {
	name = "TitleFont"
	fontstyle = {
		style = regular
		fontfiles = "Dalek"
	}
}
`
    )
    fontFile(modPath, 'fonts/mapfont/Dalek.ttf', 'mod-dalek')
    fontFile(modPath, 'fonts/Gitan/GitanLatin-Regular.otf', 'mod-gitan-regular')

    const fonts = getModFonts(gameDir, modPath, [])
    expect(fonts?.standard?.name).toBe('Gitan-Regular')
    expect(fonts?.standard?.faces).toEqual([
      {
        weight: 'normal',
        style: 'normal',
        // the mod's own copy wins over the game's
        src: `data:font/otf;base64,${b64('mod-gitan-regular')}`,
        format: 'opentype'
      },
      {
        weight: 'bold',
        style: 'normal',
        src: `data:font/otf;base64,${b64('game-gitan-bold')}`,
        format: 'opentype'
      }
    ])
    // The mod's own `font = { name = "TitleFont" }` wins over the earlier one
    expect(fonts?.title).toEqual({
      name: 'Dalek',
      faces: [
        {
          weight: 'normal',
          style: 'normal',
          src: `data:font/ttf;base64,${b64('mod-dalek')}`,
          format: 'truetype'
        }
      ]
    })
  })

  it('picks the English group, not merely the first one', () => {
    const fonts = getModFonts(gameDir, mod('english-group'), [])
    // No mod fonts at all, so nothing is used — but the game file it read
    // still has to have chosen the Latin group over the Cyrillic one
    expect(fonts).toBeNull()
    const withFile = mod('english-group-file')
    fontFile(withFile, 'fonts/Gitan/GitanLatin-Regular.otf', 'mod-latin')
    expect(getModFonts(gameDir, withFile, [])?.standard?.faces[0].src).toBe(
      `data:font/otf;base64,${b64('mod-latin')}`
    )
  })

  it('uses the game font files when the mod only overrides fonts.font', () => {
    const modPath = mod('rebind-only')
    write(modPath, 'fonts/fonts.font', GAME_FONTS)
    const fonts = getModFonts(gameDir, modPath, [])
    expect(fonts?.standard?.faces).toEqual([
      {
        weight: 'normal',
        style: 'normal',
        src: `data:font/otf;base64,${b64('game-gitan-regular')}`,
        format: 'opentype'
      },
      {
        weight: 'bold',
        style: 'normal',
        src: `data:font/otf;base64,${b64('game-gitan-bold')}`,
        format: 'opentype'
      }
    ])
  })

  it('reads bold, italic and bold|italic styles', () => {
    const modPath = mod('styles')
    write(
      modPath,
      'fonts/fonts.font',
      `
fontfiles = {
	name = "Only"
	group = {
		languages = { "l_english" }
		files = { "fonts/Only/only.ttf" }
	}
}
font = {
	name = "StandardGameFont"
	fontstyle = { style = regular fontfiles = "Only" }
	fontstyle = { style = bold fontfiles = "Only" }
	fontstyle = { style = italic fontfiles = "Only" }
	fontstyle = { style = bold|italic fontfiles = "Only" }
	fontstyle = { style = regular fontfiles = "Only" }
	underlineformats = { default = { thickness = 1 offset = 0.12 } }
}
`
    )
    fontFile(modPath, 'fonts/Only/only.ttf', 'only')
    const faces = getModFonts(gameDir, modPath, [])?.standard?.faces
    expect(faces?.map((f) => `${f.weight} ${f.style}`)).toEqual([
      'normal normal',
      'bold normal',
      'normal italic',
      'bold italic'
    ])
  })

  it('returns null when the mod contributes no fonts of its own', () => {
    expect(getModFonts(gameDir, mod('empty'), [])).toBeNull()
    expect(getModFonts(gameDir, null, [])).toBeNull()
    expect(getModFonts(null, mod('no-game'), [])).toBeNull()
  })

  it('skips styles whose files are missing, and drops a font left with none', () => {
    const modPath = mod('dangling')
    write(
      modPath,
      'fonts/fonts.font',
      `
fontfiles = {
	name = "Ghost"
	group = { languages = { "l_english" } files = { "fonts/Ghost/ghost.ttf" } }
}
fontfiles = {
	name = "Real"
	group = { languages = { "l_english" } files = { "fonts/Real/real.ttf" } }
}
font = {
	name = "StandardGameFont"
	fontstyle = { style = regular fontfiles = "Real" }
	fontstyle = { style = bold fontfiles = "Ghost" }
}
font = {
	name = "TitleFont"
	fontstyle = { style = regular fontfiles = "Ghost" }
}
`
    )
    fontFile(modPath, 'fonts/Real/real.ttf', 'real')
    const fonts = getModFonts(gameDir, modPath, [])
    expect(fonts?.standard?.faces).toHaveLength(1)
    expect(fonts?.title).toBeNull()
  })

  it('ignores a font file in a format the browser cannot load', () => {
    const modPath = mod('bitmap')
    write(
      modPath,
      'fonts/fonts.font',
      `
fontfiles = {
	name = "Old"
	group = { languages = { "l_english" } files = { "fonts/Old/old.fnt" "fonts/Old/old.ttf" } }
}
font = { name = "StandardGameFont" fontstyle = { style = regular fontfiles = "Old" } }
`
    )
    fontFile(modPath, 'fonts/Old/old.fnt', 'bitmap')
    fontFile(modPath, 'fonts/Old/old.ttf', 'outline')
    expect(getModFonts(gameDir, modPath, [])?.standard?.faces[0].src).toBe(
      `data:font/ttf;base64,${b64('outline')}`
    )
  })

  it('honours replace_path over the fonts folder', () => {
    const modPath = mod('replaced')
    write(modPath, 'fonts/fonts.font', GAME_FONTS)
    fontFile(modPath, 'fonts/Fondamento/Fondamento-Regular.ttf', 'mod-fondamento')
    // The game's Gitan files are hidden, so only the title font resolves
    const fonts = getModFonts(gameDir, modPath, ['fonts'])
    expect(fonts?.standard).toBeNull()
    expect(fonts?.title?.faces[0].src).toBe(`data:font/ttf;base64,${b64('mod-fondamento')}`)
  })
})
