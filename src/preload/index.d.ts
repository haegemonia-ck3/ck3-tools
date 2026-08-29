import type {
  AppSettings,
  CharacterDetail,
  CharacterSummary,
  DetectionResult,
  DirValidation,
  ModInfo,
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
  getReferenceData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ) => Promise<ReferenceData>
  validateGameDir: (dir: string) => Promise<DirValidation>
  validateModDir: (dir: string) => Promise<DirValidation>
  pickDirectory: (title: string, kind: 'game' | 'mod') => Promise<string | null>
}

declare global {
  interface Window {
    ck3tools: Ck3ToolsApi
  }
}

export {}
