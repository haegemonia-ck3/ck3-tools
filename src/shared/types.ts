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
  stats: CharacterStats
  /**
   * Raw `female =` value ("yes"/"no"; absent means male). Kept raw so an
   * explicit `female = no` in a file round-trips untouched.
   */
  female: string | null
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

export interface ReferenceData {
  cultures: string[]
  faiths: string[]
  traits: string[]
  /** Ids from `common/dynasties` */
  dynasties: string[]
  /** Ids from `common/dynasty_houses` */
  houses: string[]
}

/** Kinds of reference data whose definition site can be located on disk */
export type RefKind = 'culture' | 'faith' | 'trait' | 'dynasty'

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

export interface DetectionResult {
  gameDir: string | null
  modDir: string | null
}

export interface DirValidation {
  valid: boolean
  reason: string | null
}
