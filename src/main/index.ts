import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { loadSettings, saveSettings } from './settings'
import {
  detectPaths,
  listMods,
  normalizeGameDir,
  validateGameDir,
  validateModDir
} from './ck3'
import { listCharacters } from './characters'
import type { AppSettings } from '@shared/types'

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
  ipcMain.handle('ck3:validateGameDir', (_e, dir: string) => validateGameDir(dir))
  ipcMain.handle('ck3:validateModDir', (_e, dir: string) => validateModDir(dir))

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
