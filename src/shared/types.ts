export interface AppSettings {
  /** Path to the CK3 `game` data directory (…\Crusader Kings III\game) */
  gameDir: string | null
  /** Path to the user's mod directory (…\Paradox Interactive\Crusader Kings III\mod) */
  modDir: string | null
  /** File name of the selected .mod descriptor within modDir, e.g. "Atlantis.mod" */
  selectedModFile: string | null
  /** Recently visited characters per mod (.mod file name → most recent first, capped at 10) */
  recentCharacters: Record<string, CharacterRef[]>
  /** Favorited characters per mod (.mod file name → refs in the order they were starred) */
  favoriteCharacters: Record<string, CharacterRef[]>
  /**
   * Unsaved character edits per mod, VS Code-style: everything stays draft
   * until saved or reverted, surviving navigation and app restarts.
   * Keyed .mod file name → "file:id" (id as it exists in the file).
   */
  draftCharacters: Record<string, Record<string, CharacterDraft>>
  /** Absolute path to the preferred text editor executable; null = system Notepad */
  textEditorPath: string | null
}

export interface CharacterDraft {
  /** The edited, unsaved state */
  draft: CharacterDetail
  /**
   * Parse of the character at the time the draft was last touched, used to
   * detect that the file changed on disk (e.g. in an external editor) while
   * the draft was dormant.
   */
  original: CharacterDetail
}

export interface CharacterRef {
  /** File name within history/characters, e.g. "HAAO_Attica.txt" */
  file: string
  id: string
  /** Name at the time the ref was recorded, as a fallback label */
  name: string | null
}

/**
 * An offset-calendar display convention, for total-conversion mods whose file
 * years aren't AD (CK3 can't store negative years). Hegemonia-style reckoning
 * with no year zero: file year 3220 under epochYear 4000 displays as "780 BC",
 * and 4000 displays as "1 AD".
 */
export interface CalendarConfig {
  /** File year that maps to year 1 of the "after" era (e.g. 4000 = 1 AD) */
  epochYear: number
  /** Era label for years before the epoch, e.g. "BC" */
  beforeLabel: string
  /** Era label for the epoch year onward, e.g. "AD" */
  afterLabel: string
}

/**
 * Per-mod display conventions, declared by a `ck3-tools.json` file the mod
 * ships at its content root. Purely declarative — display-only, never affects
 * what gets written to mod files.
 */
export interface ModProfile {
  calendar: CalendarConfig | null
}

export interface ModInfo {
  /** Descriptor file name within the mod directory, e.g. "Atlantis.mod" — used as the stable id */
  file: string
  name: string
  version: string | null
  supportedVersion: string | null
  tags: string[]
  /** Absolute path to the mod's content folder */
  path: string | null
  replacePaths: string[]
  /** Whether the mod's content folder actually exists on disk */
  pathExists: boolean
  /** Contents of the mod's optional `ck3-tools.json`; null when absent or unreadable */
  profile: ModProfile | null
}

export interface CharacterSummary {
  /** Character id — the top-level key in the history file, e.g. "219" */
  id: string
  name: string | null
  /** Raw dynasty (or dynasty_house) value as written in the file */
  dynasty: string | null
  /** Birth date as written, e.g. "2410.1.1" */
  birth: string | null
  /** Character id of the father, as written in the file */
  father: string | null
  /** Character id of the mother, as written in the file */
  mother: string | null
  /** File name within history/characters, e.g. "HAAO_Attica.txt" */
  file: string
}

export interface CharacterStats {
  diplomacy: number | null
  martial: number | null
  stewardship: number | null
  intrigue: number | null
  learning: number | null
  prowess: number | null
}

/**
 * A marriage recorded on a character, as the dated `add_spouse` /
 * `remove_spouse` effects that express it in the history file. `matrilineal`
 * selects `add_matrilineal_spouse`; a null `divorce` means the marriage is
 * never dissolved, and a null `marriage` a lone `remove_spouse` with no
 * matching add (real files carry these).
 */
export interface CharacterSpouse {
  /** Spouse character id, as written in the file */
  id: string
  /** Date of the add_spouse effect, e.g. "1070.3.4" */
  marriage: string | null
  /** Date of the remove_spouse effect; null while the marriage stands */
  divorce: string | null
  matrilineal: boolean
}

export interface CharacterDetail {
  id: string
  file: string
  name: string | null
  /**
   * Raw `dynasty =` value. Distinct from `house`: a character joins a lineage
   * through either key, and a house already implies its parent dynasty, so
   * most characters carry one or the other rather than both.
   */
  dynasty: string | null
  /** Raw `dynasty_house =` value */
  house: string | null
  birth: string | null
  death: string | null
  culture: string | null
  /** Faith key; read from either `faith =` or `religion =` in the file */
  faith: string | null
  /** Character id of the father, as written in the file */
  father: string | null
  /** Character id of the mother, as written in the file */
  mother: string | null
  traits: string[]
  /** Marriages, in the order their effects appear in the file */
  spouses: CharacterSpouse[]
  stats: CharacterStats
  /**
   * Raw `female =` value ("yes"/"no"; absent means male). Kept raw so an
   * explicit `female = no` in a file round-trips untouched.
   */
  female: string | null
  /** Raw `sexuality =` value (e.g. "heterosexual", "homosexual", "bisexual", "asexual"); null if unset */
  sexuality: string | null
  /** Raw `dna =` value: a key defined in common/dna_data; null if unset */
  dna: string | null
}

/**
 * A dynasty definition block from `common/dynasties`. Field values are raw —
 * `name`/`prefix`/`motto` are usually `dynn_*` localization keys, with
 * `localizedName` resolved from localization files for display only.
 */
export interface DynastyDef {
  id: string
  /** File name within common/dynasties */
  file: string
  /** Whether the definition lives in the mod (editable) vs. the base game */
  inMod: boolean
  name: string | null
  prefix: string | null
  motto: string | null
  culture: string | null
  localizedName: string | null
}

/** A house definition block from `common/dynasty_houses`. */
export interface HouseDef {
  id: string
  /** File name within common/dynasty_houses */
  file: string
  inMod: boolean
  name: string | null
  prefix: string | null
  motto: string | null
  /** Parent dynasty id as written (numeric or string; may not resolve) */
  dynasty: string | null
  localizedName: string | null
}

/**
 * A character as needed for dynasty membership and family trees. Unlike
 * CharacterDetail this keeps `dynasty` and `dynasty_house` separate — a
 * character with only a dynasty behaves as if that dynasty were their house.
 */
export interface DynastyCharacter {
  id: string
  /** File name within history/characters */
  file: string
  name: string | null
  birth: string | null
  death: string | null
  father: string | null
  mother: string | null
  female: boolean
  /** Raw `dynasty =` value, if present */
  dynasty: string | null
  /** Raw `dynasty_house =` value, if present */
  house: string | null
  /** Spouse character ids from dated add_spouse/add_matrilineal_spouse lines */
  spouses: string[]
}

export interface DynastyData {
  /** Mod definitions, plus game definitions referenced by mod content */
  dynasties: DynastyDef[]
  houses: HouseDef[]
  /** Every character in the mod's history (ghost parents may be dynasty-less) */
  characters: DynastyCharacter[]
}

/** Editable dynasty fields; null clears the line */
export interface DynastyPatch {
  name: string | null
  prefix: string | null
  motto: string | null
  culture: string | null
}

/** Editable house fields; null clears the line */
export interface HousePatch {
  name: string | null
  prefix: string | null
  motto: string | null
  dynasty: string | null
}

/**
 * How a culture's `color =` line is written, so an edit can be written back
 * the same way the file already reads. CK3 spells the same color five ways:
 * a named color from `common/named_colors`, an `rgb { 0-255 }` triple, `hsv`
 * (0-1) or `hsv360` (h 0-360, s/v 0-100), or a bare brace triple that is 0-255
 * when every component is an integer and 0-1 otherwise.
 */
export type CultureColorFormat = 'named' | 'rgb' | 'hsv' | 'hsv360' | 'int' | 'float'

export interface CultureColor {
  format: CultureColorFormat
  /** The value exactly as written, e.g. "italian" or "rgb { 128 149 72 }" */
  raw: string
  /** Resolved sRGB hex ("#809548"); null when a named color resolves nowhere */
  hex: string | null
}

/** One `<weight> = <ethnicity>` line of a culture's `ethnicities` block. */
export interface CultureEthnicity {
  /** Relative weight, as written (real files use whole numbers) */
  weight: string
  id: string
}

/**
 * A culture definition block from `common/culture/cultures`. Unlike dynasties,
 * cultures carry no `name` scalar — their display name is the localization of
 * the id itself, so `localizedName` is read-only here.
 */
export interface CultureDef {
  id: string
  /** File name within common/culture/cultures */
  file: string
  /** Whether the definition lives in the mod (editable) vs. the base game */
  inMod: boolean
  localizedName: string | null
  color: CultureColor | null
  ethos: string | null
  heritage: string | null
  language: string | null
  martialCustom: string | null
  headDetermination: string | null
  traditions: string[]
  nameList: string | null
  /** Cultures this one descends from, as written */
  parents: string[]
  /** Raw `created =` date, e.g. "476.11.4" */
  created: string | null
  coaGfx: string[]
  buildingGfx: string[]
  clothingGfx: string[]
  unitGfx: string[]
  houseCoaFrame: string | null
  ethnicities: CultureEthnicity[]
}

/** The five `type =` values a `common/culture/pillars` definition can carry. */
export type CulturePillarType =
  | 'ethos'
  | 'heritage'
  | 'language'
  | 'martial_custom'
  | 'head_determination'

/** A tradition, with the `category =` its definition declares (for grouping). */
export interface CultureTraditionEntry extends RefEntry {
  category: string | null
}

/**
 * A character as needed for a culture's member list. Only the mod's own
 * history is scanned — game characters aren't editable and would swamp it.
 */
export interface CultureCharacter {
  id: string
  /** File name within history/characters */
  file: string
  name: string | null
  birth: string | null
  death: string | null
  /** Raw `culture =` value, if present */
  culture: string | null
}

export interface CultureData {
  /** Every culture the mod effectively loads, mod definitions first */
  cultures: CultureDef[]
  /** Pillar options, keyed by the `type =` their definition declares */
  pillars: Record<CulturePillarType, RefEntry[]>
  traditions: CultureTraditionEntry[]
  /** Ids from `common/culture/name_lists` */
  nameLists: RefEntry[]
  /** Ids from `common/ethnicities` */
  ethnicities: RefEntry[]
  /**
   * Graphics-bundle ids, gathered from the values the effective culture files
   * actually use — these have no single definition folder to enumerate.
   */
  gfx: {
    coa: string[]
    building: string[]
    clothing: string[]
    unit: string[]
    houseCoaFrame: string[]
  }
  characters: CultureCharacter[]
}

/**
 * Editable culture fields. A null scalar clears its line, an empty list drops
 * the whole block, and `color` is a hex string written back in the format the
 * file already used (a named color becomes `rgb { … }`); a brand-new block has
 * no existing spelling to keep, so it writes `rgb { … }` too.
 */
export interface CulturePatch {
  color: string | null
  ethos: string | null
  heritage: string | null
  language: string | null
  martialCustom: string | null
  headDetermination: string | null
  traditions: string[]
  nameList: string | null
  parents: string[]
  created: string | null
  coaGfx: string[]
  buildingGfx: string[]
  clothingGfx: string[]
  unitGfx: string[]
  houseCoaFrame: string | null
  ethnicities: CultureEthnicity[]
}

/**
 * A faith's `color = …` value. CK3 writes it several ways — a `{ r g b }`
 * triple in either 0–1 floats or 0–255 integers, an `hsv`/`hsv360` triple, or
 * the name of a swatch from `common/named_colors` — and the editor only rewrites
 * the plain triples. Everything else is shown, with its swatch, and left alone.
 */
export interface FaithColor {
  /** Resolved swatch as "#rrggbb"; null when the value couldn't be resolved */
  hex: string | null
  /** The value exactly as the file wrote it, for the forms we don't rewrite */
  raw: string
  /** Whether saving can rewrite this value */
  editable: boolean
}

/**
 * A faith definition, nested two levels deep in a religion file as
 * `<religion> = { faiths = { <faith> = { … } } }`.
 */
export interface FaithDef {
  id: string
  /** File name within common/religion/religion_types */
  file: string
  /** Whether the definition lives in the mod (editable) vs. the base game */
  inMod: boolean
  /** Id of the religion whose `faiths` block holds this faith */
  religion: string
  color: FaithColor | null
  /** `icon =` value: a file name (sans .dds) under gfx/interface/icons/faith */
  icon: string | null
  reformedIcon: string | null
  /** `religious_head =` landed title id, e.g. "d_karaism" */
  religiousHead: string | null
  /**
   * Every `doctrine =` value in file order, tenets included. Duplicates are
   * kept as written so an untouched save stays byte-for-byte identical.
   */
  doctrines: string[]
  /** `holy_site =` values, in file order */
  holySites: string[]
  /** Display name from localization (faiths localize under their own id) */
  localizedName: string | null
}

/** A religion definition: a top-level block in common/religion/religion_types. */
export interface ReligionDef {
  id: string
  file: string
  inMod: boolean
  /** `family =` value, an id from common/religion/religion_family_types */
  family: string | null
  graphicalFaith: string | null
  pietyIconGroup: string | null
  /** Doctrines every faith of the religion inherits unless it overrides them */
  doctrines: string[]
  localizedName: string | null
}

/**
 * A doctrine group from `common/religion/doctrine_group_types`: the set of
 * mutually exclusive doctrines a faith picks from. `picks` is how many of them
 * a faith may hold at once — one for most groups, three for core tenets.
 */
export interface DoctrineGroup {
  id: string
  /** `category =` value: "main_group", "marriage", "crimes", "clergy", "core_tenets", … */
  category: string | null
  /** `number_of_picks`; 1 when the group doesn't say */
  picks: number
  /** The group's doctrines, in file order, with display names */
  doctrines: RefEntry[]
  name: string | null
}

/** A character in the mod's history that professes a faith. */
export interface FaithAdherent {
  id: string
  /** File name within history/characters */
  file: string
  name: string | null
  /** Raw `faith =` / `religion =` value as written in the history file */
  faith: string
}

export interface ReligionData {
  religions: ReligionDef[]
  faiths: FaithDef[]
  /** Doctrine groups, mod definitions layered over the game's */
  groups: DoctrineGroup[]
  /** Doctrines that belong to no scanned group, so nothing is hidden from view */
  ungroupedDoctrines: RefEntry[]
  holySites: RefEntry[]
  families: RefEntry[]
  adherents: FaithAdherent[]
}

/** Editable faith fields; null clears the line, [] clears every repeat */
export interface FaithPatch {
  /** "#rrggbb"; ignored when the file's colour isn't a rewritable triple */
  color: string | null
  icon: string | null
  reformedIcon: string | null
  religiousHead: string | null
  doctrines: string[]
  holySites: string[]
}

/** Editable religion fields; null clears the line */
export interface ReligionPatch {
  family: string | null
  graphicalFaith: string | null
  pietyIconGroup: string | null
  doctrines: string[]
}

/**
 * A brand-new dynasty definition: an id for the block plus the same editable
 * fields a patch carries. Null (or blank) fields are simply not written.
 */
export interface NewDynasty extends DynastyPatch {
  /** Top-level key of the new block, e.g. "dynn_Komnenos" or "25061" */
  id: string
}

/**
 * A brand-new culture definition: an id for the block plus the same editable
 * fields a patch carries. Null (or blank) scalars and empty lists are simply
 * not written.
 */
export interface NewCulture extends CulturePatch {
  /** Top-level key of the new block, e.g. "attic" */
  id: string
}

/** A brand-new house definition; `dynasty` (the parent) is mandatory. */
export interface NewHouse extends HousePatch {
  id: string
}

/** The .txt files a new dynasty or house definition can be written to. */
export interface DynastyFiles {
  /** File names within common/dynasties */
  dynasties: string[]
  /** File names within common/dynasty_houses */
  houses: string[]
}

/**
 * A reference id paired with its display name. `name` is the localized name
 * when one could be resolved (cultures/faiths key off the id, traits off
 * `trait_<id>`, dynasties/houses off their `name` scalar), and null for
 * references that have none — an unlocalized id, or a kind with no names at
 * all (history files, character ids).
 */
export interface RefEntry {
  id: string
  name: string | null
}

export interface ReferenceData {
  cultures: RefEntry[]
  faiths: RefEntry[]
  traits: RefEntry[]
  /** Ids from `common/dynasties` */
  dynasties: RefEntry[]
  /** Ids from `common/dynasty_houses` */
  houses: RefEntry[]
  /** Ids from `common/dna_data` (no display names — DNAs aren't localized) */
  dnas: RefEntry[]
}

/** Kinds of reference data whose definition site can be located on disk */
export type RefKind =
  | 'culture'
  | 'faith'
  | 'trait'
  | 'dynasty'
  | 'dna'
  | 'pillar'
  | 'tradition'
  | 'name_list'
  | 'ethnicity'
  | 'religion'
  | 'doctrine'
  | 'holy_site'

export interface RefLocation {
  /** Absolute path of the file containing the definition */
  path: string
  /** 1-based line of the definition */
  line: number
  /** Whether the definition comes from the mod (vs. the base game) */
  inMod: boolean
}

export interface EditorInfo {
  name: string
  /** Absolute path to the editor executable */
  path: string
}

export type SaveResult = { ok: true } | { ok: false; error: string }

/**
 * What the "Paste from Ruler Designer" dialog needs to offer its file pickers.
 * A locked file means the mod already carries the character's DNA definition
 * (or a portrait modifier for the character) there, so the paste must land in
 * that same file rather than scatter duplicates.
 */
export interface DnaPasteInfo {
  /** DNA key the paste will define: the character's existing `dna =` value, or `<id>_dna` */
  dnaKey: string
  /** .txt files under the mod's common/dna_data */
  dnaFiles: string[]
  /** .txt files under the mod's gfx/portraits/portrait_modifiers */
  modifierFiles: string[]
  /** Mod file already defining the DNA key; locks the DNA file picker */
  lockedDnaFile: string | null
  /** Mod file already carrying a portrait modifier for this character; locks that picker */
  lockedModifierFile: string | null
}

export interface DetectionResult {
  gameDir: string | null
  modDir: string | null
}

export interface DirValidation {
  valid: boolean
  reason: string | null
}
