/**
 * Pure selection/derivation helpers for the Culture Editor.
 *
 * Culture ids are matched case-insensitively (real files reference `Attic` as
 * `attic`) while raw spellings are preserved for display and writing. A
 * culture may name parents that no file defines; those still show as
 * references, just without anywhere to navigate to.
 */
import type {
  CultureCharacter,
  CultureData,
  CultureDef,
  CultureEthnicity,
  CulturePatch,
  RefEntry
} from '@shared/types'

export const normId = (id: string): string => id.trim().toLowerCase()

export interface CultureListRow {
  id: string
  /** Localized name when one resolved, else null (the id carries the display) */
  name: string | null
  /** Resolved swatch color, or null when the culture has none */
  color: string | null
  ethos: string | null
  heritage: string | null
  language: string | null
  traditions: number
  /** Characters in the mod's history that carry this culture */
  members: number
  inMod: boolean
  file: string
}

/** The culture's display name: localized where possible, else its raw id. */
export const cultureLabel = (def: CultureDef): string => def.localizedName ?? def.id

/** The culture with this id, matched case-insensitively. */
export function findCulture(data: CultureData, id: string): CultureDef | null {
  const key = normId(id)
  return data.cultures.find((c) => normId(c.id) === key) ?? null
}

/** Characters whose `culture =` points at this culture. */
export function membersOf(data: CultureData, id: string): CultureCharacter[] {
  const key = normId(id)
  return data.characters.filter((c) => c.culture !== null && normId(c.culture) === key)
}

/** Cultures that name this one among their `parents`. */
export function childrenOf(data: CultureData, id: string): CultureDef[] {
  const key = normId(id)
  return data.cultures.filter((c) => c.parents.some((p) => normId(p) === key))
}

/**
 * Every culture, with the character counts the list column shows. Counts come
 * from one pass over the characters so a total conversion doesn't pay
 * cultures × characters.
 */
export function buildRows(data: CultureData): CultureListRow[] {
  const counts = new Map<string, number>()
  for (const c of data.characters) {
    if (c.culture === null) continue
    const key = normId(c.culture)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return data.cultures.map((c) => ({
    id: c.id,
    name: c.localizedName,
    color: c.color?.hex ?? null,
    ethos: c.ethos,
    heritage: c.heritage,
    language: c.language,
    traditions: c.traditions.length,
    members: counts.get(normId(c.id)) ?? 0,
    inMod: c.inMod,
    file: c.file
  }))
}

/**
 * A lookup from reference id to display name, over entries whose ids may
 * differ in case from how cultures spell them.
 */
export function nameLookup(entries: readonly RefEntry[]): (id: string) => string | null {
  const names = new Map<string, string>()
  for (const e of entries) {
    if (e.name !== null && e.name !== '') names.set(normId(e.id), e.name)
  }
  return (id) => names.get(normId(id)) ?? null
}

/** Every pillar the mod loads, of any type — for resolving a culture's pillar names. */
export function allPillars(data: CultureData): RefEntry[] {
  return Object.values(data.pillars).flat()
}

/** Members ordered by birth year (unknown last), then id — the way the tree reads. */
export function sortMembers(members: CultureCharacter[]): CultureCharacter[] {
  const year = (d: string | null): number | null => {
    const m = d === null ? null : /^(\d{1,4})(?:\.|$)/.exec(d.trim())
    return m ? Number(m[1]) : null
  }
  return [...members].sort((a, b) => {
    const ya = year(a.birth)
    const yb = year(b.birth)
    if (ya !== null && yb !== null && ya !== yb) return ya - yb
    if (ya === null && yb !== null) return 1
    if (ya !== null && yb === null) return -1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })
}

/**
 * Readable foreground for a culture swatch: white on dark fills, near-black on
 * light ones, by sRGB relative luminance.
 */
export function swatchForeground(hex: string): string {
  const channel = (i: number): number => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return luminance > 0.45 ? '#16130f' : '#ffffff'
}

/**
 * The fields a culture must set to be playable — every hand-authored culture on
 * disk sets all of them, vanilla's and the mod's alike. They carry the create
 * form's asterisks and gate its Create button, matching what `createCulture`
 * enforces on the other side of the bridge.
 *
 * The graphics bundles are deliberately absent: they're free-form tags with no
 * registry to pick from, and requiring them would make writing the first
 * culture into an empty `replace_path` folder impossible.
 */
export const REQUIRED_FIELDS = [
  ['color', 'Colour'],
  ['ethos', 'Ethos'],
  ['heritage', 'Heritage'],
  ['language', 'Language'],
  ['martialCustom', 'Martial custom'],
  ['nameList', 'Name list'],
  ['ethnicities', 'Ethnicities']
] as const satisfies readonly (readonly [keyof CulturePatch, string])[]

const REQUIRED_KEYS: ReadonlySet<string> = new Set(REQUIRED_FIELDS.map(([key]) => key))

/** Whether a field carries a required asterisk in the create form. */
export const isRequired = (key: keyof CulturePatch): boolean => REQUIRED_KEYS.has(key)

/** A culture definition as the editable draft both panels hold. */
export function draftOf(def: CultureDef): CulturePatch {
  return {
    color: def.color?.hex ?? null,
    ethos: def.ethos,
    heritage: def.heritage,
    language: def.language,
    martialCustom: def.martialCustom,
    headDetermination: def.headDetermination,
    traditions: def.traditions,
    nameList: def.nameList,
    parents: def.parents,
    created: def.created,
    coaGfx: def.coaGfx,
    buildingGfx: def.buildingGfx,
    clothingGfx: def.clothingGfx,
    unitGfx: def.unitGfx,
    houseCoaFrame: def.houseCoaFrame,
    ethnicities: def.ethnicities
  }
}

/**
 * Seed for "start from an existing culture". A derived culture wants its source
 * as its parent rather than a copy of the source's own ancestors, and a copied
 * founding date says something false about the new culture.
 */
export function seedFrom(def: CultureDef): CulturePatch {
  return { ...draftOf(def), parents: [def.id], created: null }
}

/** The most common non-empty value of a field across the cultures the mod loads. */
function modal<T extends string>(values: (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>()
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  let best: T | null = null
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/**
 * A blank culture, pre-filled from the conventions of the cultures the mod
 * actually loads rather than from vanilla's — so a total conversion starts from
 * its own house style. `color` is passed in because it is the one field with no
 * sensible common value.
 */
export function blankDraft(data: CultureData, color: string): CulturePatch {
  const one = (pick: (c: CultureDef) => string[]): string[] => {
    const value = modal(data.cultures.map((c) => pick(c)[0]))
    return value === null ? [] : [value]
  }
  return {
    color,
    ethos: null,
    heritage: null,
    language: null,
    martialCustom: modal(data.cultures.map((c) => c.martialCustom)),
    headDetermination: modal(data.cultures.map((c) => c.headDetermination)),
    traditions: [],
    nameList: null,
    parents: [],
    created: null,
    coaGfx: one((c) => c.coaGfx),
    buildingGfx: one((c) => c.buildingGfx),
    clothingGfx: one((c) => c.clothingGfx),
    unitGfx: one((c) => c.unitGfx),
    houseCoaFrame: modal(data.cultures.map((c) => c.houseCoaFrame)),
    ethnicities: [{ weight: '100', id: '' }]
  }
}

/** The weights `createCulture` accepts on an ethnicity row. */
const WEIGHT = /^\d+(\.\d+)?$/

/**
 * Whether the ethnicities block is one the writer would accept: at least one
 * row naming an ethnicity, and every such row carrying a numeric weight. Rows
 * with no ethnicity picked yet are ignored — Add starts one blank, and the
 * panel drops those before writing.
 */
const ethnicitiesUsable = (rows: CultureEthnicity[]): boolean => {
  const named = rows.filter((e) => e.id.trim() !== '')
  return named.length > 0 && named.every((e) => WEIGHT.test(e.weight.trim()))
}

/**
 * The required fields still unset, by label. One source of truth for the create
 * button's gate and the line that explains why it is disabled.
 */
export function missingRequired(draft: CulturePatch): string[] {
  return REQUIRED_FIELDS.filter(([key]) => {
    if (key === 'ethnicities') return !ethnicitiesUsable(draft.ethnicities)
    const value = draft[key] as string | null
    return value === null || value.trim() === ''
  }).map(([, label]) => label)
}
