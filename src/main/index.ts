import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { readFileSync, unwatchFile, watchFile } from 'fs'
import { loadSettings, saveSettings } from './settings'
import {
  detectPaths,
  listMods,
  normalizeGameDir,
  validateGameDir,
  validateModDir
} from './ck3'
import {
  createCharacter,
  getCharacter,
  listCharacterFiles,
  listCharacters,
  saveCharacter
} from './characters'
import { applyRulerDesignerDna, getDnaPasteInfo } from './dna'
import { createCulture, getCultureData, listCultureFiles, saveCulture } from './cultures'
import {
  createDynasty,
  createHouse,
  getDynastyData,
  listDynastyFiles,
  saveDynasty,
  saveHouse
} from './dynasties'
import { getReligionData, saveFaith, saveReligion } from './religions'
import { getFaithIcons, listFaithIcons } from './faithIcons'
import { getReferenceData, locateRef } from './refdata'
import { getTraitIcons } from './traitIcons'
import { getFlatIcons } from './icons'
import { getSkillIcons } from './skillIcons'
import { getCoatsOfArms } from './coatOfArms'
import { detectEditors, openInEditor } from './editor'
import type {
  AppSettings,
  CharacterDetail,
  CulturePatch,
  DynastyPatch,
  FaithPatch,
  HousePatch,
  NewCulture,
  NewDynasty,
  NewHouse,
  RefKind,
  ReligionPatch
} from '@shared/types'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#16130f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true
    }
  })

  win.on('ready-to-show', () => win.show())

  // Dev only: label the window from .claude/dev-label.txt so several concurrent
  // sessions' Electron windows can be told apart on the desktop.
  if (!app.isPackaged) {
    const labelFile = join(app.getAppPath(), '.claude', 'dev-label.txt')
    const applyTitle = (): void => {
      let label = ''
      try {
        label = readFileSync(labelFile, 'utf8').split(/\r?\n/)[0].trim().slice(0, 120)
      } catch {
        // no label file — plain title
      }
      win.setTitle(label ? `CK3 Tools — ${label}` : 'CK3 Tools')
    }
    win.on('page-title-updated', (e) => e.preventDefault())
    applyTitle()
    watchFile(labelFile, { interval: 1000 }, applyTitle)
    win.on('closed', () => unwatchFile(labelFile, applyTitle))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('settings:set', (_e, patch: Partial<AppSettings>) => saveSettings(patch))

  ipcMain.handle('ck3:detectPaths', () => detectPaths())
  ipcMain.handle('ck3:listMods', (_e, modDir: string) => listMods(modDir))
  ipcMain.handle('ck3:listCharacters', (_e, modPath: string) => listCharacters(modPath))
  ipcMain.handle('ck3:getCharacter', (_e, modPath: string, file: string, id: string) =>
    getCharacter(modPath, file, id)
  )
  ipcMain.handle(
    'ck3:saveCharacter',
    (_e, modPath: string, file: string, originalId: string, detail: CharacterDetail) =>
      saveCharacter(modPath, file, originalId, detail)
  )
  ipcMain.handle('ck3:listCharacterFiles', (_e, modPath: string) => listCharacterFiles(modPath))
  ipcMain.handle(
    'ck3:createCharacter',
    (_e, modPath: string, file: string, detail: CharacterDetail) =>
      createCharacter(modPath, file, detail)
  )
  ipcMain.handle('ck3:getDnaPasteInfo', (_e, modPath: string, file: string, id: string) =>
    getDnaPasteInfo(modPath, file, id)
  )
  ipcMain.handle(
    'ck3:applyRulerDesignerDna',
    (
      _e,
      gameDir: string | null,
      modPath: string,
      replacePaths: string[],
      file: string,
      id: string,
      paste: string,
      dnaFile: string,
      modifierFile: string | null
    ) => applyRulerDesignerDna(gameDir, modPath, replacePaths, file, id, paste, dnaFile, modifierFile)
  )
  ipcMain.handle(
    'ck3:getDynastyData',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[]) =>
      getDynastyData(gameDir, modPath, replacePaths)
  )
  ipcMain.handle(
    'ck3:saveDynasty',
    (_e, modPath: string, file: string, id: string, patch: DynastyPatch) =>
      saveDynasty(modPath, file, id, patch)
  )
  ipcMain.handle(
    'ck3:saveHouse',
    (_e, modPath: string, file: string, id: string, patch: HousePatch) =>
      saveHouse(modPath, file, id, patch)
  )
  ipcMain.handle('ck3:listDynastyFiles', (_e, modPath: string) => listDynastyFiles(modPath))
  ipcMain.handle('ck3:createDynasty', (_e, modPath: string, file: string, def: NewDynasty) =>
    createDynasty(modPath, file, def)
  )
  ipcMain.handle('ck3:createHouse', (_e, modPath: string, file: string, def: NewHouse) =>
    createHouse(modPath, file, def)
  )
  ipcMain.handle(
    'ck3:getReligionData',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[]) =>
      getReligionData(gameDir, modPath, replacePaths)
  )
  ipcMain.handle(
    'ck3:saveFaith',
    (_e, modPath: string, file: string, religionId: string, faithId: string, patch: FaithPatch) =>
      saveFaith(modPath, file, religionId, faithId, patch)
  )
  ipcMain.handle(
    'ck3:saveReligion',
    (_e, modPath: string, file: string, religionId: string, patch: ReligionPatch) =>
      saveReligion(modPath, file, religionId, patch)
  )
  ipcMain.handle(
    'ck3:getFaithIcons',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], icons: string[]) =>
      getFaithIcons(gameDir, modPath, replacePaths, icons)
  )
  ipcMain.handle(
    'ck3:listFaithIcons',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[]) =>
      listFaithIcons(gameDir, modPath, replacePaths)
  )
  ipcMain.handle(
    'ck3:getCultureData',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[]) =>
      getCultureData(gameDir, modPath, replacePaths)
  )
  ipcMain.handle(
    'ck3:saveCulture',
    (
      _e,
      gameDir: string | null,
      modPath: string,
      replacePaths: string[],
      file: string,
      id: string,
      patch: CulturePatch
    ) => saveCulture(gameDir, modPath, replacePaths, file, id, patch)
  )
  ipcMain.handle('ck3:listCultureFiles', (_e, modPath: string) => listCultureFiles(modPath))
  ipcMain.handle(
    'ck3:createCulture',
    (_e, modPath: string, file: string, def: NewCulture) => createCulture(modPath, file, def)
  )
  ipcMain.handle(
    'ck3:getTraitIcons',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], traits: string[]) =>
      getTraitIcons(gameDir, modPath, replacePaths, traits)
  )
  ipcMain.handle(
    'ck3:getFlatIcons',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], names: string[]) =>
      getFlatIcons(gameDir, modPath, replacePaths, names)
  )
  ipcMain.handle(
    'ck3:getSkillIcons',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], skills: string[]) =>
      getSkillIcons(gameDir, modPath, replacePaths, skills)
  )
  ipcMain.handle(
    'ck3:getCoatsOfArms',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], ids: string[]) =>
      getCoatsOfArms(gameDir, modPath, replacePaths, ids)
  )
  ipcMain.handle(
    'ck3:getReferenceData',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[]) =>
      getReferenceData(gameDir, modPath, replacePaths)
  )
  ipcMain.handle(
    'ck3:locateRef',
    (_e, gameDir: string | null, modPath: string | null, replacePaths: string[], kind: RefKind, id: string) =>
      locateRef(gameDir, modPath, replacePaths, kind, id)
  )
  ipcMain.handle('ck3:validateGameDir', (_e, dir: string) => validateGameDir(dir))
  ipcMain.handle('ck3:validateModDir', (_e, dir: string) => validateModDir(dir))

  ipcMain.handle('editor:detect', () => detectEditors())
  ipcMain.handle('editor:open', (_e, file: string, line?: number) =>
    openInEditor(loadSettings().textEditorPath, file, line)
  )
  ipcMain.handle('dialog:pickEditor', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title: 'Select your text editor',
      properties: ['openFile'],
      filters: [
        { name: 'Programs', extensions: ['exe', 'cmd', 'bat'] },
        { name: 'All files', extensions: ['*'] }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('dialog:pickDirectory', async (e, title: string, kind: 'game' | 'mod') => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const result = await dialog.showOpenDialog(win!, {
      title,
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    return kind === 'game' ? normalizeGameDir(picked) : picked
  })
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
