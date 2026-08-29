import type {
  AppSettings,
  CharacterSummary,
  DetectionResult,
  DirValidation,
  ModInfo
} from '@shared/types'

export interface Ck3ToolsApi {
  getSettings: () => Promise<AppSettings>
  setSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  detectPaths: () => Promise<DetectionResult>
  listMods: (modDir: string) => Promise<ModInfo[]>
  listCharacters: (modPath: string) => Promise<CharacterSummary[]>
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
