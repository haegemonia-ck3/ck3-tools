import { contextBridge, ipcRenderer } from 'electron'
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

const api = {
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<AppSettings>): Promise<AppSettings> =>
    ipcRenderer.invoke('settings:set', patch),

  detectPaths: (): Promise<DetectionResult> => ipcRenderer.invoke('ck3:detectPaths'),
  listMods: (modDir: string): Promise<ModInfo[]> => ipcRenderer.invoke('ck3:listMods', modDir),
  listCharacters: (modPath: string): Promise<CharacterSummary[]> =>
    ipcRenderer.invoke('ck3:listCharacters', modPath),
  getCharacter: (modPath: string, file: string, id: string): Promise<CharacterDetail | null> =>
    ipcRenderer.invoke('ck3:getCharacter', modPath, file, id),
  saveCharacter: (
    modPath: string,
    file: string,
    originalId: string,
    detail: CharacterDetail
  ): Promise<SaveResult> => ipcRenderer.invoke('ck3:saveCharacter', modPath, file, originalId, detail),
  getReferenceData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ): Promise<ReferenceData> =>
    ipcRenderer.invoke('ck3:getReferenceData', gameDir, modPath, replacePaths),
  validateGameDir: (dir: string): Promise<DirValidation> =>
    ipcRenderer.invoke('ck3:validateGameDir', dir),
  validateModDir: (dir: string): Promise<DirValidation> =>
    ipcRenderer.invoke('ck3:validateModDir', dir),

  pickDirectory: (title: string, kind: 'game' | 'mod'): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDirectory', title, kind)
}

export type Ck3ToolsApi = typeof api

contextBridge.exposeInMainWorld('ck3tools', api)
