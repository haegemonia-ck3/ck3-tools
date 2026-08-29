export interface AppSettings {
  /** Path to the CK3 `game` data directory (…\Crusader Kings III\game) */
  gameDir: string | null
  /** Path to the user's mod directory (…\Paradox Interactive\Crusader Kings III\mod) */
  modDir: string | null
  /** File name of the selected .mod descriptor within modDir, e.g. "Atlantis.mod" */
  selectedModFile: string | null
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
}

export interface CharacterSummary {
  /** Character id — the top-level key in the history file, e.g. "219" */
  id: string
  name: string | null
  /** Raw dynasty (or dynasty_house) value as written in the file */
  dynasty: string | null
  /** Birth date as written, e.g. "2410.1.1" */
  birth: string | null
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
  dynasty: string | null
  birth: string | null
  death: string | null
  culture: string | null
  /** Faith key; read from either `faith =` or `religion =` in the file */
  faith: string | null
  traits: string[]
  stats: CharacterStats
}

export interface ReferenceData {
  cultures: string[]
  faiths: string[]
  traits: string[]
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
