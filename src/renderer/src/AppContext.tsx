import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppSettings, ModInfo } from '@shared/types'

interface AppContextValue {
  settings: AppSettings | null
  mods: ModInfo[]
  selectedMod: ModInfo | null
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>
  refreshMods: () => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [mods, setMods] = useState<ModInfo[]>([])

  // Initial load: read settings, auto-detect any missing paths once
  useEffect(() => {
    ;(async () => {
      let s = await window.ck3tools.getSettings()
      if (!s.gameDir || !s.modDir) {
        const detected = await window.ck3tools.detectPaths()
        const patch: Partial<AppSettings> = {}
        if (!s.gameDir && detected.gameDir) patch.gameDir = detected.gameDir
        if (!s.modDir && detected.modDir) patch.modDir = detected.modDir
        if (Object.keys(patch).length > 0) {
          s = await window.ck3tools.setSettings(patch)
        }
      }
      setSettings(s)
    })()
  }, [])

  // Reload mod list whenever the mod directory changes
  useEffect(() => {
    if (settings?.modDir) {
      window.ck3tools.listMods(settings.modDir).then(setMods)
    } else {
      setMods([])
    }
  }, [settings?.modDir])

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const next = await window.ck3tools.setSettings(patch)
    setSettings(next)
  }, [])

  const refreshMods = useCallback(async () => {
    if (settings?.modDir) {
      setMods(await window.ck3tools.listMods(settings.modDir))
    }
  }, [settings?.modDir])

  const selectedMod = mods.find((m) => m.file === settings?.selectedModFile) ?? null

  return (
    <AppContext.Provider value={{ settings, mods, selectedMod, updateSettings, refreshMods }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
