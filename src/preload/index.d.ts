import type {
  AppSettings,
  CharacterDetail,
  CharacterSummary,
  DetectionResult,
  DirValidation,
  DynastyData,
  DynastyPatch,
  EditorInfo,
  HousePatch,
  ModInfo,
  RefKind,
  RefLocation,
  ReferenceData,
  SaveResult
} from '@shared/types'

export interface Ck3ToolsApi {
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  detectPaths: () => Promise<DetectionResult>
  listMods: (modDir: string) => Promise<ModInfo[]>
  listCharacters: (modPath: string) => Promise<CharacterSummary[]>
  getCharacter: (modPath: string, file: string, id: string) => Promise<CharacterDetail | null>
  saveCharacter: (
    modPath: string,
    file: string,
    originalId: string,
    detail: CharacterDetail
  ) => Promise<SaveResult>
  listCharacterFiles: (modPath: string) => Promise<string[]>
  createCharacter: (modPath: string, file: string, detail: CharacterDetail) => Promise<SaveResult>
  getDynastyData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ) => Promise<DynastyData>
  saveDynasty: (
    modPath: string,
    file: string,
    id: string,
    patch: DynastyPatch
  ) => Promise<SaveResult>
  saveHouse: (modPath: string, file: string, id: string, patch: HousePatch) => Promise<SaveResult>
  getTraitIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    traits: string[]
  ) => Promise<Record<string, string | null>>
  getCoatsOfArms: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    ids: string[]
  ) => Promise<Record<string, string | null>>
  getReferenceData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ) => Promise<ReferenceData>
  locateRef: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    kind: RefKind,
    id: string
  ) => Promise<RefLocation | null>
  validateGameDir: (dir: string) => Promise<DirValidation>
  validateModDir: (dir: string) => Promise<DirValidation>
  detectEditors: () => Promise<EditorInfo[]>
  openInEditor: (file: string, line?: number) => Promise<SaveResult>
  pickDirectory: (title: string, kind: 'game' | 'mod') => Promise<string | null>
  pickEditor: () => Promise<string | null>
}

declare global {
  interface Window {
    ck3tools: Ck3ToolsApi
  }
}

export {}
