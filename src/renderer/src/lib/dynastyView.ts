/**
 * Pure selection/derivation helpers for the Dynasty & House Editor.
 *
 * Dynasty and house ids are matched case-insensitively (real mods reference
 * `Phokus` as `phokus`) while raw spellings are preserved for display and
 * writing. Characters reference houses/dynasties that are defined nowhere —
 * those still get list rows and trees, just without editable metadata.
 */
import type { DynastyCharacter, DynastyData, DynastyDef, HouseDef } from '@shared/types'
import type { FamilyTreeNode } from './familyTree'
import { yearOf } from './familyTree'

export const normId = (id: string): string => id.trim().toLowerCase()

export interface DynastyListRow {
  kind: 'dynasty' | 'house'
  /** Definition spelling when defined, else the spelling of the first reference */
  id: string
  /** Best display name: localized, else the raw name value, else null */
  name: string | null
  culture: string | null
  /** Houses only: parent dynasty id as written */
  parent: string | null
  members: number
  defined: boolean
  inMod: boolean
  file: string | null
}

/** A dynasty's defined cadet houses (parent matched case-insensitively). */
export function housesOfDynasty(data: DynastyData, dynastyId: string): HouseDef[] {
  const d = normId(dynastyId)
  return data.houses.filter((h) => h.dynasty !== null && normId(h.dynasty) === d)
}

/**
 * Members of a dynasty. With `includeHouses`, characters of the dynasty's
 * defined cadet houses count too; without it, only characters who carry the
 * dynasty directly and belong to NO house (for them the dynasty acts as their
 * house).
 */
export function membersOfDynasty(
  data: DynastyData,
  dynastyId: string,
  includeHouses: boolean
): DynastyCharacter[] {
  const d = normId(dynastyId)
  const houseIds = new Set(housesOfDynasty(data, dynastyId).map((h) => normId(h.id)))
  return data.characters.filter((c) => {
    const inDynasty = c.dynasty !== null && normId(c.dynasty) === d
    if (!includeHouses) return inDynasty && c.house === null
    return inDynasty || (c.house !== null && houseIds.has(normId(c.house)))
  })
}

export function membersOfHouse(data: DynastyData, houseId: string): DynastyCharacter[] {
  const h = normId(houseId)
  return data.characters.filter((c) => c.house !== null && normId(c.house) === h)
}

const defDisplayName = (def: { localizedName: string | null; name: string | null }): string | null =>
  def.localizedName ?? def.name

/** Every dynasty and house a mod defines or references, with member counts. */
export function buildRows(data: DynastyData): DynastyListRow[] {
  const rows: DynastyListRow[] = []
  const definedDynasties = new Set(data.dynasties.map((d) => normId(d.id)))
  const definedHouses = new Set(data.houses.map((h) => normId(h.id)))

  for (const d of data.dynasties) {
    rows.push({
      kind: 'dynasty',
      id: d.id,
      name: defDisplayName(d),
      culture: d.culture,
      parent: null,
      members: membersOfDynasty(data, d.id, true).length,
      defined: true,
      inMod: d.inMod,
      file: d.file
    })
  }
  for (const h of data.houses) {
    rows.push({
      kind: 'house',
      id: h.id,
      name: defDisplayName(h),
      culture: null,
      parent: h.dynasty,
      members: membersOfHouse(data, h.id).length,
      defined: true,
      inMod: h.inMod,
      file: h.file
    })
  }

  // Referenced-but-undefined ids still get rows so their members are reachable
  const seenDangling = new Set<string>()
  for (const c of data.characters) {
    if (c.dynasty !== null && !definedDynasties.has(normId(c.dynasty)) && !seenDangling.has(`d:${normId(c.dynasty)}`)) {
      seenDangling.add(`d:${normId(c.dynasty)}`)
      rows.push({
        kind: 'dynasty',
        id: c.dynasty,
        name: null,
        culture: null,
        parent: null,
        members: membersOfDynasty(data, c.dynasty, true).length,
        defined: false,
        inMod: false,
        file: null
      })
    }
    if (c.house !== null && !definedHouses.has(normId(c.house)) && !seenDangling.has(`h:${normId(c.house)}`)) {
      seenDangling.add(`h:${normId(c.house)}`)
      rows.push({
        kind: 'house',
        id: c.house,
        name: null,
        culture: null,
        parent: null,
        members: membersOfHouse(data, c.house).length,
        defined: false,
        inMod: false,
        file: null
      })
    }
  }
  return rows
}

/**
 * Where a character belongs, for ghost-node labels: their house, else their
 * dynasty (display name when defined), else lowborn.
 */
export function makeAffiliationName(data: DynastyData): (c: DynastyCharacter) => string {
  const houseNames = new Map(data.houses.map((h) => [normId(h.id), defDisplayName(h) ?? h.id]))
  const dynastyNames = new Map(data.dynasties.map((d) => [normId(d.id), defDisplayName(d) ?? d.id]))
  return (c) => {
    if (c.house !== null) return houseNames.get(normId(c.house)) ?? c.house
    if (c.dynasty !== null) return dynastyNames.get(normId(c.dynasty)) ?? c.dynasty
    return 'lowborn'
  }
}

/**
 * Tree nodes for a member set: the members themselves plus one-hop ghost
 * parents (external or even undefined characters), so cadet founders keep
 * their real parentage visible and islands sharing an external parent stay
 * connected.
 */
export function buildTreeNodes(
  members: DynastyCharacter[],
  allCharacters: DynastyCharacter[],
  affiliationName: (c: DynastyCharacter) => string
): FamilyTreeNode[] {
  const byId = new Map(allCharacters.map((c) => [c.id, c]))
  const included = new Set(members.map((c) => c.id))
  const nodes: FamilyTreeNode[] = members.map((c) => ({
    id: c.id,
    name: c.name,
    birth: c.birth,
    death: c.death,
    father: c.father,
    mother: c.mother,
    female: c.female,
    group: c.house !== null ? normId(c.house) : null,
    ghost: false,
    ghostNote: null
  }))
  const ghosts = new Map<string, FamilyTreeNode>()
  for (const c of members) {
    for (const pid of [c.father, c.mother]) {
      if (pid === null || included.has(pid) || ghosts.has(pid)) continue
      const p = byId.get(pid)
      ghosts.set(pid, {
        id: pid,
        name: p?.name ?? null,
        birth: p?.birth ?? null,
        death: p?.death ?? null,
        // A ghost's own parents are not followed — one hop of context only
        father: null,
        mother: null,
        female: p?.female ?? false,
        group: null,
        ghost: true,
        ghostNote: p ? affiliationName(p) : 'not defined'
      })
    }
  }
  return [...nodes, ...ghosts.values()]
}

/** Members ordered like tree children: by birth year (unknown last), then id. */
export function sortMembers(members: DynastyCharacter[]): DynastyCharacter[] {
  return [...members].sort((a, b) => {
    const ya = yearOf(a.birth)
    const yb = yearOf(b.birth)
    if (ya !== null && yb !== null && ya !== yb) return ya - yb
    if (ya === null && yb !== null) return 1
    if (ya !== null && yb === null) return -1
    return a.id.localeCompare(b.id, undefined, { numeric: true })
  })
}
