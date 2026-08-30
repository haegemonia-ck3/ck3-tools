import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppSettings,
  CharacterDetail,
  CharacterSummary,
  DetectionResult,
  DirValidation,
  DnaPasteInfo,
  DynastyData,
  DynastyPatch,
  EditorInfo,
  FaithPatch,
  HousePatch,
  ModInfo,
  RefKind,
  RefLocation,
  ReferenceData,
  ReligionData,
  ReligionPatch,
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
  listCharacterFiles: (modPath: string): Promise<string[]> =>
    ipcRenderer.invoke('ck3:listCharacterFiles', modPath),
  getDnaPasteInfo: (modPath: string, file: string, id: string): Promise<DnaPasteInfo> =>
    ipcRenderer.invoke('ck3:getDnaPasteInfo', modPath, file, id),
  applyRulerDesignerDna: (
    gameDir: string | null,
    modPath: string,
    replacePaths: string[],
    file: string,
    id: string,
    paste: string,
    dnaFile: string,
    modifierFile: string | null
  ): Promise<SaveResult> =>
    ipcRenderer.invoke(
      'ck3:applyRulerDesignerDna',
      gameDir,
      modPath,
      replacePaths,
      file,
      id,
      paste,
      dnaFile,
      modifierFile
    ),
  createCharacter: (modPath: string, file: string, detail: CharacterDetail): Promise<SaveResult> =>
    ipcRenderer.invoke('ck3:createCharacter', modPath, file, detail),
  getDynastyData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ): Promise<DynastyData> => ipcRenderer.invoke('ck3:getDynastyData', gameDir, modPath, replacePaths),
  saveDynasty: (
    modPath: string,
    file: string,
    id: string,
    patch: DynastyPatch
  ): Promise<SaveResult> => ipcRenderer.invoke('ck3:saveDynasty', modPath, file, id, patch),
  saveHouse: (modPath: string, file: string, id: string, patch: HousePatch): Promise<SaveResult> =>
    ipcRenderer.invoke('ck3:saveHouse', modPath, file, id, patch),
  getReligionData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ): Promise<ReligionData> =>
    ipcRenderer.invoke('ck3:getReligionData', gameDir, modPath, replacePaths),
  saveFaith: (
    modPath: string,
    file: string,
    religionId: string,
    faithId: string,
    patch: FaithPatch
  ): Promise<SaveResult> =>
    ipcRenderer.invoke('ck3:saveFaith', modPath, file, religionId, faithId, patch),
  saveReligion: (
    modPath: string,
    file: string,
    religionId: string,
    patch: ReligionPatch
  ): Promise<SaveResult> => ipcRenderer.invoke('ck3:saveReligion', modPath, file, religionId, patch),
  getFaithIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    icons: string[]
  ): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('ck3:getFaithIcons', gameDir, modPath, replacePaths, icons),
  listFaithIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ): Promise<string[]> =>
    ipcRenderer.invoke('ck3:listFaithIcons', gameDir, modPath, replacePaths),
  getTraitIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    traits: string[]
  ): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('ck3:getTraitIcons', gameDir, modPath, replacePaths, traits),
  getFlatIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    names: string[]
  ): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('ck3:getFlatIcons', gameDir, modPath, replacePaths, names),
  getSkillIcons: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    skills: string[]
  ): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('ck3:getSkillIcons', gameDir, modPath, replacePaths, skills),
  getCoatsOfArms: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    ids: string[]
  ): Promise<Record<string, string | null>> =>
    ipcRenderer.invoke('ck3:getCoatsOfArms', gameDir, modPath, replacePaths, ids),
  getReferenceData: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[]
  ): Promise<ReferenceData> =>
    ipcRenderer.invoke('ck3:getReferenceData', gameDir, modPath, replacePaths),
  locateRef: (
    gameDir: string | null,
    modPath: string | null,
    replacePaths: string[],
    kind: RefKind,
    id: string
  ): Promise<RefLocation | null> =>
    ipcRenderer.invoke('ck3:locateRef', gameDir, modPath, replacePaths, kind, id),
  validateGameDir: (dir: string): Promise<DirValidation> =>
    ipcRenderer.invoke('ck3:validateGameDir', dir),
  validateModDir: (dir: string): Promise<DirValidation> =>
    ipcRenderer.invoke('ck3:validateModDir', dir),

  detectEditors: (): Promise<EditorInfo[]> => ipcRenderer.invoke('editor:detect'),
  openInEditor: (file: string, line?: number): Promise<SaveResult> =>
    ipcRenderer.invoke('editor:open', file, line),

  pickDirectory: (title: string, kind: 'game' | 'mod'): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pickDirectory', title, kind),
  pickEditor: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickEditor')
}

export type Ck3ToolsApi = typeof api

contextBridge.exposeInMainWorld('ck3tools', api)
