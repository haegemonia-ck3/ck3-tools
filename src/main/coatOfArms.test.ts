import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  getCoatsOfArms,
  parseCoaDef,
  parseColorLiteral,
  parseNamedColors,
  renderCoa,
  substituteVariables
} from './coatOfArms'
import type { DecodedTexture, Rgb, TextureLookup } from './coatOfArms'

describe('parseColorLiteral', () => {
  it('parses rgb triples', () => {
    expect(parseColorLiteral('rgb', ' 10 20 30 ')).toEqual([10, 20, 30])
  })
  it('parses hsv (0-1)', () => {
    expect(parseColorLiteral('hsv', '0 1 1')).toEqual([255, 0, 0])
    expect(parseColorLiteral('hsv', '0.3333333 1 1')).toEqual([0, 255, 0])
  })
  it('parses hsv360', () => {
    expect(parseColorLiteral('hsv360', '240 100 100')).toEqual([0, 0, 255])
  })
  it('parses bare triples, scaling 0-1 floats', () => {
    expect(parseColorLiteral(undefined, '1 0.5 0')).toEqual([255, 127.5, 0])
    expect(parseColorLiteral(undefined, '255 128 0')).toEqual([255, 128, 0])
  })
  it('rejects malformed values', () => {
    expect(parseColorLiteral('rgb', '1 2')).toBeNull()
  })
})

describe('parseNamedColors', () => {
  it('reads entries of the colors block in all formats', () => {
    const named = parseNamedColors(`
colors = {
	# a comment
	red = hsv { 0 1 1 }
	brown = hsv360 { 021 074 045 }
	d_thing_color = rgb { 31 97 15 }
	plain = { 0.5 0.5 0.5 }
}
`)
    expect(named.get('red')).toEqual([255, 0, 0])
    expect(named.get('d_thing_color')).toEqual([31, 97, 15])
    expect(named.get('plain')).toEqual([127.5, 127.5, 127.5])
    expect(named.size).toBe(4)
  })
  it('ignores text outside a colors block', () => {
    expect(parseNamedColors('other = { red = rgb { 1 2 3 } }').size).toBe(0)
  })
})

describe('substituteVariables', () => {
  it('substitutes @name occurrences', () => {
    const out = substituteVariables('@sm = 0.27\nfoo = { scale = { @sm @sm } }')
    expect(out).toContain('scale = { 0.27 0.27 }')
  })
  it('leaves unknown variables alone', () => {
    expect(substituteVariables('a = @nope')).toBe('a = @nope')
  })
})

describe('parseCoaDef', () => {
  it('parses the real-world shape written by the CoA designer', () => {
    const coa = parseCoaDef(`
	pattern="pattern_solid.dds"
	color1=red
	color2=rgb { 213 140 33 }
	colored_emblem={
		color1=white
		texture="ce_spartan_dokana.dds"
		instance={
			scale={ 0.800000 0.800000 }
		}
	}
	colored_emblem={
		color1=black
		color2=white
		texture="border_aspis_geometric_10.dds"
	}
`)
    expect(coa.pattern).toBe('pattern_solid.dds')
    expect(coa.colors[0]).toEqual({ name: 'red' })
    expect(coa.colors[1]).toEqual({ value: [213, 140, 33] })
    expect(coa.colors[2]).toBeNull()
    expect(coa.emblems).toHaveLength(2)
    expect(coa.emblems[0].texture).toBe('ce_spartan_dokana.dds')
    expect(coa.emblems[0].colors[0]).toEqual({ name: 'white' })
    expect(coa.emblems[0].instances).toEqual([
      { x: 0.5, y: 0.5, sx: 0.8, sy: 0.8, rotation: 0, depth: 0 }
    ])
    // No instance block -> one default instance
    expect(coa.emblems[1].instances).toEqual([
      { x: 0.5, y: 0.5, sx: 1, sy: 1, rotation: 0, depth: 0 }
    ])
  })

  it('parses instances with position, rotation, depth and mask', () => {
    const coa = parseCoaDef(`
	pattern = "pattern_solid.dds"
	color1 = "blue"
	colored_emblem = {
		texture = "ce_x.dds"
		color1 = "yellow"
		mask = { 1 3 }
		instance = { position = { 0.315 0.29 } scale = { -0.48 0.48 } rotation = 45 depth = 1.01 }
		instance = { position = { 0.5 0.68 } }
	}
`)
    const e = coa.emblems[0]
    expect(e.mask).toEqual([1, 3])
    expect(e.instances[0]).toEqual({ x: 0.315, y: 0.29, sx: -0.48, sy: 0.48, rotation: 45, depth: 1.01 })
    expect(e.instances[1]).toEqual({ x: 0.5, y: 0.68, sx: 1, sy: 1, rotation: 0, depth: 0 })
  })

  it('does not leak emblem colors into the coat colors', () => {
    const coa = parseCoaDef(`
	color1 = red
	colored_emblem = { texture = "a.dds" color2 = white }
`)
    expect(coa.colors[1]).toBeNull()
    expect(coa.emblems[0].colors[1]).toEqual({ name: 'white' })
  })
})

// ---------- renderCoa with synthetic textures ----------

const NAMED = new Map<string, Rgb>([
  ['red', [200, 0, 0]],
  ['blue', [0, 0, 200]],
  ['yellow', [230, 200, 0]],
  ['white', [240, 240, 240]]
])

function tex(width: number, height: number, pixels: number[][]): DecodedTexture {
  const rgba = new Uint8Array(width * height * 4)
  pixels.forEach((p, i) => rgba.set(p, i * 4))
  return { width, height, rgba }
}

/** Solid 1x1 pattern: all red channel = color1 everywhere. */
const SOLID = tex(1, 1, [[255, 0, 0, 255]])
/** 2x1 vertical split: left = color1 (red), right = color2 (yellow). */
const SPLIT = tex(2, 1, [
  [255, 0, 0, 255],
  [255, 255, 0, 255]
])

function px(out: Uint8ClampedArray, size: number, x: number, y: number): number[] {
  return [...out.slice((y * size + x) * 4, (y * size + x) * 4 + 3)]
}

function lookup(map: Record<string, DecodedTexture>): TextureLookup {
  return (_kind, file) => map[file] ?? null
}

describe('renderCoa', () => {
  const SIZE = 32

  it('fills a solid pattern with color1', () => {
    const coa = parseCoaDef('pattern = "solid.dds"\ncolor1 = "blue"')
    const out = renderCoa(coa, NAMED, lookup({ 'solid.dds': SOLID }), SIZE)
    expect(px(out, SIZE, 0, 0)).toEqual([0, 0, 200])
    expect(px(out, SIZE, 31, 31)).toEqual([0, 0, 200])
  })

  it('falls back to a solid color1 fill when the pattern texture is missing', () => {
    const coa = parseCoaDef('pattern = "gone.dds"\ncolor1 = "red"')
    const out = renderCoa(coa, NAMED, lookup({}), SIZE)
    expect(px(out, SIZE, 16, 16)).toEqual([200, 0, 0])
  })

  it('splits pattern zones between color1 and color2', () => {
    const coa = parseCoaDef('pattern = "split.dds"\ncolor1 = "red"\ncolor2 = "blue"')
    const out = renderCoa(coa, NAMED, lookup({ 'split.dds': SPLIT }), SIZE)
    expect(px(out, SIZE, 0, 16)).toEqual([200, 0, 0])
    expect(px(out, SIZE, 31, 16)).toEqual([0, 0, 200])
  })

  it('draws an emblem: base color1, green channel color2, red channel color3, alpha shape', () => {
    // 2x2 emblem: base | color2-zone / color3-zone | transparent
    const emblem = tex(2, 2, [
      [0, 0, 128, 255],
      [0, 255, 128, 255],
      [255, 0, 128, 255],
      [0, 0, 128, 0]
    ])
    const coa = parseCoaDef(`
	pattern = "solid.dds"
	color1 = "blue"
	colored_emblem = {
		texture = "e.dds"
		color1 = "red"
		color2 = "yellow"
		color3 = "white"
	}
`)
    const out = renderCoa(coa, NAMED, lookup({ 'solid.dds': SOLID, 'e.dds': emblem }), SIZE)
    // Sample deep inside each quadrant (edge-clamped bilinear keeps corners pure)
    expect(px(out, SIZE, 1, 1)).toEqual([200, 0, 0]) // emblem color1 (B=128 -> neutral shade)
    expect(px(out, SIZE, 30, 1)).toEqual([230, 200, 0]) // color2
    expect(px(out, SIZE, 1, 30)).toEqual([240, 240, 240]) // color3
    expect(px(out, SIZE, 30, 30)).toEqual([0, 0, 200]) // transparent -> pattern shows
  })

  it('mirrors an emblem with a negative x scale', () => {
    // Left half opaque color1, right half transparent
    const emblem = tex(2, 1, [
      [0, 0, 128, 255],
      [0, 0, 128, 0]
    ])
    const coa = parseCoaDef(`
	pattern = "solid.dds"
	color1 = "blue"
	colored_emblem = {
		texture = "e.dds"
		color1 = "red"
		instance = { scale = { -1.0 1.0 } }
	}
`)
    const out = renderCoa(coa, NAMED, lookup({ 'solid.dds': SOLID, 'e.dds': emblem }), SIZE)
    expect(px(out, SIZE, 0, 16)).toEqual([0, 0, 200]) // now transparent side
    expect(px(out, SIZE, 31, 16)).toEqual([200, 0, 0]) // opaque side mirrored right
  })

  it('restricts a masked emblem to the listed pattern zones', () => {
    const emblem = tex(1, 1, [[0, 0, 128, 255]])
    const coa = parseCoaDef(`
	pattern = "split.dds"
	color1 = "red"
	color2 = "blue"
	colored_emblem = {
		texture = "e.dds"
		color1 = "white"
		mask = { 2 }
	}
`)
    const out = renderCoa(coa, NAMED, lookup({ 'split.dds': SPLIT, 'e.dds': emblem }), SIZE)
    expect(px(out, SIZE, 0, 16)).toEqual([200, 0, 0]) // zone 1: pattern only
    expect(px(out, SIZE, 31, 16)).toEqual([240, 240, 240]) // zone 2: emblem
  })

  it('draws larger depth first (further back)', () => {
    const emblem = tex(1, 1, [[0, 0, 128, 255]])
    const coa = parseCoaDef(`
	pattern = "solid.dds"
	color1 = "blue"
	colored_emblem = {
		texture = "e.dds"
		color1 = "white"
		instance = { depth = 1.01 }
	}
	colored_emblem = {
		texture = "e.dds"
		color1 = "red"
	}
`)
    const out = renderCoa(coa, NAMED, lookup({ 'solid.dds': SOLID, 'e.dds': emblem }), SIZE)
    expect(px(out, SIZE, 16, 16)).toEqual([200, 0, 0]) // depth 0 emblem on top
  })

  it('resolves colorN back-references against the coat colors', () => {
    const emblem = tex(1, 1, [[0, 0, 128, 255]])
    const coa = parseCoaDef(`
	pattern = "solid.dds"
	color1 = "blue"
	color2 = "yellow"
	colored_emblem = {
		texture = "e.dds"
		color1 = color2
	}
`)
    const out = renderCoa(coa, NAMED, lookup({ 'solid.dds': SOLID, 'e.dds': emblem }), SIZE)
    expect(px(out, SIZE, 16, 16)).toEqual([230, 200, 0]) // coat's yellow
  })
})

// ---------- File lookup and layering ----------

const root = mkdtempSync(join(tmpdir(), 'ck3-tools-coa-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

function writeTree(base: string, files: Record<string, string>): string {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(base, ...rel.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, content, 'utf-8')
  }
  return base
}

describe('getCoatsOfArms', () => {
  const gameDir = writeTree(join(root, 'game'), {
    'common/named_colors/default.txt': 'colors = { red = rgb { 200 0 0 } }',
    'common/coat_of_arms/coat_of_arms/00_game.txt':
      'game_only = { pattern = "p.dds" color1 = red }\nshared = { pattern = "p.dds" color1 = red }'
  })
  const modPath = writeTree(join(root, 'mod'), {
    'common/coat_of_arms/coat_of_arms/10_mod.txt':
      '@s = 0.5\nmod_only = { pattern = "p.dds" color1 = red colored_emblem = { texture = "e.dds" color1 = red instance = { scale = { @s @s } } } }\nshared = { pattern = "p.dds" color1 = red }'
  })

  it('renders defined ids to PNG data URLs and returns null for unknown ids', () => {
    const result = getCoatsOfArms(gameDir, modPath, [], ['game_only', 'mod_only', 'nope'])
    expect(result.game_only).toMatch(/^data:image\/png;base64,/)
    expect(result.mod_only).toMatch(/^data:image\/png;base64,/)
    expect(result.nope).toBeNull()
  })

  it('is case-insensitive about ids, like the game', () => {
    const result = getCoatsOfArms(gameDir, modPath, [], ['GAME_only'])
    expect(result.GAME_only).toMatch(/^data:image\/png;base64,/)
  })

  it('serves repeated requests from cache', () => {
    const a = getCoatsOfArms(gameDir, modPath, [], ['shared'])
    const b = getCoatsOfArms(gameDir, modPath, [], ['shared'])
    expect(a.shared).toBe(b.shared)
  })
})
