/**
 * Pure selection/derivation helpers for the Faith Editor.
 *
 * Ids are matched case-insensitively while raw spellings are preserved for
 * display and writing, like everywhere else in the app. Characters may profess
 * a faith that is defined nowhere the scan can see (a game faith hidden by a
 * `replace_path`, or a typo) — those still get a list row so their adherents
 * stay reachable, just without editable metadata.
 */
import type { DoctrineGroup, FaithAdherent, ReligionData, RefEntry } from '@shared/types'

export const normId = (id: string): string => id.trim().toLowerCase()

export interface FaithListRow {
  kind: 'religion' | 'faith'
  /** Definition spelling when defined, else the spelling of the first reference */
  id: string
  /** Localized display name, or null when localization has none */
  name: string | null
  /** A faith's religion, a religion's family */
  parent: string | null
  /** Swatch as "#rrggbb"; religions have none of their own */
  color: string | null
  /** Characters in the mod's history professing this faith (a religion sums its faiths') */
  adherents: number
  /** Religions only: how many faiths the definition carries */
  faiths: number
  defined: boolean
  inMod: boolean
  file: string | null
}

/** Adherent count per faith, keyed by normalized faith id. */
function adherentCounts(adherents: FaithAdherent[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const a of adherents) {
    const key = normId(a.faith)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

export function faithsOfReligion(data: ReligionData, religionId: string): ReligionData['faiths'] {
  const r = normId(religionId)
  return data.faiths.filter((f) => normId(f.religion) === r)
}

export function adherentsOfFaith(data: ReligionData, faithId: string): FaithAdherent[] {
  const f = normId(faithId)
  return data.adherents.filter((a) => normId(a.faith) === f)
}

/** Everyone professing any faith of the religion. */
export function adherentsOfReligion(data: ReligionData, religionId: string): FaithAdherent[] {
  const ids = new Set(faithsOfReligion(data, religionId).map((f) => normId(f.id)))
  return data.adherents.filter((a) => ids.has(normId(a.faith)))
}

/** Every religion and faith the scan found, plus faiths only the history references. */
export function buildRows(data: ReligionData): FaithListRow[] {
  const counts = adherentCounts(data.adherents)
  const rows: FaithListRow[] = []

  const faithsPerReligion = new Map<string, number>()
  const adherentsPerReligion = new Map<string, number>()
  for (const f of data.faiths) {
    const r = normId(f.religion)
    faithsPerReligion.set(r, (faithsPerReligion.get(r) ?? 0) + 1)
    adherentsPerReligion.set(r, (adherentsPerReligion.get(r) ?? 0) + (counts.get(normId(f.id)) ?? 0))
  }

  for (const r of data.religions) {
    rows.push({
      kind: 'religion',
      id: r.id,
      name: r.localizedName,
      parent: r.family,
      color: null,
      adherents: adherentsPerReligion.get(normId(r.id)) ?? 0,
      faiths: faithsPerReligion.get(normId(r.id)) ?? 0,
      defined: true,
      inMod: r.inMod,
      file: r.file
    })
  }
  for (const f of data.faiths) {
    rows.push({
      kind: 'faith',
      id: f.id,
      name: f.localizedName,
      parent: f.religion,
      color: f.color?.hex ?? null,
      adherents: counts.get(normId(f.id)) ?? 0,
      faiths: 0,
      defined: true,
      inMod: f.inMod,
      file: f.file
    })
  }

  const defined = new Set(data.faiths.map((f) => normId(f.id)))
  const dangling = new Map<string, string>() // norm -> first raw spelling
  for (const a of data.adherents) {
    const key = normId(a.faith)
    if (!defined.has(key) && !dangling.has(key)) dangling.set(key, a.faith)
  }
  for (const [key, raw] of dangling) {
    rows.push({
      kind: 'faith',
      id: raw,
      name: null,
      parent: null,
      color: null,
      adherents: counts.get(key) ?? 0,
      faiths: 0,
      defined: false,
      inMod: false,
      file: null
    })
  }
  return rows
}

/**
 * Doctrine categories in the order the editor shows them: the picks that define
 * a faith's character first, the engine plumbing last. Anything the scan turns
 * up under an unlisted category sorts after these, alphabetically.
 */
const CATEGORY_ORDER = [
  'core_tenets',
  'main_group',
  'marriage',
  'crimes',
  'clergy',
  'special',
  'not_creatable'
]

export const CATEGORY_LABELS: Record<string, string> = {
  core_tenets: 'Tenets',
  main_group: 'Doctrines',
  marriage: 'Marriage',
  crimes: 'Crimes',
  clergy: 'Clergy',
  special: 'Special',
  not_creatable: 'Not player-creatable'
}

/** A doctrine group as the editor works with it: what is picked, and from where. */
export interface DoctrineSlot {
  group: DoctrineGroup
  /** Picks the entity itself makes, in the group's own order */
  own: string[]
  /**
   * Picks it would otherwise inherit — a faith falls back to its religion's
   * doctrine for any group it doesn't decide for itself. Empty for religions.
   */
  inherited: string[]
}

const inGroup = (group: DoctrineGroup, doctrines: string[]): string[] =>
  group.doctrines.map((d) => d.id).filter((id) => doctrines.some((d) => normId(d) === normId(id)))

/**
 * Every doctrine group paired with what `own` picks from it, and what `parent`
 * would supply instead. Groups are ordered by category, then by the order the
 * definition files listed them.
 */
export function doctrineSlots(
  groups: DoctrineGroup[],
  own: string[],
  parent: string[]
): DoctrineSlot[] {
  const rank = (g: DoctrineGroup): number => {
    const i = CATEGORY_ORDER.indexOf(g.category ?? '')
    return i < 0 ? CATEGORY_ORDER.length : i
  }
  return groups
    .map((group, index) => ({
      group,
      own: inGroup(group, own),
      inherited: inGroup(group, parent),
      index
    }))
    .sort((a, b) => rank(a.group) - rank(b.group) || a.index - b.index)
    .map(({ group, own: o, inherited }) => ({ group, own: o, inherited }))
}

/**
 * Doctrines held that no scanned group claims — a mod doctrine whose group
 * definition is missing, say. Surfaced as plain badges so an edit elsewhere
 * can't silently drop them.
 */
export function ungroupedPicks(groups: DoctrineGroup[], doctrines: string[]): string[] {
  const claimed = new Set(groups.flatMap((g) => g.doctrines.map((d) => normId(d.id))))
  return doctrines.filter((d) => !claimed.has(normId(d)))
}

/**
 * Replace the picks a group holds. Doctrines of other groups keep their
 * position in the list, so a save only rewrites the lines that changed.
 */
export function setGroupPicks(
  doctrines: string[],
  group: DoctrineGroup,
  picks: string[]
): string[] {
  const members = new Set(group.doctrines.map((d) => normId(d.id)))
  return [...doctrines.filter((d) => !members.has(normId(d))), ...picks]
}

/** "Name (id)" entries for a set of ids, resolved against a reference list. */
export function entriesFor(all: readonly RefEntry[], ids: string[]): RefEntry[] {
  return ids.map((id) => all.find((e) => normId(e.id) === normId(id)) ?? { id, name: null })
}
